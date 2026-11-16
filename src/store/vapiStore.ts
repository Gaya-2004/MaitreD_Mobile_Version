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

import { Alert, DeviceEventEmitter, NativeModules, PermissionsAndroid, Platform } from 'react-native';
import { create } from 'zustand';
import { API_BASE_URL, getFullImageUrl } from '../constants/api';
import { orderApi } from '../services/apiService';
import { useAddressStore } from '../store/useAddressStore';
import { useAuthStore } from '../store/useAuthStore';
import { useLiveOrderStore } from '../store/useLiveOrderStore';
import { useOrderStore } from '../store/useOrderStore';
import { useRestaurantStore } from '../store/useRestaurantStore';
import { getMobileAgentContext } from '../utils/agentContext';
import { resolveRoute } from '../utils/agentRegistry';
import { executeSingleAction, getActiveRouter, navigateScreen, setActiveRouter, UIAction } from '../utils/mobileAgentActionDispatcher';
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
  if (Platform.OS === 'web') return true;
  return !!(
    NativeModules &&
    (NativeModules.WebRTCModule ||
      NativeModules.DailyWebRTC ||
      NativeModules.RNWebRTC)
  );
};

const getVapi = () => {
  if (!vapiInstance) {
    if (!VapiClass) {
      try {
        if (Platform.OS === 'web') {
          const mod = require('@vapi-ai/web');
          VapiClass = mod.default || mod;
        } else {
          if (!isWebRTCSupported()) {
            console.warn('[VapiStore] Native WebRTC module is not available in Expo Go. A development build or standalone build is required.');
            return null;
          }
          const mod = require('@vapi-ai/react-native');
          VapiClass = mod.default || mod;
        }
      } catch (e) {
        console.warn('[VapiStore] Vapi SDK is not available:', e);
        return null;
      }
    }
    try {
      if (VapiClass) {
        const pubKey = process.env.EXPO_PUBLIC_VAPI_PUBLIC_KEY || '284fef39-2d93-4de5-881b-a082dacca5b1';
        vapiInstance = new VapiClass(pubKey);
      }
    } catch (e) {
      console.warn('[VapiStore] Failed to initialize Vapi instance:', e);
      return null;
    }
  }
  return vapiInstance;
};

// ─── Types ────────────────────────────────────────────────────────────────────

export type AgentState =
  | 'IDLE'
  | 'LISTENING'
  | 'PROCESSING'
  | 'SPEAKING'
  | 'EXECUTING_ACTION'
  | 'WAITING_FOR_CONFIRMATION'
  | 'ERROR';

export interface ChatMessage {
  id?: string;
  role: 'user' | 'agent' | 'assistant';
  text: string;
  isFinal?: boolean;
}

export interface VapiState {
  agentState: AgentState;
  isConnecting: boolean;
  isConnected: boolean;
  isMuted: boolean;
  messages: ChatMessage[];
  partialUserTranscript: string;
  partialAgentTranscript: string;
  isTamilMode: boolean;
  startCall: () => Promise<void>;
  stopCall: () => void;
  toggleMute: () => void;
  toggleLanguage: () => void;
  stopSpeaking: () => void;
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
      id: '1',
      restaurant_id: 1,
      name: 'MaitreD Restaurant',
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


const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};
const KNOWN_NUMBERED_DISHES = new Set(['65', '77', '99']);

