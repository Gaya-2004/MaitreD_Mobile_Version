/**
 * vapiStore.ts
 *
 * PHASES 3, 6, 7 — Vapi store with proper async tool-call handling
 *
 * Architecture:
 *   Vapi SDK fires 'message' events including 'tool-calls'.
 *   handleVapiToolCall() validates → executes via dispatcher or backend fetch → 
 *   returns result to Vapi via vapi.send({ type: 'tool-result', ... })
 *
 * This file does NOT directly query any database.
 * Backend data reads go through the mobile agent MCP endpoint.
 *
 * Transcript handling:
 *   - Real-time partial transcripts for zero lag
 *   - Final transcripts merged (same speaker → single bubble)
 *   - No duplicate bubbles
 */

import { Alert, NativeModules, Platform, PermissionsAndroid } from 'react-native';
import { create } from 'zustand';
import { executeSingleAction, setActiveRouter, navigateScreen, UIAction } from '../utils/mobileAgentActionDispatcher';
import { resolveRoute } from '../utils/agentRegistry';
import { getMobileAgentContext } from '../utils/agentContext';
import { buildMenuKeyterms, matchMenuItem, normalizeName } from '../utils/menuMatching';
import { API_BASE_URL, getFullImageUrl } from '../constants/api';
import { useAuthStore } from '../store/useAuthStore';
import { useRestaurantStore } from '../store/useRestaurantStore';
import { useLiveOrderStore } from '../store/useLiveOrderStore';
import { useAddressStore } from '../store/useAddressStore';
import { useCartStore } from './useCartStore';

// Cache executed toolCallIds to avoid duplicate execution
const executedToolCallIds = new Set<string>();

function extractToolCalls(message: any): any[] {
  if (!message) return [];

  // 1. Direct toolCallList (Vapi ServerMessageToolCalls / ClientMessageToolCalls standard)
  if (Array.isArray(message.toolCallList)) {
    return message.toolCallList;
  }

  // 2. toolCalls array
  if (Array.isArray(message.toolCalls)) {
    return message.toolCalls;
  }

  // 3. tool_calls array (OpenAI snake_case)
  if (Array.isArray(message.tool_calls)) {
    return message.tool_calls;
  }

  // 4. toolWithToolCallList array
  if (Array.isArray(message.toolWithToolCallList)) {
    return message.toolWithToolCallList.map((item: any) => item?.toolCall || item);
  }

  // 5. Singular toolCall
  if (message.toolCall && typeof message.toolCall === 'object') {
    return [message.toolCall];
  }

  // 6. function-call message type
  if (message.type === 'function-call' && message.functionCall) {
    return [{
      id: message.functionCall.id || `fn-${Date.now()}`,
      function: message.functionCall,
    }];
  }

  // 7. Singular functionCall
  if (message.functionCall && typeof message.functionCall === 'object') {
    return [{
      id: message.functionCall.id || `fn-${Date.now()}`,
      function: message.functionCall,
    }];
  }

  return [];
}

// ─── SDK Init ─────────────────────────────────────────────────────────────────
// Only the PUBLIC key is used here. Private key stays server-side.
let VapiClass: any = null;
let vapiInstance: any = null;
let listenersSetup = false;

const isWebRTCSupported = () => {
  if (Platform.OS === 'web') return false;
  return !!(
    NativeModules &&
    (NativeModules.WebRTCModule ||
      NativeModules.DailyWebRTC ||
      NativeModules.RNWebRTC)
  );
};

const getVapi = () => {
  if (!isWebRTCSupported()) {
    return null;
  }
  if (!vapiInstance) {
    if (!VapiClass) {
      try {
        const mod = require('@vapi-ai/react-native');
        VapiClass = mod.default || mod;
      } catch (e) {
        console.warn('[VapiStore] Native Vapi/WebRTC is not available in Expo Go client:', e);
        return null;
      }
    }
    try {
      if (VapiClass) {
        vapiInstance = new VapiClass(process.env.EXPO_PUBLIC_VAPI_PUBLIC_KEY || '');
      }
    } catch (e) {
      console.warn('[VapiStore] Failed to initialize Vapi instance:', e);
      return null;
    }
  }
  return vapiInstance;
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChatMessage {
  role: 'user' | 'agent' | 'assistant';
  text: string;
  isFinal?: boolean;
}

interface VapiState {
  isConnecting: boolean;
  isConnected: boolean;
  isMuted: boolean;
  messages: ChatMessage[];
  partialUserTranscript: string;
  partialAgentTranscript: string;
  startCall: () => Promise<void>;
  stopCall: () => void;
  toggleMute: () => void;
  clearMessages: () => void;
  setupListeners: (routerRef: any) => void;
  prewarm: () => void;
  notifyRouteChanged: (route: string) => void;
  sendTextMessage: (text: string) => void;
}

// ─── Backend tool executor (READ-ONLY data fetch) ─────────────────────────────

/**
 * Short-lived response cache + in-flight request dedupe.
 * Voice turns frequently repeat the same read (e.g. menu_search for the same
 * dish), and every extra network round-trip is dead air for the caller.
 */
const AGENT_TOOL_TIMEOUT_MS = 6000;
const AGENT_TOOL_CACHE_TTL: Record<string, number> = {
  menu_search: 60000,
  catering_get_data: 60000,
  customer_get_profile: 30000,
  customer_get_rewards: 30000,
};

const agentDataCache = new Map<string, { timestamp: number; data?: any; promise?: Promise<any> }>();

export function clearAgentDataCache() {
  agentDataCache.clear();
}

// Cached reads are outlet-scoped. If the user switches outlet mid-session the
// cached menu is no longer valid, so drop it immediately.
useRestaurantStore.subscribe((state: any, prevState: any) => {
  if (state?.selectedOutlet?.restaurant_id !== prevState?.selectedOutlet?.restaurant_id) {
    clearAgentDataCache();
  }
});

async function fetchAgentDataNetwork(
  toolName: string,
  args: Record<string, any>,
  restaurantIdArg?: any,
): Promise<any> {
  const auth = useAuthStore.getState();
  const restaurantState = useRestaurantStore.getState();
  let restaurantId = restaurantIdArg || restaurantState.selectedOutlet?.restaurant_id
    ? Number(restaurantIdArg || restaurantState.selectedOutlet?.restaurant_id)
    : (restaurantState.selectedOutlet?.id && !isNaN(Number(restaurantState.selectedOutlet.id))
        ? Number(restaurantState.selectedOutlet.id)
        : 1);

  if (!restaurantState.selectedOutlet) {
    restaurantState.setSelectedOutlet({
      id: 'mugalivakkam',
      restaurant_id: 1,
      name: 'Data Udipi — Mugalivakkam',
    });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), AGENT_TOOL_TIMEOUT_MS);

  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/public/mcp/mobile-agent-tool`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tool_name: toolName,
        arguments: args,
        customer_id: auth.customerId,
        phone: auth.phone,
        restaurant_id: restaurantId,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[VapiStore] Tool fetch failed ${toolName}:`, response.status, errText);
      return { error: `Failed to retrieve data (HTTP ${response.status})` };
    }

    return await response.json();
  } catch (e: any) {
    if (e?.name === 'AbortError') {
      console.warn(`[VapiStore] Tool timed out ${toolName} after ${AGENT_TOOL_TIMEOUT_MS}ms`);
      return { error: 'That took too long to load. Please try again.' };
    }
    console.error(`[VapiStore] Tool network error ${toolName}:`, e);
    return { error: 'Network error. Could not retrieve data.' };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchAgentData(toolName: string, args: Record<string, any>): Promise<any> {
  const restaurant = useRestaurantStore.getState();
  const restaurantId = restaurant.selectedOutlet?.restaurant_id;

  const ttl = AGENT_TOOL_CACHE_TTL[toolName] ?? 0;
  if (ttl <= 0) {
    return fetchAgentDataNetwork(toolName, args, restaurantId);
  }

  const cacheKey = `${toolName}|${restaurantId ?? 'none'}|${JSON.stringify(args)}`;
  const now = Date.now();
  const existing = agentDataCache.get(cacheKey);

  if (existing) {
    if (existing.data && now - existing.timestamp < ttl) {
      console.log(`[VapiStore] Tool cache hit: ${toolName}`);
      return existing.data;
    }
    // Another turn already asked for this - ride along instead of re-fetching.
    if (existing.promise) {
      console.log(`[VapiStore] Tool request deduped: ${toolName}`);
      return existing.promise;
    }
  }

  const promise = fetchAgentDataNetwork(toolName, args, restaurantId).then((data) => {
    // Never cache failures, otherwise one blip poisons the whole call.
    if (data && !data.error) {
      agentDataCache.set(cacheKey, { timestamp: Date.now(), data });
    } else {
      agentDataCache.delete(cacheKey);
    }
    return data;
  }).catch((err) => {
    agentDataCache.delete(cacheKey);
    throw err;
  });

  agentDataCache.set(cacheKey, { timestamp: now, promise });
  return promise;
}

// ─── Robust Cart Resolver Helper ─────────────────────────────────────────────

async function resolveAndAddToCart(fnArgs: any): Promise<{ success: boolean; code?: string; message: string; data?: any; [key: string]: any }> {
  const restaurantState = useRestaurantStore.getState();
  const selectedOutlet = restaurantState.selectedOutlet;

  if (!selectedOutlet) {
    restaurantState.setSelectedOutlet({
      id: 'mugalivakkam',
      restaurant_id: 1,
      name: 'Data Udipi — Mugalivakkam',
    });
  }

  const qty = Math.max(1, Number(fnArgs.quantity || fnArgs.qty || fnArgs.count || 1));
  const rawName = String(
    fnArgs.item_name ||
    fnArgs.name ||
    fnArgs.dish ||
    (typeof fnArgs.item === 'string' ? fnArgs.item : '') ||
    (fnArgs.item && typeof fnArgs.item === 'object' ? fnArgs.item.name : '') ||
    fnArgs.query ||
    ''
  ).trim();
  const rawId = fnArgs.item_id || fnArgs.id || (fnArgs.item && typeof fnArgs.item === 'object' ? fnArgs.item.id : null);

  console.log(`[VapiStore] resolveAndAddToCart: rawName="${rawName}", rawId="${rawId}", qty=${qty}`);

  // If item object was directly passed with price and id
  if (fnArgs.item && typeof fnArgs.item === 'object' && fnArgs.item.id && fnArgs.item.price != null) {
    const item = fnArgs.item;
    useCartStore.getState().addItem({
      id: Number(item.id),
      name: String(item.name),
      price: Number(item.price),
      image: getFullImageUrl(item.image || item.image_url, item.name),
      quantity: qty,
      category: String(item.category || item.category_id || 'General'),
      desc: item.desc || item.description || '',
    });
    const cartCount = useCartStore.getState().getItemCount();
    const subtotal = useCartStore.getState().getSubtotal();
    return {
      success: true,
      code: 'ITEM_ADDED',
      message: `Added ${qty}x ${item.name} to your cart. Cart now has ${cartCount} item(s) totaling ${subtotal} rupees.`,
      data: { item_id: item.id, name: item.name, quantity: qty, price: item.price }
    };
  }

  // Look for candidates from menu_search
  let candidates: any[] = [];

  // If rawId provided, check local store menuItems first
  if (rawId) {
    const localMatch = restaurantState.menuItems?.find((i: any) => String(i.id) === String(rawId));
    if (localMatch) {
      candidates = [localMatch];
    }
  }

  // If no candidate yet, search backend
  if (candidates.length === 0) {
    const searchParam = rawName || (rawId ? String(rawId) : '');
    if (!searchParam) {
      return { success: false, code: 'MISSING_ITEM', message: 'Please tell me which item you would like to add to your cart.' };
    }

    const data = await fetchAgentData('menu_search', { query: searchParam });
    if (data.menu_items && Array.isArray(data.menu_items) && data.menu_items.length > 0) {
      candidates = data.menu_items;
    } else {
      // Clean fluff words like "masala dosa please" or "two idlis to cart"
      const cleanWord = searchParam
        .replace(/\b(to cart|in cart|please|want|order|add|give|two|one|three|\d+)\b/gi, '')
        .trim();
      if (cleanWord && cleanWord !== searchParam) {
        const retryData = await fetchAgentData('menu_search', { query: cleanWord });
        if (retryData.menu_items && Array.isArray(retryData.menu_items) && retryData.menu_items.length > 0) {
          candidates = retryData.menu_items;
        }
      }
    }

    // Cross-outlet fallback search if current outlet doesn't have it
    if (candidates.length === 0) {
      try {
        const globalRes = await fetch(`${API_BASE_URL}/api/v1/public/mcp/mobile-agent-tool`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tool_name: 'menu_search',
            arguments: { query: rawName },
            restaurant_id: null,
          }),
        });
        const globalData = await globalRes.json();
        if (globalData.menu_items && Array.isArray(globalData.menu_items) && globalData.menu_items.length > 0) {
          candidates = globalData.menu_items;
        }
      } catch {}
    }
  }

  if (candidates.length === 0) {
    return {
      success: false,
      code: 'MENU_ITEM_NOT_FOUND',
      message: `I couldn't find "${rawName || rawId}" on this outlet's menu. Would you like me to open the menu for you?`
    };
  }

  // Best candidate selection
  const normTarget = rawName.toLowerCase().replace(/[^a-z0-9]/g, ' ').trim();
  let bestMatch = candidates.find((c: any) => c.name.toLowerCase().replace(/[^a-z0-9]/g, ' ').trim() === normTarget);

  if (!bestMatch && normTarget) {
    bestMatch = candidates.find((c: any) => c.name.toLowerCase().includes(normTarget) || normTarget.includes(c.name.toLowerCase()));
  }

  if (!bestMatch) {
    bestMatch = candidates[0];
  }

  // Add to cart in useCartStore
  useCartStore.getState().addItem({
    id: Number(bestMatch.id),
    name: String(bestMatch.name),
    price: Number(bestMatch.price),
    image: getFullImageUrl(bestMatch.image || bestMatch.image_url, bestMatch.name),
    quantity: qty,
    category: String(bestMatch.category || bestMatch.category_id || 'General'),
    desc: bestMatch.desc || bestMatch.description || '',
  });

  const cartTotalCount = useCartStore.getState().getItemCount();
  const subtotal = useCartStore.getState().getSubtotal();

  return {
    success: true,
    code: 'ITEM_ADDED',
    item_id: bestMatch.id,
    item_name: bestMatch.name,
    quantity: qty,
    price: bestMatch.price,
    message: `Added ${qty}x ${bestMatch.name} at ${bestMatch.price} rupees to cart. You now have ${cartTotalCount} items in cart totaling ${subtotal} rupees.`,
    data: {
      item_id: bestMatch.id,
      name: bestMatch.name,
      quantity: qty,
      price: bestMatch.price,
      cartCount: cartTotalCount,
      subtotal,
    }
  };
}