export function extractDishesAndQuantities(text: string): { name: string; quantity: number }[] {
  if (!text || typeof text !== 'string') return [];
  const results: { name: string; quantity: number }[] = [];
  let cleaned = text.replace(/[\r\n]+/g, ' ').trim();

  // Strip introductory prefixes
  cleaned = cleaned.replace(
    /^(?:here'?s\s+your\s+current\s+cart[^:]*?:\s*|i\s+have\s+added[^:]*?:\s*|i'?ve\s+added[^:]*?:\s*|your\s+current\s+cart[^:]*?:\s*|cart\s+currently\s+includes:?\s*)/i,
    ''
  );

  // Convert word numbers (e.g. "one chicken biryani" -> "1 chicken biryani")
  for (const [word, num] of Object.entries(NUMBER_WORDS)) {
    const rx = new RegExp(`\\b${word}\\b`, 'gi');
    cleaned = cleaned.replace(rx, String(num));
  }

  // Semicolon-delimited list (assistant summary format)
  if (cleaned.includes(';')) {
    const parts = cleaned.split(';').map(p => p.trim()).filter(Boolean);
    for (const part of parts) {
      let p = part.replace(/^\d+[\)\.]\s*/, '').trim();
      p = p.replace(/^(?:and\s+)?(?:please\s+add|add|also\s+add)\s+/i, '').trim();
      p = p.replace(/^and\s+/i, '').trim();

      const m = p.match(/^(.+?)(?:,\s*|\s+)(\d+)$/);
      if (m && (!KNOWN_NUMBERED_DISHES.has(m[2]) || p.includes(','))) {
        results.push({ name: m[1].replace(/[.,?!]+$/, '').trim(), quantity: parseInt(m[2], 10) });
      } else {
        const m2 = p.match(/^(\d+)\s+(.+)$/);
        if (m2) {
          results.push({ name: m2[2].replace(/[.,?!]+$/, '').trim(), quantity: parseInt(m2[1], 10) });
        } else if (p.length > 2 && !/^your\b/i.test(p)) {
          results.push({ name: p.replace(/[.,?!]+$/, '').trim(), quantity: 1 });
        }
      }
    }
    if (results.length > 0) return results;
  }

  // General split on 'and', comma, period, or sentence boundary
  const parts = cleaned.split(/\s+and\s+|,\s*|\.\s*/i);
  for (const part of parts) {
    let p = part.trim();
    p = p.replace(/^(?:i\s+have\s+already\s+ordered[^.]*?\.\s*)?(?:to\s+that\s+order\s*,?\s*)?(?:please\s+add|add|also\s+add|can\s+you\s+please\s+add|could\s+you\s+add|i\s+want\s+to\s+add|i\s+want)\s+/i, '').trim();
    p = p.replace(/^and\s+/i, '').trim();
    p = p.replace(/\s+(?:to\s+(?:the\s+)?cart|in\s+(?:the\s+)?cart|into\s+(?:the\s+)?cart|has\s+been\s+added\s+to\s+your\s+cart)[.?!]*$/i, '').trim();

    if (!p || p.length <= 2) continue;

    // "qty name" e.g. "1 chicken biryani"
    const m1 = p.match(/^(\d+)\s+(.+)$/);
    if (m1) {
      results.push({ name: m1[2].replace(/[.,?!]+$/, '').trim(), quantity: parseInt(m1[1], 10) });
      continue;
    }

    // "name qty" e.g. "chicken chukka 1", ensuring qty is NOT 65
    const m2 = p.match(/^(.+?)\s+(\d+)$/);
    if (m2 && !KNOWN_NUMBERED_DISHES.has(m2[2])) {
      results.push({ name: m2[1].replace(/[.,?!]+$/, '').trim(), quantity: parseInt(m2[2], 10) });
      continue;
    }

    const pClean = p.replace(/[.,?!]+$/, '').trim();
    if (pClean.length > 2 && !/\b(order|change|cart|items|status|dine-in|delivery|takeaway)\b/i.test(pClean)) {
      results.push({ name: pClean, quantity: 1 });
    }
  }

  return results;
}

// ─── Robust Cart Resolver Helper ─────────────────────────────────────────────