// ─── Vapi Tool Call Handler ────────────────────────────────────────────────────

async function handleVapiToolCall(tool: any): Promise<{ toolCallId: string; result: string } | null> {
  const toolCallId = tool.id || tool.toolCallId || `tool-${Date.now()}`;
  const fnName: string = tool.function?.name || tool.name || '';
  let fnArgs: Record<string, any> = {};

  const rawArgs = tool.function?.arguments ?? tool.arguments;
  if (typeof rawArgs === 'string') {
    try {
      fnArgs = JSON.parse(rawArgs);
    } catch {
      console.warn(`[VapiStore] Failed to parse tool arguments string:`, rawArgs);
      fnArgs = {};
    }
  } else if (typeof rawArgs === 'object' && rawArgs !== null) {
    fnArgs = rawArgs;
  }

  console.log(`[VapiStore] >>> Tool call received: "${fnName}"`, fnArgs);

  try {
    switch (fnName) {

      // ── App Navigation ────────────────────────────────────────────────────────

      case 'app_navigate':
      case 'navigate':
      case 'open_screen':
      case 'switch_screen': {
        const rawTarget =
          fnArgs.route ||
          fnArgs.destination ||
          fnArgs.page ||
          fnArgs.screen ||
          fnArgs.target ||
          '';

        console.log(`[VapiStore] Navigation requested for target: "${rawTarget}"`);

        // Check if destination enum implies order type (e.g. DINE_IN or TAKEAWAY)
        if (typeof rawTarget === 'string') {
          const upper = rawTarget.toUpperCase();
          if (upper.includes('DINE')) {
            useCartStore.getState().setOrderType('Dine In');
          } else if (
            upper.includes('TAKEAWAY') ||
            upper.includes('TAKE_AWAY') ||
            upper.includes('TAKE AWAY') ||
            upper.includes('PARCEL') ||
            upper.includes('PICKUP')
          ) {
            useCartStore.getState().setOrderType('Take Away');
          } else if (upper.includes('DELIVER')) {
            useCartStore.getState().setOrderType('Delivery');
          }
        }

        const resolved = resolveRoute(String(rawTarget));
        if (!resolved) {
          console.warn(`[VapiStore] Route "${rawTarget}" could not be resolved!`);
          return {
            toolCallId,
            result: JSON.stringify({
              success: false,
              code: 'ROUTE_NOT_FOUND',
              message: `Screen "${rawTarget}" is not supported.`
            })
          };
        }

        console.log(`[VapiStore] Resolved route: "${resolved}", executing navigation...`);
        const result = await executeSingleAction({
          action: 'navigate',
          route: resolved,
          payload: { params: fnArgs.params || {} },
        });

        console.log(`[VapiStore] Navigation result:`, result);
        return { toolCallId, result: JSON.stringify(result) };
      }

      case 'app_go_back':
      case 'go_back': {
        const result = await executeSingleAction({ action: 'go_back' });
        return { toolCallId, result: JSON.stringify(result) };
      }

      case 'proceed_to_checkout': {
        const result = await executeSingleAction({ action: 'show_cart' }); // show_cart navigates to checkout
        return { toolCallId, result: JSON.stringify(result) };
      }

      // ── App Context ───────────────────────────────────────────────────────────

      case 'app_get_context': {
        const context = getMobileAgentContext();
        return {
          toolCallId,
          result: JSON.stringify({ success: true, context }),
        };
      }

      // ── Order Type ────────────────────────────────────────────────────────────

      case 'set_order_type':
      case 'select_order_mode':
      case 'switch_order_type':
      case 'switch_order_mode':
      case 'switch_mode':
      case 'set_order_mode':
      case 'change_order_type':
      case 'select_order_type':
      case 'switch_to_takeaway':
      case 'switch_to_dine_in':
      case 'switch_to_delivery':
      case 'takeaway':
      case 'dine_in':
      case 'delivery': {
        let typeToSet =
          fnArgs.order_type ||
          fnArgs.orderType ||
          (fnName === 'switch_to_takeaway' || fnName === 'takeaway' ? 'Take Away' :
           fnName === 'switch_to_dine_in' || fnName === 'dine_in' ? 'Dine In' :
           fnName === 'switch_to_delivery' || fnName === 'delivery' ? 'Delivery' : undefined);

        const uiAction: UIAction = {
          action: 'set_order_type',
          order_type: typeToSet,
        };
        const result = await executeSingleAction(uiAction);
        return { toolCallId, result: JSON.stringify(result) };
      }

      // ── Menu Search ───────────────────────────────────────────────────────────

      case 'menu_search':
      case 'get_menu': {
        const restaurantState = useRestaurantStore.getState();
        const selectedOutlet = restaurantState.selectedOutlet;
        const restaurantId = selectedOutlet?.restaurant_id 
          ? Number(selectedOutlet.restaurant_id) 
          : (selectedOutlet?.id && !isNaN(Number(selectedOutlet.id)) ? Number(selectedOutlet.id) : 1);

        if (!selectedOutlet) {
          restaurantState.setSelectedOutlet({
            id: 'mugalivakkam',
            restaurant_id: 1,
            name: 'Data Udipi — Mugalivakkam',
          });
        }

        const cleanString = (value: unknown) => {
          if (typeof value !== "string") return undefined;
          const valueTrimmed = value.trim();
          return valueTrimmed.length > 0 ? valueTrimmed : undefined;
        };

        const rawQuery = cleanString(fnArgs.query);
        const rawCategory = cleanString(fnArgs.category_name) ?? cleanString(fnArgs.category);

        const isShowAll = !rawQuery || /^(all|all menus?|menu|everything|items)$/i.test(rawQuery || '');

        // Navigate screen to /menu so the user immediately sees the menu on screen!
        executeSingleAction({
          action: 'navigate',
          route: '/menu',
          payload: { params: { search: isShowAll ? '' : (rawQuery || rawCategory || '') } }
        }).catch(() => {});

        const normalizedArgs: Record<string, any> = {};
        if (rawQuery && !isShowAll) normalizedArgs.query = rawQuery;
        if (rawCategory) normalizedArgs.category_name = rawCategory;

        console.log("[VapiStore] RAW TOOL:", fnName);
        console.log("[VapiStore] CANONICAL TOOL: menu_search");
        console.log("[VapiStore] NORMALIZED ARGS:", normalizedArgs);
        console.log("[VapiStore] RESTAURANT ID:", restaurantId);

        let data = await fetchAgentData('menu_search', normalizedArgs);

        // Fallback: If category_name resulted in CATEGORY_NOT_FOUND, search by query
        if (data.code === 'CATEGORY_NOT_FOUND' && rawCategory) {
          console.log('[VapiStore] Category search failed, falling back to query search for:', rawCategory);
          data = await fetchAgentData('menu_search', { query: rawCategory });
        }

        if (data.code === 'MENU_ITEM_NOT_FOUND' && rawQuery) {
          const firstWord = rawQuery.split(/\s+/)[0];
          if (firstWord && firstWord.length > 2 && firstWord !== rawQuery) {
            data = await fetchAgentData('menu_search', { query: firstWord });
          }
        }

        console.log("[VapiStore] BACKEND RESULT:", data.success ? 'success' : 'error');
        console.log("[VapiStore] MENU ITEM COUNT:", data.count ?? (data.menu_items?.length || 0));

        // Add spoken summary for conversational TTS
        if (data.success && data.menu_items && data.menu_items.length > 0) {
          const sample = data.menu_items.slice(0, 5).map((i: any) => `${i.name} at ${i.price} rupees`).join(', ');
          data.summary = `Found ${data.count || data.menu_items.length} items. Here are some: ${sample}. I have opened the menu on your screen.`;
        }

        if (data.error && data.code) {
          return { toolCallId, result: JSON.stringify({ success: false, code: data.code, message: data.error }) };
        }

        return { toolCallId, result: JSON.stringify({ success: !data.error, ...data }) };
      }

      // ── Cart ──────────────────────────────────────────────────────────────────

      case 'open_cart':
      case 'show_cart':
      case 'view_cart':
      case 'get_cart':
      case 'cart_get':
      case 'app_get_context': {
        await executeSingleAction({ action: 'show_cart' });
        const cartState = useCartStore.getState();
        const rawItems = Object.values(cartState.items);
        const cartCount = cartState.getItemCount();
        const subtotal = cartState.getSubtotal();
        const itemsList = rawItems.map(i => ({
          id: i.id,
          name: i.name,
          quantity: i.quantity,
          price: i.price,
        }));

        let speechSummary = '';
        if (cartCount === 0) {
          speechSummary = 'Your cart is currently empty. You can ask me to add any dish to your cart!';
        } else {
          const itemNames = itemsList.map(i => `${i.quantity}x ${i.name}`).join(', ');
          speechSummary = `You have ${cartCount} items in your cart: ${itemNames}, totaling ${subtotal} rupees. I have opened your cart on screen.`;
        }

        const vapi = getVapi();
        if (vapi?.say) {
          vapi.say(speechSummary, false, false, true);
        }

        return {
          toolCallId,
          result: JSON.stringify({
            success: true,
            itemCount: cartCount,
            subtotal,
            items: itemsList,
            message: speechSummary,
            summary: speechSummary,
          }),
        };
      }

      case 'add_to_cart': {
        console.log(`[VapiStore] ADD_TO_CART REQUEST:`, fnArgs);
        const res = await resolveAndAddToCart(fnArgs);
        console.log(`[VapiStore] ADD_TO_CART RESULT:`, res);
        if (res.success) {
          const vapi = getVapi();
          if (vapi?.say) {
            vapi.say(res.message, false, false, true);
          }
        }
        return { toolCallId, result: JSON.stringify(res) };
      }

      case 'remove_from_cart': {
        const result = await executeSingleAction({
          action: 'remove_from_cart',
          menu_item_id: fnArgs.item_id,
          payload: fnArgs.item_name ? { item_name: fnArgs.item_name } : undefined,
        } as any);
        if (result.success) {
          const vapi = getVapi();
          if (vapi?.say) {
            vapi.say(result.message, false, false, true);
          }
        }
        return { toolCallId, result: JSON.stringify(result) };
      }

      case 'clear_cart': {
        const result = await executeSingleAction({ action: 'clear_cart' });
        const vapi = getVapi();
        if (vapi?.say) {
          vapi.say('I have cleared your cart.', false, false, true);
        }
        return { toolCallId, result: JSON.stringify(result) };
      }

      case 'update_cart_item': {
        const uiAction: UIAction = {
          action: 'set_cart_quantity',
          menu_item_id: fnArgs.item_id,
          quantity: fnArgs.quantity,
        };
        const result = await executeSingleAction(uiAction);
        return { toolCallId, result: JSON.stringify(result) };
      }

      case 'cart_update': {
        const subAction = fnArgs.sub_action || 'add';
        if (subAction === 'add') {
          console.log(`[VapiStore] CART_UPDATE (ADD) REQUEST:`, fnArgs);
          const res = await resolveAndAddToCart(fnArgs);
          console.log(`[VapiStore] CART_UPDATE (ADD) RESULT:`, res);
          if (res.success) {
            const vapi = getVapi();
            if (vapi?.say) {
              vapi.say(res.message, false, false, true);
            }
          }
          return { toolCallId, result: JSON.stringify(res) };
        }

        if (subAction === 'show') {
          await executeSingleAction({ action: 'show_cart' });
          const cartState = useCartStore.getState();
          const rawItems = Object.values(cartState.items);
          const cartCount = cartState.getItemCount();
          const subtotal = cartState.getSubtotal();
          const itemsList = rawItems.map(i => ({
            id: i.id,
            name: i.name,
            quantity: i.quantity,
            price: i.price,
          }));

          let speechSummary = '';
          if (cartCount === 0) {
            speechSummary = 'Your cart is currently empty.';
          } else {
            const itemNames = itemsList.map(i => `${i.quantity}x ${i.name}`).join(', ');
            speechSummary = `You have ${cartCount} items in your cart: ${itemNames}, totaling ${subtotal} rupees. I have opened your cart on screen.`;
          }

          const vapi = getVapi();
          if (vapi?.say) {
            vapi.say(speechSummary, false, false, true);
          }

          return {
            toolCallId,
            result: JSON.stringify({
              success: true,
              itemCount: cartCount,
              subtotal,
              items: itemsList,
              message: speechSummary,
              summary: speechSummary,
            }),
          };
        }

        const actionMap: Record<string, string> = {
          remove: 'remove_from_cart',
          increment: 'increment_cart_item',
          decrement: 'decrement_cart_item',
          set_quantity: 'set_cart_quantity',
          clear: 'clear_cart',
          show: 'show_cart',
        };
        const mappedAction = actionMap[subAction];
        if (!mappedAction) {
          return { toolCallId, result: JSON.stringify({ success: false, message: `Unknown cart sub_action: ${subAction}` }) };
        }

        const uiAction: UIAction = {
          action: mappedAction,
          menu_item_id: fnArgs.item_id,
          quantity: fnArgs.quantity,
          payload: fnArgs.item ? { item: fnArgs.item } : (fnArgs.item_name ? { item_name: fnArgs.item_name } : undefined),
        } as any;
        const result = await executeSingleAction(uiAction);
        return { toolCallId, result: JSON.stringify(result) };
      }

      // ── Customer Profile ──────────────────────────────────────────────────────

      case 'customer_get_profile':
      case 'open_profile':
      case 'profile':
      case 'my_profile': {
        executeSingleAction({ action: 'navigate', route: '/profile' }).catch(() => {});
        const auth = useAuthStore.getState();
        if (!auth.isAuthenticated || !auth.customerId) {
          return { toolCallId, result: JSON.stringify({ success: true, message: 'Opened profile screen. Please log in to view full profile details.' }) };
        }
        const data = await fetchAgentData('customer_get_profile', { customer_id: auth.customerId });
        return { toolCallId, result: JSON.stringify({ success: !data.error, ...data }) };
      }

      // ── Rewards ───────────────────────────────────────────────────────────────

      case 'customer_get_rewards':
      case 'open_rewards':
      case 'rewards':
      case 'loyalty_points':
      case 'my_rewards': {
        executeSingleAction({ action: 'navigate', route: '/rewards' }).catch(() => {});
        const auth = useAuthStore.getState();
        if (!auth.isAuthenticated || !auth.customerId) {
          return { toolCallId, result: JSON.stringify({ success: true, message: 'Opened loyalty points and rewards screen.' }) };
        }
        const data = await fetchAgentData('customer_get_rewards', { customer_id: auth.customerId });
        return { toolCallId, result: JSON.stringify({ success: !data.error, ...data }) };
      }

      // ── Addresses ─────────────────────────────────────────────────────────────

      case 'open_addresses':
      case 'customer_get_addresses':
      case 'get_addresses':
      case 'my_addresses':
      case 'addresses': {
        executeSingleAction({ action: 'open_addresses' }).catch(() => {});
        const addresses = useAddressStore.getState().addresses;
        return {
          toolCallId,
          result: JSON.stringify({
            success: true,
            count: addresses.length,
            addresses,
            message: `You have ${addresses.length} saved addresses. Opened your addresses screen.`
          })
        };
      }

      case 'select_address':
      case 'choose_address':
      case 'set_delivery_address': {
        const query = String(fnArgs.address || fnArgs.type || fnArgs.address_id || fnArgs.name || '').toLowerCase().trim();
        const addressStore = useAddressStore.getState();
        const addresses = addressStore.addresses;
        let matched = addresses.find(a => String(a.id) === query);
        if (!matched && query) {
          matched = addresses.find(a => 
            a.type?.toLowerCase().includes(query) || 
            a.address?.toLowerCase().includes(query) || 
            a.full_address?.toLowerCase().includes(query)
          );
        }
        if (!matched && addresses.length > 0) {
          matched = addresses[0];
        }

        if (matched) {
          addressStore.setSelectedDeliveryAddress(matched.address || matched.full_address, Number(matched.id));
          return {
            toolCallId,
            result: JSON.stringify({
              success: true,
              message: `Selected delivery address: ${matched.type} (${matched.address || matched.full_address}).`,
              data: matched
            })
          };
        }
        executeSingleAction({ action: 'open_addresses' }).catch(() => {});
        return {
          toolCallId,
          result: JSON.stringify({
            success: false,
            message: 'No matching saved address found. Opened your addresses screen.'
          })
        };
      }

      // ── Order History ─────────────────────────────────────────────────────────

      case 'customer_get_orders':
      case 'open_orders':
      case 'orders':
      case 'my_orders': {
        executeSingleAction({ action: 'navigate', route: '/(order)/orders' }).catch(() => {});
        const auth = useAuthStore.getState();
        const restaurant = useRestaurantStore.getState();
        if (!auth.isAuthenticated || !auth.phone) {
          return { toolCallId, result: JSON.stringify({ success: false, message: 'Customer is not authenticated.' }) };
        }
        const data = await fetchAgentData('customer_get_orders', {
          phone: auth.phone,
          restaurant_id: restaurant.selectedOutlet?.restaurant_id,
          limit: fnArgs.limit || 10,
        });
        return { toolCallId, result: JSON.stringify({ success: !data.error, ...data }) };
      }

      // ── Single Order ──────────────────────────────────────────────────────────

      case 'customer_get_order': {
        const auth = useAuthStore.getState();
        const restaurant = useRestaurantStore.getState();
        if (!auth.isAuthenticated) {
          return { toolCallId, result: JSON.stringify({ success: false, message: 'Customer is not authenticated.' }) };
        }

        const orderId = fnArgs.order_id || fnArgs.db_order_id || useLiveOrderStore.getState().dbOrderId;
        if (!orderId) {
          return { toolCallId, result: JSON.stringify({ success: false, message: 'No order ID provided.' }) };
        }

        const data = await fetchAgentData('customer_get_order', {
          order_id: String(orderId),
          customer_id: auth.customerId,
          phone: auth.phone,
          restaurant_id: restaurant.selectedOutlet?.restaurant_id,
        });
        return { toolCallId, result: JSON.stringify({ success: !data.error, ...data }) };
      }

      // ── Order Tracking ────────────────────────────────────────────────────────

      case 'track_order':
      case 'delivery_tracking': {
        const orderId = fnArgs.order_id || fnArgs.db_order_id || useLiveOrderStore.getState().dbOrderId;
        const result = await executeSingleAction({
          action: 'open_tracking',
          order_id: orderId ? String(orderId) : undefined,
        });
        return { toolCallId, result: JSON.stringify(result) };
      }

      case 'order_get_tracking': {
        const auth = useAuthStore.getState();
        const orderId = fnArgs.order_id || fnArgs.db_order_id || useLiveOrderStore.getState().dbOrderId;

        // Also navigate to tracking screen so the UI shows it
        if (orderId) {
          executeSingleAction({ action: 'open_tracking', order_id: String(orderId) }).catch(() => {});
        } else {
          executeSingleAction({ action: 'open_tracking' }).catch(() => {});
        }

        if (!auth.isAuthenticated) {
          return { toolCallId, result: JSON.stringify({ success: false, message: 'Customer is not authenticated.' }) };
        }

        if (!orderId) {
          return { toolCallId, result: JSON.stringify({ success: false, message: 'No active order to track.' }) };
        }

        const data = await fetchAgentData('order_get_tracking', {
          order_id: String(orderId),
          customer_id: auth.customerId,
          phone: auth.phone,
        });
        return { toolCallId, result: JSON.stringify({ success: !data.error, ...data }) };
      }

      // ── Catering ──────────────────────────────────────────────────────────────

      case 'open_catering': {
        const result = await executeSingleAction({ action: 'open_catering' });
        return { toolCallId, result: JSON.stringify(result) };
      }

      case 'select_outlet':
      case 'choose_outlet':
      case 'outlet_selector': {
        const result = await executeSingleAction({ action: 'select_outlet' });
        return { toolCallId, result: JSON.stringify(result) };
      }

      case 'catering_get_data': {
        const auth = useAuthStore.getState();
        const restaurant = useRestaurantStore.getState();
        const subType = fnArgs.data_type || 'packages';

        const data = await fetchAgentData('catering_get_data', {
          data_type: subType,
          customer_id: auth.customerId,
          restaurant_id: restaurant.selectedOutlet?.restaurant_id,
          catering_order_id: fnArgs.catering_order_id,
        });
        return { toolCallId, result: JSON.stringify({ success: !data.error, ...data }) };
      }

      // ── Confirmation & Platform Tools ─────────────────────────────────────────

      case 'app_confirm_action': {
        // This is handled conversationally by Vapi itself — no client action needed.
        return {
          toolCallId,
          result: JSON.stringify({
            success: true,
            message: 'Confirmation state acknowledged. Awaiting customer response.',
          }),
        };
      }

      case 'update_customer_info': {
        // Populate safe frontend state; do NOT mutate DB directly.
        if (fnArgs.name) await executeSingleAction({ action: 'set_signup_name', name: fnArgs.name });
        if (fnArgs.phone) await executeSingleAction({ action: 'set_signup_phone', phone: fnArgs.phone });
        return { toolCallId, result: JSON.stringify({ success: true, message: 'Frontend info updated.' }) };
      }

      case 'select_payment_method': {
        return { toolCallId, result: JSON.stringify({ success: false, message: 'Please use the app checkout screen to complete payment.' }) };
      }

      case 'place_order': {
        return { toolCallId, result: JSON.stringify({ success: false, message: 'Please use proceed_to_checkout and confirm your order in the app.' }) };
      }

      case 'mcp_tool':
      case 'voicemail_tool':
      case 'end_call_tool': {
        // These are Vapi platform-managed tools. Do not intercept or fake success.
        return null;
      }

      // ── Unknown Tool ──────────────────────────────────────────────────────────

      default: {
        console.warn(`[VapiStore] Unknown tool call rejected: "${fnName}"`);
        return {
          toolCallId,
          result: JSON.stringify({ success: false, code: 'UNKNOWN_TOOL', requested_tool: fnName, message: `Unsupported application tool.` }),
        };
      }
    }
  } catch (e: any) {
    console.error(`[VapiStore] Error handling tool "${fnName}":`, e);
    return {
      toolCallId,
      result: JSON.stringify({ success: false, message: `Internal error: ${e?.message || 'Unknown'}` }),
    };
  }
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useVapiStore = create<VapiState>((set, get) => ({
  isConnecting: false,
  isConnected: false,
  isMuted: false,
  messages: [],
  partialUserTranscript: '',
  partialAgentTranscript: '',

  startCall: async () => {
    const assistantId = process.env.EXPO_PUBLIC_VAPI_ASSISTANT_ID;
    if (!assistantId) {
      Alert.alert(
        'Voice Assistant Setup',
        'Vapi Assistant ID is missing. Please configure EXPO_PUBLIC_VAPI_ASSISTANT_ID in your environment variables.'
      );
      set({ isConnecting: false });
      return;
    }

    // Reflect intent immediately so the UI never looks frozen while we set up.
    set({ isConnecting: true });

    if (Platform.OS === 'android') {
      try {
        // check() is a cheap no-UI lookup; only fall back to the (slow) request
        // dialog when permission has not been granted yet.
        const alreadyGranted = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO
        );

        if (!alreadyGranted) {
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
            {
              title: "Microphone Permission",
              message: "The Voice Assistant needs access to your microphone.",
              buttonNeutral: "Ask Me Later",
              buttonNegative: "Cancel",
              buttonPositive: "OK"
            }
          );
          if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
            Alert.alert("Permission Denied", "Microphone access is required to use the Voice Assistant.");
            set({ isConnecting: false });
            return;
          }
        }
      } catch (err) {
        console.warn(err);
      }
    }

    const vapi = getVapi();
    if (!vapi) {
      Alert.alert(
        'Voice Assistant',
        'Voice calls require custom native WebRTC (Development Build / APK). Other app features work normally in Expo Go.'
      );
      set({ isConnecting: false });
      return;
    }
    const { messages } = get();
    const hasHistory = messages.filter((m) => m.isFinal && m.text).length > 0;

    // Dynamic first message based on auth and restaurant state
    const auth = useAuthStore.getState();
    const restaurant = useRestaurantStore.getState();
    const isLoggedIn = auth.isAuthenticated && auth.phone;
    const hasOutlet = !!restaurant.selectedOutlet;

    let dynamicFirstMessage = "Welcome to Data Udipi! I'm your voice assistant.";
    
    if (hasHistory) {
      dynamicFirstMessage = "I'm back. Let's continue.";
    } else if (!isLoggedIn) {
      dynamicFirstMessage = "Welcome to Data Udipi! I'm your voice assistant. To get started, could you please tell me your phone number?";
    } else if (!hasOutlet) {
      dynamicFirstMessage = "Welcome back to Data Udipi! We have exciting delicious menu varieties and category items. Which outlet would you like to order from today?";
    } else {
      dynamicFirstMessage = "Welcome back to Data Udipi! We have exciting delicious menu varieties and category items. Which items would you prefer today?";
    }

    const overrides = { 
      firstMessage: dynamicFirstMessage, 
      maxDurationSeconds: 3600, // 1 hour max duration so it doesn't time out easily
    };

    try {
      vapi.start(assistantId, overrides);
    } catch (e) {
      console.warn('[VapiStore] startCall error:', e);
      set({ isConnecting: false });
    }
  },

  stopCall: () => {
    getVapi()?.stop();
    set({
      isConnected: false,
      isConnecting: false,
      partialUserTranscript: '',
      partialAgentTranscript: '',
    });
  },

  toggleMute: () => {
    const currentState = get().isMuted;
    const vapi = getVapi();
    if (vapi?.setMuted) {
      vapi.setMuted(!currentState);
    }
    set({ isMuted: !currentState });
  },

  clearMessages: () => {
    set({ messages: [], partialUserTranscript: '', partialAgentTranscript: '' });
  },

  /**
   * Loads the native Vapi SDK ahead of time so the first tap doesn't pay for
   * the module require + client construction. Safe to call repeatedly.
   */
  prewarm: () => {
    if (vapiInstance) return;
    const warm = () => {
      try {
        getVapi();
      } catch (e) {
        console.warn('[VapiStore] prewarm skipped:', e);
      }
    };
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(warm);
    } else {
      setTimeout(warm, 0);
    }
  },

  notifyRouteChanged: (route: string) => {
    const vapi = getVapi();
    if (vapi && get().isConnected) {
      try {
        (vapi as any).send({
          type: 'add-message',
          message: {
            role: 'system',
            content: `[System Update] The user has navigated to screen: ${route}`
          }
        });
      } catch (e) {
        console.warn('[VapiStore] Failed to notify route change:', e);
      }
    }
  },

  sendTextMessage: (text: string) => {
    if (!text || !text.trim()) return;
    const trimmed = text.trim();
    const vapi = getVapi();

    // Optimistically add user message to transcript
    set((state) => ({
      messages: [...state.messages, { role: 'user', text: trimmed, isFinal: true }],
      partialUserTranscript: '',
    }));

    if (vapi && get().isConnected) {
      try {
        (vapi as any).send({
          type: 'add-message',
          message: {
            role: 'user',
            content: trimmed,
          },
        });
      } catch (e) {
        console.warn('[VapiStore] Failed to send user message to vapi:', e);
      }
    }
  },

  setupListeners: (routerRef) => {
    if (routerRef) {
      setActiveRouter(routerRef);
    }
    if (listenersSetup) return;
    const vapi = getVapi();
    if (!vapi) return;
    listenersSetup = true;

    vapi.on('call-start', () => {
      set({ isConnected: true, isConnecting: false });

      // Warm the menu cache in the background so the first food request does
      // not stall on a cold network fetch.
      const outletId = useRestaurantStore.getState().selectedOutlet?.restaurant_id;
      const hasLocalMenu = (useRestaurantStore.getState().menuItems || []).length > 0;
      if (outletId && !hasLocalMenu) {
        fetchAgentData('menu_search', {}).catch(() => {});
      }

      // Inject current app context on call start
      try {
        const initialContext = getMobileAgentContext();
        (vapi as any).send({
          type: 'add-message',
          message: {
            role: 'system',
            content: `[Current App Context] Order Type: ${initialContext.cart.orderType}. Outlet: ${initialContext.restaurant.selectedOutletName || 'None'}. Cart Items: ${initialContext.cart.itemCount}. If customer asks to switch to takeaway, dine in, or delivery, you can use set_order_type ("Take Away", "Dine In", "Delivery").`
          }
        });
      } catch (e) {
        console.warn('[VapiStore] Could not inject initial context:', e);
      }

      // Inject previous context if this is a resumed conversation
      const { messages } = get();
      const pastMessages = messages.filter((m) => m.isFinal && m.text);
      if (pastMessages.length > 0) {
        const transcript = pastMessages.map((m) => `${m.role.toUpperCase()}: ${m.text}`).join('\n');
        try {
          (vapi as any).send({
            type: 'add-message',
            message: {
              role: 'system',
              content: `The call was briefly disconnected. Here is the transcript of what was said right before you reconnected:\n\n${transcript}\n\nContinue seamlessly from where you left off. Do not repeat your initial greeting.`
            }
          });
        } catch (e) {
          console.warn('[VapiStore] Could not inject history:', e);
        }
      }
    });

    vapi.on('call-end', () => {
      set({
        isConnected: false,
        isConnecting: false,
        partialUserTranscript: '',
        partialAgentTranscript: '',
      });
    });

    vapi.on('message', async (message: any) => {
      if (!message) return;

      console.log(`[VapiStore] Incoming Vapi message: "${message.type || 'unknown'}"`);

      // ── Tool Call Extraction & Execution ──────────────────────────────────────
      const toolCalls = extractToolCalls(message);
      if (toolCalls && toolCalls.length > 0) {
        console.log(`[VapiStore] Processing ${toolCalls.length} tool call(s) from message type "${message.type}"...`);

        const sendToolResult = (result: { toolCallId: string; result: string } | null) => {
          if (!result || !result.toolCallId) return;
          try {
            // 1. Send system message to explicitly update LLM conversation memory
            try {
              const parsed = JSON.parse(result.result);
              (vapi as any).send({
                type: 'add-message',
                message: {
                  role: 'system',
                  content: `[Confirmed System Action] ${parsed.message || result.result}`,
                },
              });
            } catch {}

            // 2. Also send tool-call result message
            (vapi as any).send({
              type: 'add-message',
              message: {
                role: 'tool',
                tool_call_id: result.toolCallId,
                content: result.result,
              },
            });
          } catch (e) {
            console.warn('[VapiStore] Result feedback via vapi.send notice:', e);
          }
        };

        const pending = toolCalls.filter((tool: any) => {
          const toolCallId = tool.id || tool.toolCallId;
          if (toolCallId && executedToolCallIds.has(toolCallId)) {
            console.log(`[VapiStore] Skipping already executed toolCallId: ${toolCallId}`);
            return false;
          }
          if (toolCallId) {
            executedToolCallIds.add(toolCallId);
            setTimeout(() => executedToolCallIds.delete(toolCallId), 120000);
          }
          return true;
        });

        // Run tool calls concurrently and stream each result back the moment it
        // resolves, instead of making the assistant wait for the slowest one.
        await Promise.all(
          pending.map(async (tool: any) => {
            try {
              const res = await handleVapiToolCall(tool);
              sendToolResult(res);
            } catch (e) {
              console.error('[VapiStore] Tool execution failed:', e);
            }
          })
        );
      }

      // ── Transcript handling: real-time partial + merged final ────────────────

      if (message.type === 'transcript') {
        const text: string = message.transcript || '';
        const role: string = message.role || 'user';

        if (role === 'user' && text) {
          const lower = text.toLowerCase().trim();

          // 1. Order Mode Switches (Takeaway / Dine In / Delivery)
          if (
            /\b(switch|change|set|make|select|turn|go|put)\b.*\b(takeaway|take away|take out|parcel|pickup)\b/i.test(lower) ||
            /^(switch to |change to )?(takeaway|take away)(\s*(please|mode|option))?$/i.test(lower)
          ) {
            if (useCartStore.getState().orderType !== 'Take Away') {
              console.log('[VapiStore] Speech detected intent: switch to takeaway');
              useCartStore.getState().setOrderType('Take Away');
              try {
                (vapi as any).send({
                  type: 'add-message',
                  message: {
                    role: 'system',
                    content: '[System Update] The user switched order mode to Take Away. App UI has been updated to Takeaway.'
                  }
                });
              } catch {}
            }
          } else if (
            /\b(switch|change|set|make|select|turn|go|put)\b.*\b(dine in|dine-in|dinein|table)\b/i.test(lower) ||
            /^(switch to |change to )?(dine in|dine-in)(\s*(please|mode|option))?$/i.test(lower)
          ) {
            if (useCartStore.getState().orderType !== 'Dine In') {
              console.log('[VapiStore] Speech detected intent: switch to dine in');
              useCartStore.getState().setOrderType('Dine In');
              try {
                (vapi as any).send({
                  type: 'add-message',
                  message: {
                    role: 'system',
                    content: '[System Update] The user switched order mode to Dine In. App UI has been updated to Dine-in.'
                  }
                });
              } catch {}
            }
          } else if (
            /\b(switch|change|set|make|select|turn|go|put)\b.*\b(delivery|deliver|home delivery)\b/i.test(lower) ||
            /^(switch to |change to )?(delivery)(\s*(please|mode|option))?$/i.test(lower)
          ) {
            if (useCartStore.getState().orderType !== 'Delivery') {
              console.log('[VapiStore] Speech detected intent: switch to delivery');
              useCartStore.getState().setOrderType('Delivery');
              try {
                (vapi as any).send({
                  type: 'add-message',
                  message: {
                    role: 'system',
                    content: '[System Update] The user switched order mode to Delivery. App UI has been updated to Delivery.'
                  }
                });
              } catch {}
            }
          }
          // 2. Menu Navigation ("show all the menus", "show menu", "open menu", "view menu")
          else if (
            /\b(show|open|view|see|go to|take me to|display)\b.*\b(menu|menus|all the menu|all menus|items)\b/i.test(lower) ||
            /\b(all the menus|show menu|browse menu|food menu)\b/i.test(lower) ||
            /^(menu|the menu|show all the menus)$/i.test(lower)
          ) {
            console.log('[VapiStore] Speech detected intent: show all menus');
            navigateScreen('/menu');
          }
          // 3. Profile Navigation ("open profile", "show profile", "my account")
          else if (
            /\b(show|open|view|go to|take me to)\b.*\b(profile|account|my profile|my account)\b/i.test(lower) ||
            /^(profile|my profile|my account)$/i.test(lower)
          ) {
            console.log('[VapiStore] Speech detected intent: open profile');
            navigateScreen('/profile');
          }
          // 4. Rewards / Loyalty Points ("loyalty points", "rewards", "my points")
          else if (
            /\b(reward|rewards|loyalty|loyalty point|loyalty points|my points|points balance)\b/i.test(lower) ||
            /^(rewards|loyalty points)$/i.test(lower)
          ) {
            console.log('[VapiStore] Speech detected intent: open rewards');
            navigateScreen('/rewards');
          }
          // 5. Addresses ("show addresses", "my address", "select address")
          else if (
            /\b(address|addresses|delivery address|saved address)\b/i.test(lower)
          ) {
            console.log('[VapiStore] Speech detected intent: address handling');
            if (/\b(home)\b/i.test(lower)) {
              executeSingleAction({ action: 'select_address', payload: { address: 'home' } } as any);
            } else if (/\b(work|office)\b/i.test(lower)) {
              executeSingleAction({ action: 'select_address', payload: { address: 'work' } } as any);
            } else {
              navigateScreen('/(address)/my-addresses');
            }
          }
          // 6. Orders / History ("show orders", "order history", "past orders")
          else if (
            /\b(show|open|view|my|past)\b.*\b(orders|order history)\b/i.test(lower) ||
            /^(orders|my orders|order history)$/i.test(lower)
          ) {
            console.log('[VapiStore] Speech detected intent: open orders');
            navigateScreen('/(order)/orders');
          }
          // 7. Cart / Checkout ("show cart", "view cart", "open cart", "checkout")
          else if (
            /\b(show|open|view|go to|take me to)\b.*\b(cart|basket|checkout)\b/i.test(lower) ||
            /^(cart|view cart|open cart|checkout)$/i.test(lower)
          ) {
            console.log('[VapiStore] Speech detected intent: open cart');
            navigateScreen('/(checkout)/checkout');
          }
        }

        if (message.transcriptType === 'partial') {
          if (role === 'user') {
            set({ partialUserTranscript: text });
          } else {
            set({ partialAgentTranscript: text });
          }
        } else if (message.transcriptType === 'final') {
          set((state) => {
            if (!text.trim()) return state;

            const newMessages = [...state.messages];
            const lastMessage = newMessages[newMessages.length - 1];

            // Merge consecutive messages from the same speaker (no split bubbles)
            if (lastMessage && lastMessage.role === role) {
              newMessages[newMessages.length - 1] = {
                ...lastMessage,
                text: lastMessage.text + ' ' + text,
              };
            } else {
              newMessages.push({ role: role as any, text, isFinal: true });
            }

            return {
              messages: newMessages,
              partialUserTranscript: role === 'user' ? '' : state.partialUserTranscript,
              partialAgentTranscript:
                role === 'assistant' || role === 'agent' ? '' : state.partialAgentTranscript,
            };
          });
        }
      }
    });

    vapi.on('error', (e: any) => {
      console.error('[VapiStore] Vapi error:', e);
      set({ isConnected: false, isConnecting: false });
    });
  },
}));