async function resolveAndAddToCart(fnArgs: any): Promise<{ success: boolean; code?: string; message: string; data?: any;[key: string]: any }> {
  const restaurantState = useRestaurantStore.getState();
  const selectedOutlet = restaurantState.selectedOutlet;

  if (!selectedOutlet) {
    restaurantState.setSelectedOutlet({
      id: '1',
      restaurant_id: 1,
      name: 'MaitreD Restaurant',
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

  // Check if rawName contains multiple compound items
  const compoundItems = extractDishesAndQuantities(rawName);
  if (compoundItems.length > 1) {
    const results: any[] = [];
    for (const item of compoundItems) {
      const res = await resolveAndAddToCart({ item_name: item.name, quantity: item.quantity });
      results.push(res);
    }
    const allSucceeded = results.some(r => r.success);
    const cartCount = useCartStore.getState().getItemCount();
    const subtotal = useCartStore.getState().getSubtotal();
    return {
      success: allSucceeded,
      code: allSucceeded ? 'ITEMS_ADDED' : 'ITEMS_FAILED',
      message: `Added items to your cart. Cart now has ${cartCount} item(s) totaling ${subtotal} rupees.`,
      data: results
    };
  }

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
      } catch { }
    }
  }

  if (candidates.length === 0) {
    console.log(`[VapiStore] Menu search found no match for "${rawName}". Not adding to cart.`);
    return {
      success: false,
      code: 'ITEM_NOT_FOUND',
      message: `Sorry, "${rawName}" is not available on our menu. Please check the menu for available items.`,
    };
  }

  // Best candidate selection: require a genuine match
  const normTarget = rawName.toLowerCase().replace(/[^a-z0-9]/g, ' ').trim();
  let bestMatch = candidates.find((c: any) => c.name.toLowerCase().replace(/[^a-z0-9]/g, ' ').trim() === normTarget);

  if (!bestMatch && normTarget) {
    bestMatch = candidates.find((c: any) => {
      const cNorm = c.name.toLowerCase().replace(/[^a-z0-9]/g, ' ').trim();
      return cNorm.includes(normTarget) || normTarget.includes(cNorm);
    });
  }

  // Also check individual significant words (e.g. "biryani" in "Chicken Biryani")
  if (!bestMatch && normTarget.length >= 4) {
    const words = normTarget.split(/\s+/).filter(w => w.length >= 4);
    if (words.length > 0) {
      bestMatch = candidates.find((c: any) => {
        const cNorm = c.name.toLowerCase();
        return words.every(w => cNorm.includes(w));
      });
    }
  }

  if (!bestMatch) {
    console.log(`[VapiStore] No accurate menu match found for "${rawName}". Not adding to cart.`);
    return {
      success: false,
      code: 'ITEM_NOT_FOUND',
      message: `I could not find "${rawName}" on our menu. Would you like to check the menu?`,
    };
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

      case 'dine_in_action': {
        const subAction = String(fnArgs.action || fnArgs.type || fnArgs.mode || '').toLowerCase();
        if (subAction.includes('later')) {
          navigateScreen('/(order)/orders');
          return {
            toolCallId,
            result: JSON.stringify({ success: true, message: 'Dine-in order placed with Pay Later.' }),
          };
        } else if (subAction.includes('bill') || subAction.includes('pay')) {
          navigateScreen('/(checkout)/payment');
          return {
            toolCallId,
            result: JSON.stringify({ success: true, message: 'Opened bill payment screen.' }),
          };
        } else {
          navigateScreen('/(main)/menu');
          return {
            toolCallId,
            result: JSON.stringify({ success: true, message: 'Opened menu to order more items.' }),
          };
        }
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

      case 'open_category':
      case 'filter_category':
      case 'open_variety':
      case 'menu_search':
      case 'menu_get_data':
      case 'get_menu': {
        const restaurantState = useRestaurantStore.getState();
        const selectedOutlet = restaurantState.selectedOutlet;
        const restaurantId = selectedOutlet?.restaurant_id
          ? Number(selectedOutlet.restaurant_id)
          : (selectedOutlet?.id && !isNaN(Number(selectedOutlet.id)) ? Number(selectedOutlet.id) : 1);

        if (!selectedOutlet) {
          restaurantState.setSelectedOutlet({
            id: '1',
            restaurant_id: 1,
            name: 'MaitreD Restaurant',
          });
        }

        const cleanString = (value: unknown) => {
          if (typeof value !== "string") return undefined;
          const valueTrimmed = value.trim();
          return valueTrimmed.length > 0 ? valueTrimmed : undefined;
        };

        const rawCategory = cleanString(fnArgs.category_name) ?? cleanString(fnArgs.category) ?? cleanString(fnArgs.variety) ?? cleanString(fnArgs.header);
        const rawRegion = cleanString(fnArgs.region);
        const rawQuery = cleanString(fnArgs.query);

        const target = rawCategory || rawQuery || '';
        const isShowAll = !target || /^(all|all menus?|menu|everything|items)$/i.test(target);

        // Check if target is a Region header
        const lowerTarget = target.toLowerCase();
        let targetRegion: string | undefined = rawRegion;
        let targetCategory: string | undefined = rawCategory;

        if (lowerTarget.includes('south') || lowerTarget.includes('dosa') || lowerTarget.includes('idly') || lowerTarget.includes('breakfast') || lowerTarget.includes('vada')) {
          targetRegion = 'South Indian';
          if (lowerTarget.includes('south')) targetCategory = 'all';
        } else if (lowerTarget.includes('north') || lowerTarget.includes('naan') || lowerTarget.includes('roti') || lowerTarget.includes('tandoori') || lowerTarget.includes('kulcha') || lowerTarget.includes('salad') || lowerTarget.includes('raitha')) {
          targetRegion = 'North Indian';
          if (lowerTarget.includes('north')) targetCategory = 'all';
        } else if (
          lowerTarget.includes('non-veg') ||
          lowerTarget.includes('non veg') ||
          lowerTarget.includes('nonveg') ||
          lowerTarget.includes('chicken') ||
          lowerTarget.includes('mutton') ||
          lowerTarget.includes('fish') ||
          lowerTarget.includes('prawn') ||
          lowerTarget.includes('seafood') ||
          lowerTarget.includes('biryani') ||
          lowerTarget.includes('egg')
        ) {
          targetRegion = 'Non-Veg Varieties';
          if (lowerTarget.includes('non-veg') || lowerTarget.includes('non veg') || lowerTarget.includes('nonveg')) targetCategory = 'all';
        }

        console.log(`[VapiStore] Navigating menu: target="${target}", category="${targetCategory}", region="${targetRegion}"`);

        // Instant UI update for open menu screen
        DeviceEventEmitter.emit('menu_filter_header', {
          category: targetCategory || (isShowAll ? 'all' : target),
          region: targetRegion || (isShowAll ? 'All Regions' : undefined),
          search: (!targetCategory && !targetRegion && rawQuery && !isShowAll) ? rawQuery : ''
        });

        // Navigate screen to /menu
        executeSingleAction({
          action: 'navigate',
          route: '/menu',
          payload: {
            params: {
              categoryName: targetCategory || (isShowAll ? 'all' : target),
              region: targetRegion || (isShowAll ? 'All Regions' : undefined),
              search: (!targetCategory && !targetRegion && rawQuery && !isShowAll) ? rawQuery : ''
            }
          }
        }).catch(() => { });

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
          data.summary = `Found ${data.count || data.menu_items.length} items. Here are some: ${sample}. I have opened ${target || 'the menu'} on your screen.`;
        } else {
          data.summary = `Opened ${target || 'the menu'} on your screen.`;
        }

        if (data.error && data.code) {
          return { toolCallId, result: JSON.stringify({ success: false, code: data.code, message: data.error }) };
        }

        return { toolCallId, result: JSON.stringify({ success: true, ...data }) };
      }

      // ── Cart ──────────────────────────────────────────────────────────────────

      case 'open_cart':
      case 'show_cart':
      case 'view_cart':
      case 'get_cart':
      case 'cart_get': {
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
        executeSingleAction({ action: 'navigate', route: '/profile' }).catch(() => { });
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
        executeSingleAction({ action: 'navigate', route: '/rewards' }).catch(() => { });
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
        executeSingleAction({ action: 'open_addresses' }).catch(() => { });
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
        executeSingleAction({ action: 'open_addresses' }).catch(() => { });
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
        executeSingleAction({ action: 'navigate', route: '/(order)/orders' }).catch(() => { });
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
          executeSingleAction({ action: 'open_tracking', order_id: String(orderId) }).catch(() => { });
        } else {
          executeSingleAction({ action: 'open_tracking' }).catch(() => { });
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

      case 'catering_choose_package': {
        const pkgName = fnArgs.package_name || fnArgs.name || fnArgs.package || 'Standard Package';
        navigateScreen('/(main)/catering-event-details', { package: pkgName });
        return {
          toolCallId,
          result: JSON.stringify({ success: true, message: `Selected ${pkgName} catering package.` }),
        };
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
        const cartState = useCartStore.getState();
        const rawItems = Object.values(cartState.items || {});
        if (rawItems.length === 0) {
          const emptyMsg = 'Your cart is currently empty. Please tell me which dishes you would like to order.';
          const vapi = getVapi();
          if (vapi?.say) vapi.say(emptyMsg, false, false, true);
          return { toolCallId, result: JSON.stringify({ success: false, message: emptyMsg }) };
        }

        const restaurantState = useRestaurantStore.getState();
        const authState = useAuthStore.getState();
        const addressState = useAddressStore.getState();
        const restId = restaurantState.selectedOutlet?.restaurant_id
          ? Number(restaurantState.selectedOutlet.restaurant_id)
          : (restaurantState.selectedOutlet?.id && !isNaN(Number(restaurantState.selectedOutlet.id)) ? Number(restaurantState.selectedOutlet.id) : 1);

        const currentOrderType = cartState.orderType || 'Take Away';
        let backendOrderType = 'TAKEAWAY';
        if (currentOrderType === 'Dine In') backendOrderType = 'DINE_IN';
        else if (currentOrderType === 'Delivery') backendOrderType = 'DELIVERY';

        const subtotal = cartState.getSubtotal();
        const gst = cartState.getGst();
        const discountAmount = cartState.getDiscountAmount();
        const discountCode = cartState.discountCode;
        const total = cartState.getGrandTotal();
        const phone = authState.phone || '+919876543210';

        const formattedCart = rawItems.map((item: any) => ({
          id: Number(item.id || item.menu_item_id),
          name: item.name,
          quantity: Number(item.quantity || 1),
          price: Number(item.price || 0),
          image: item.image || '',
        }));

        const selectedAddressObj = addressState.addresses.find(a => a.id == addressState.selectedAddressId) || addressState.addresses[0];

        try {
          const orderPayload = {
            restaurant_id: restId,
            cart: formattedCart,
            subtotal,
            gst,
            delivery_fee: 0,
            packaging_fee: 0,
            discount_amount: discountAmount,
            discount_code: discountCode || null,
            total_amount: total,
            order_type: backendOrderType,
            table_number: currentOrderType === 'Dine In' ? (cartState.tableNumber || 'T-01') : undefined,
            payment_method: currentOrderType === 'Delivery' ? 'Cash on Delivery' : 'Pay at Counter',
            phone,
            delivery_address: currentOrderType === 'Delivery' ? (addressState.selectedDeliveryAddress || selectedAddressObj?.full_address || null) : null,
          };

          console.log('[VapiStore] Voice place_order -> calling orderApi.createOrder:', orderPayload);
          const res = await orderApi.createOrder(orderPayload);
          const placedOrderId = res?.orderId || `ORD-${Date.now()}`;
          const placedDbId = String(res?.dbOrderId || '');

          useOrderStore.getState().addPastOrder({
            orderId: placedOrderId,
            dbOrderId: placedDbId,
            date: new Date().toISOString(),
            total,
            itemsCount: formattedCart.length,
            status: 'Preparing',
            payment_status: 'Pending',
            table_number: orderPayload.table_number,
            order_type: currentOrderType,
            customer_phone: phone,
            items: formattedCart,
          });

          useLiveOrderStore.getState().setLiveOrder(currentOrderType, placedOrderId, placedDbId, 'Preparing');
          cartState.clearCart();

          const speechConfirm = `Your order ${placedOrderId} for ${formattedCart.length} item${formattedCart.length > 1 ? 's' : ''} totaling ${total} rupees has been placed successfully!`;
          const vapi = getVapi();
          if (vapi?.say) {
            vapi.say(speechConfirm, false, false, true);
          }

          if (currentOrderType === 'Dine In') {
            navigateScreen('/track-order', {
              orderId: placedOrderId,
              dbOrderId: placedDbId,
              tableNumber: orderPayload.table_number,
              orderType: 'Dine In',
            });
          } else {
            navigateScreen('/(checkout)/order-success', {
              orderId: placedOrderId,
              dbOrderId: placedDbId,
              total: String(total),
              paymentMethod: orderPayload.payment_method,
              phone,
              orderType: currentOrderType,
              itemCount: String(formattedCart.length),
            });
          }

          return {
            toolCallId,
            result: JSON.stringify({
              success: true,
              orderId: placedOrderId,
              dbOrderId: placedDbId,
              total,
              message: speechConfirm,
            }),
          };
        } catch (placeErr: any) {
          console.error('[VapiStore] place_order failed:', placeErr);
          const errMessage = `Failed to place order: ${placeErr?.message || 'Server error'}. Please proceed to checkout on screen.`;
          navigateScreen('/(checkout)/checkout');
          return {
            toolCallId,
            result: JSON.stringify({
              success: false,
              message: errMessage,
            }),
          };
        }
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
  agentState: 'IDLE',
  isConnecting: false,
  isConnected: false,
  isMuted: false,
  messages: [],
  partialUserTranscript: '',
  partialAgentTranscript: '',
  isTamilMode: false,

  startCall: async () => {
    const assistantId = process.env.EXPO_PUBLIC_VAPI_ASSISTANT_ID || 'ed6d95ac-c202-4b86-a5e1-8647ba87638f';
    if (!assistantId) {
      Alert.alert(
        'Voice Assistant Setup',
        'Vapi Assistant ID is missing. Please configure EXPO_PUBLIC_VAPI_ASSISTANT_ID in your environment variables.'
      );
      set({ isConnecting: false, agentState: 'IDLE' });
      return;
    }

    set({ isConnecting: true, agentState: 'PROCESSING' });

    // Request microphone permission on Android and verify Web permissions
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
          {
            title: 'Microphone Permission',
            message: 'MaitreD needs access to your microphone for voice ordering and navigation.',
            buttonNeutral: 'Ask Me Later',
            buttonNegative: 'Cancel',
            buttonPositive: 'OK',
          }
        );
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          Alert.alert('Permission Denied', 'Microphone access is required for the voice assistant.');
          set({ isConnecting: false, agentState: 'IDLE' });
          return;
        }
      } catch (err) {
        console.warn('[VapiStore] Microphone permission error:', err);
      }
    } else if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
      try {
        const probeStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        probeStream.getTracks().forEach((track) => track.stop());
      } catch (err: any) {
        console.warn('[VapiStore] Web microphone permission error:', err);
        set({ isConnecting: false, agentState: 'IDLE' });
        Alert.alert(
          'Microphone Permission Required',
          'Please allow microphone access in your browser to speak with the MaitreD voice assistant.'
        );
        return;
      }
    }

    const vapi = getVapi();
    if (!vapi) {
      if (Platform.OS !== 'web' && !isWebRTCSupported()) {
        Alert.alert(
          'Development Build Required',
          'Voice calling requires a development build or APK with native WebRTC support. It is not supported in Expo Go. Please test on web or install the preview build APK.'
        );
      } else {
        Alert.alert('Error', 'Voice assistant could not be initialized.');
      }
      set({ isConnecting: false, agentState: 'IDLE' });
      return;
    }

    get().setupListeners(getActiveRouter());

    const { messages } = get();
    const hasHistory = messages.filter((m) => m.isFinal && m.text).length > 0;
    const cart = useCartStore.getState();
    const cartCount = cart.getItemCount();

    let dynamicFirstMessage = "Hello! Welcome to MaitreD. I'm your personal restaurant assistant. How would you like to enjoy your food today?";
    if (hasHistory) {
      dynamicFirstMessage = "Welcome back to MaitreD. Let's continue.";
    } else if (cartCount > 0) {
      dynamicFirstMessage = `Welcome to MaitreD! You have ${cartCount} item${cartCount > 1 ? 's' : ''} in your cart. Would you like to view your cart, add more dishes, or place your order?`;
    }

    const overrides: any = {
      firstMessage: dynamicFirstMessage,
      maxDurationSeconds: 3600,
      clientMessages: [
        'tool-calls',
        'transcript',
        'hang',
        'function-call',
        'speech-update',
        'metadata',
        'conversation-update',
      ],
    };

    try {
      console.log(`[VapiStore] Starting Vapi call with assistant: ${assistantId}...`);
      await vapi.start(assistantId, overrides);
      set({ isConnected: true, isConnecting: false, agentState: 'LISTENING' });
    } catch (e: any) {
      console.warn('[VapiStore] startCall error:', e);
      if (Platform.OS === 'web') {
        vapiInstance = null;
        listenersSetup = false;
      }
      set({ isConnecting: false, agentState: 'IDLE' });
      Alert.alert('Voice Assistant', e?.message || 'Could not connect to voice assistant.');
    }
  },

  stopCall: () => {
    try {
      getVapi()?.stop();
    } catch (e) {
      console.warn('[VapiStore] stopCall error:', e);
    }
    if (Platform.OS === 'web') {
      vapiInstance = null;
      listenersSetup = false;
    }
    set({
      isConnected: false,
      isConnecting: false,
      agentState: 'IDLE',
      partialUserTranscript: '',
      partialAgentTranscript: '',
    });
  },

  toggleMute: () => {
    const currentState = get().isMuted;
    const vapi = getVapi();
    if (vapi?.setMuted && get().isConnected) {
      try {
        vapi.setMuted(!currentState);
      } catch (e) {
        console.warn('[VapiStore] toggleMute error:', e);
      }
    }
    set({ isMuted: !currentState });
  },

  toggleLanguage: () => {
    const next = !get().isTamilMode;
    set({ isTamilMode: next });
    const vapi = getVapi();
    if (vapi && get().isConnected) {
      try {
        (vapi as any).send({
          type: 'add-message',
          message: {
            role: 'system',
            content: next
              ? '[Language Preference] The customer switched to Tamil. Please respond in conversational Tamil / Tanglish with warm hospitality.'
              : '[Language Preference] The customer switched to English. Please respond in English.',
          },
        });
      } catch { }
    }
  },

  stopSpeaking: () => {
    const vapi = getVapi();
    if (vapi?.send) {
      try {
        (vapi as any).send({ type: 'control', control: 'stop-speaking' });
      } catch { }
    }
    set({ agentState: 'LISTENING', partialAgentTranscript: '' });
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
      set({ isConnected: true, isConnecting: false, agentState: 'LISTENING' });

      // Warm the menu cache in the background so the first food request does
      // not stall on a cold network fetch.
      const outletId = useRestaurantStore.getState().selectedOutlet?.restaurant_id;
      const hasLocalMenu = (useRestaurantStore.getState().menuItems || []).length > 0;
      if (outletId && !hasLocalMenu) {
        fetchAgentData('menu_search', {}).catch(() => { });
      }

      // Inject current app context on call start
      try {
        const initialContext = getMobileAgentContext();
        const cleanOutletName = (initialContext.restaurant.selectedOutletName || 'MaitreD Restaurant')
          .replace(/Mugalivakkam/gi, '')
          .replace(/[—–-]\s*$/, '')
          .trim() || 'MaitreD Restaurant';
        (vapi as any).send({
          type: 'add-message',
          message: {
            role: 'system',
            content: `[Current App Context] Restaurant: MaitreD Restaurant. Order Type: ${initialContext.cart.orderType}. Outlet: ${cleanOutletName}. Cart Items: ${initialContext.cart.itemCount}. If customer asks to switch to takeaway, dine in, or delivery, you can use set_order_type ("Take Away", "Dine In", "Delivery"). You represent MaitreD Restaurant.`
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
      if (Platform.OS === 'web') {
        vapiInstance = null;
        listenersSetup = false;
      }
      set({
        isConnected: false,
        isConnecting: false,
        agentState: 'IDLE',
        partialUserTranscript: '',
        partialAgentTranscript: '',
      });
    });

    vapi.on('speech-start', () => {
      set({ agentState: 'SPEAKING' });
    });

    vapi.on('speech-end', () => {
      set({ agentState: 'LISTENING' });
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
            } catch { }

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

          // ── Speech Intent Processing on FINAL Transcript ───────────────────
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
                } catch { }
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
                } catch { }
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
                } catch { }
              }
            }
            // 2. Menu Navigation
            else if (
              /\b(show|open|view|see|go to|take me to|display)\b.*\b(menu|menus|all the menu|all menus|items)\b/i.test(lower) ||
              /\b(all the menus|show menu|browse menu|food menu)\b/i.test(lower) ||
              /^(menu|the menu|show all the menus)$/i.test(lower)
            ) {
              console.log('[VapiStore] Speech detected intent: show all menus');
              navigateScreen('/menu');
            }
            // 3. Profile Navigation
            else if (
              /\b(show|open|view|go to|take me to)\b.*\b(profile|account|my profile|my account)\b/i.test(lower) ||
              /^(profile|my profile|my account)$/i.test(lower)
            ) {
              console.log('[VapiStore] Speech detected intent: open profile');
              navigateScreen('/profile');
            }
            // 4. Rewards / Loyalty Points
            else if (
              /\b(reward|rewards|loyalty|loyalty point|loyalty points|my points|points balance)\b/i.test(lower) ||
              /^(rewards|loyalty points)$/i.test(lower)
            ) {
              console.log('[VapiStore] Speech detected intent: open rewards');
              navigateScreen('/rewards');
            }
            // 5. Addresses
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
            // 6. Orders / History
            else if (
              /\b(show|open|view|my|past)\b.*\b(orders|order history)\b/i.test(lower) ||
              /^(orders|my orders|order history)$/i.test(lower)
            ) {
              console.log('[VapiStore] Speech detected intent: open orders');
              navigateScreen('/(order)/orders');
            }
            // 7. Cart / Checkout Navigation
            else if (
              /\b(show|open|view|go to|take me to|see|check|can you show|where is|what is in)\b.*\b(cart|basket|checkout)\b/i.test(lower) ||
              /^(cart|view cart|open cart|show cart|show my cart|view my cart|checkout)$/i.test(lower)
            ) {
              console.log('[VapiStore] User final transcript intent: OPEN CART');
              navigateScreen('/(checkout)/checkout');
            }
            // 8. Menu Category / Header / Variety Navigation
            else if (
              /\b(south indian|north indian|non[- ]?veg|dosa|snack|beverage|tandoori|soup|biryani|bread|breakfast|lunch|dinner|variety|varieties|categories|category)\b/i.test(lower) &&
              /\b(show|open|view|see|explore|check|go to|take me to|switch to|filter|display)\b/i.test(lower)
            ) {
              console.log('[VapiStore] User final transcript intent: OPEN VARIETY/CATEGORY:', text);
              DeviceEventEmitter.emit('menu_filter_header', { category: lower, search: '' });
              navigateScreen('/menu', { categoryName: lower, search: '' });
            }
          }

          // Navigation handling for finalized assistant speech
          if ((role === 'bot' || role === 'assistant') && text) {
            const lower = text.toLowerCase().trim();

            // If assistant says "Here's your current cart" -> navigate to checkout screen immediately
            if (
              /\b(here'?s\s+your\s+current\s+cart|your\s+cart\s+currently\s+includes|opened\s+your\s+cart|current\s+cart\s+for\s+dine-in)\b/i.test(lower)
            ) {
              console.log('[VapiStore] Assistant speaking cart summary -> Navigating to cart screen');
              navigateScreen('/(checkout)/checkout');
            }
          }
        }
      }
    });

    vapi.on('error', (e: any) => {
      console.error('[VapiStore] Vapi error:', e);
      if (Platform.OS === 'web') {
        vapiInstance = null;
        listenersSetup = false;
      }
      set({ isConnected: false, isConnecting: false, agentState: 'IDLE' });
    });
  },
}));
