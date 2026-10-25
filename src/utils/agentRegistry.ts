/**
 * agentRegistry.ts
 *
 * PHASE 2 — Canonical screen/action/tool registries
 *
 * SINGLE SOURCE OF TRUTH for:
 *   - All supported Expo Router routes reachable by voice
 *   - All natural-language aliases → canonical route
 *   - All supported UI action names
 *   - All supported Vapi tool names
 *
 * SECURITY: The dispatcher must reject any route or action NOT in these maps.
 * The LLM/Vapi may not navigate to arbitrary strings.
 */

// ─── Supported Routes ────────────────────────────────────────────────────────

export const SCREEN_REGISTRY: Record<string, string> = {
  // Auth
  '/login': '/login',
  '/signup': '/signup',

  // Restaurant
  '/outlet-selector': '/outlet-selector',

  // Main
  '/home': '/home',
  '/menu': '/menu',
  '/profile': '/profile',
  '/rewards': '/rewards',
  '/favourites': '/favourites',
  '/for-you': '/for-you',

  // Addresses
  '/my-addresses': '/my-addresses',
  '/add-address': '/(address)/add-address',
  '/(address)/add-address': '/(address)/add-address',
  '/(address)/my-addresses': '/(address)/my-addresses',

  // Checkout
  '/checkout': '/(checkout)/checkout',
  '/(checkout)/checkout': '/(checkout)/checkout',
  '/delivery-checkout': '/(checkout)/delivery-checkout',
  '/(checkout)/delivery-checkout': '/(checkout)/delivery-checkout',
  '/payment': '/(checkout)/payment',
  '/(checkout)/payment': '/(checkout)/payment',
  '/payment-methods': '/(checkout)/payment-methods',
  '/razorpay-screen': '/(checkout)/razorpay-screen',
  '/order-success': '/(checkout)/order-success',
  '/delivery-success': '/(checkout)/delivery-success',
  '/order-completed': '/(checkout)/order-completed',
  '/invoice': '/(checkout)/invoice',

  // Orders
  '/orders': '/(order)/orders',
  '/(order)/orders': '/(order)/orders',
  '/order-details': '/(order)/order-details',
  '/(order)/order-details': '/(order)/order-details',
  '/track-order': '/(order)/track-order',
  '/(order)/track-order': '/(order)/track-order',
  '/delivery-tracking': '/(order)/delivery-tracking',
  '/(order)/delivery-tracking': '/(order)/delivery-tracking',
  '/delivery-completed': '/(order)/delivery-completed',

  // Catering
  '/bulk-catering': '/(main)/bulk-catering',
  '/(main)/bulk-catering': '/(main)/bulk-catering',
  '/catering-choose-package': '/(main)/catering-choose-package',
  '/catering-event-details': '/(main)/catering-event-details',
  '/catering-customise-menu': '/(main)/catering-customise-menu',
  '/catering-add-extras': '/(main)/catering-add-extras',
  '/catering-review-quote': '/(main)/catering-review-quote',
  '/catering-advance-payment': '/(main)/catering-advance-payment',
  '/catering-balance-payment': '/(main)/catering-balance-payment',
  '/catering-razorpay-checkout': '/(main)/catering-razorpay-checkout',
  '/catering-order-success': '/(main)/catering-order-success',
  '/catering-order-details': '/(main)/catering-order-details',
};

// ─── Natural language alias → canonical route ─────────────────────────────

export const ROUTE_ALIASES: Record<string, string> = {
  // Home
  'home': '/home',
  'main page': '/home',
  'main': '/home',
  'start': '/home',
  'dashboard': '/home',
  'home screen': '/home',
  'go to home': '/home',
  'go home': '/home',

  // Menu
  'menu': '/menu',
  'food menu': '/menu',
  'browse menu': '/menu',
  'see menu': '/menu',
  'view menu': '/menu',
  'show menu': '/menu',
  'open menu': '/menu',
  'go to menu': '/menu',
  'take me to menu': '/menu',
  'today menu': '/menu',
  'todays menu': '/menu',
  'food': '/menu',
  'dishes': '/menu',
  'items': '/menu',
  'dine in': '/menu',
  'dine-in': '/menu',
  'takeaway': '/menu',
  'take away': '/menu',

  // Profile
  'profile': '/profile',
  'my profile': '/profile',
  'account': '/profile',
  'my account': '/profile',
  'settings': '/profile',
  'open profile': '/profile',
  'show profile': '/profile',

  // Rewards
  'rewards': '/rewards',
  'reward points': '/rewards',
  'points': '/rewards',
  'loyalty': '/rewards',
  'my points': '/rewards',
  'my rewards': '/rewards',
  'open rewards': '/rewards',
  'show rewards': '/rewards',

  // Favourites
  'favourites': '/favourites',
  'favorites': '/favourites',
  'saved items': '/favourites',
  'my favourites': '/favourites',
  'my favorites': '/favourites',
  'open favourites': '/favourites',
  'show favourites': '/favourites',

  // Addresses
  'addresses': '/my-addresses',
  'my addresses': '/my-addresses',
  'saved addresses': '/my-addresses',
  'delivery addresses': '/my-addresses',
  'add address': '/add-address',
  'new address': '/add-address',
  'open addresses': '/my-addresses',
  'show addresses': '/my-addresses',

  // Orders
  'orders': '/orders',
  'my orders': '/orders',
  'order history': '/orders',
  'past orders': '/orders',
  'previous orders': '/orders',
  'open orders': '/orders',
  'show orders': '/orders',
  'view orders': '/orders',
  'go to orders': '/orders',

  // Checkout / Payment
  'checkout': '/checkout',
  'cart': '/checkout',
  'my cart': '/checkout',
  'open cart': '/checkout',
  'show cart': '/checkout',
  'view cart': '/checkout',
  'go to cart': '/checkout',
  'basket': '/checkout',
  'my basket': '/checkout',
  'payment': '/payment',
  'pay': '/payment',
  'invoice': '/invoice',

  // Tracking
  'track order': '/track-order',
  'track my order': '/track-order',
  'order tracking': '/track-order',
  'tracking': '/track-order',
  'delivery tracking': '/delivery-tracking',
  'track delivery': '/delivery-tracking',
  'where is my order': '/track-order',

  // Catering
  'catering': '/bulk-catering',
  'bulk catering': '/bulk-catering',
  'catering packages': '/catering-choose-package',
  'event catering': '/bulk-catering',
  'bulk order': '/bulk-catering',
  'open catering': '/bulk-catering',

  // Outlet
  'outlet': '/outlet-selector',
  'outlets': '/outlet-selector',
  'change outlet': '/outlet-selector',
  'select outlet': '/outlet-selector',
  'choose outlet': '/outlet-selector',
  'restaurant': '/outlet-selector',
  'change restaurant': '/outlet-selector',
  'branch': '/outlet-selector',

  // Login / Signup
  'login': '/login',
  'sign in': '/login',
  'signup': '/signup',
  'sign up': '/signup',
  'register': '/signup',

  // Multilingual & Dialect Keywords (Tanglish / Hinglish / Kannada / Telugu)
  'sapadu': '/menu',
  'saapaadu': '/menu',
  'khana': '/menu',
  'oota': '/menu',
  'tindi': '/menu',
  'bhojanam': '/menu',
  'kadai': '/outlet-selector',
  'dukhaan': '/outlet-selector',
  'angadi': '/outlet-selector',
  'bill': '/checkout',
  'veedu': '/my-addresses',
  'ghar': '/my-addresses',
  'mane': '/my-addresses',
};

// ─── Supported UI Actions ─────────────────────────────────────────────────

export const SUPPORTED_ACTIONS = new Set([
  // Navigation
  'navigate',
  'go_back',

  // Auth (signup form field fill)
  'set_signup_name',
  'set_signup_phone',

  // Order type
  'set_order_type',
  'select_order_type',
  'switch_order_type',
  'switch_mode',
  'set_order_mode',
  'switch_to_takeaway',
  'switch_to_dine_in',
  'switch_to_delivery',

  // Cart
  'add_to_cart',
  'remove_from_cart',
  'increment_cart_item',
  'decrement_cart_item',
  'set_cart_quantity',
  'clear_cart',
  'show_cart',

  // Tracking / Orders
  'open_tracking',
  'open_order_details',
  'open_invoice',
  'open_delivery_tracking',

  // Addresses
  'open_addresses',
  'open_add_address',
  'select_address',

  // Profile / Rewards / Orders / Menu shortcuts
  'open_profile',
  'open_rewards',
  'open_orders',
  'open_menu',

  // Outlet
  'select_outlet',

  // Catering
  'open_catering',
]);

// ─── Supported Vapi Tool Names ────────────────────────────────────────────

export const SUPPORTED_VAPI_TOOLS = new Set([
  'app_navigate',
  'navigate',
  'open_screen',
  'switch_screen',
  'app_go_back',
  'go_back',
  'app_get_context',
  'set_order_type',
  'select_order_mode',
  'switch_order_type',
  'switch_order_mode',
  'switch_mode',
  'set_order_mode',
  'change_order_type',
  'select_order_type',
  'switch_to_takeaway',
  'switch_to_dine_in',
  'switch_to_delivery',
  'takeaway',
  'dine_in',
  'delivery',
  'set_table_number',
  'menu_search',
  'get_menu',
  'cart_update',
  'add_to_cart',
  'remove_from_cart',
  'update_cart_item',
  'clear_cart',
  'open_cart',
  'show_cart',
  'view_cart',
  'proceed_to_checkout',
  'place_order',
  'select_payment_method',
  'update_customer_info',
  'customer_get_profile',
  'customer_get_rewards',
  'customer_get_orders',
  'customer_get_order',
  'order_get_tracking',
  'track_order',
  'delivery_tracking',
  'catering_get_data',
  'open_catering',
  'select_outlet',
  'app_confirm_action',
  'mcp_tool',
  'select_address',
  'choose_address',
  'set_delivery_address',
  'open_addresses',
  'my_addresses',
  'addresses',
  'customer_get_addresses',
  'get_addresses',
  'open_profile',
  'profile',
  'my_profile',
  'open_rewards',
  'rewards',
  'loyalty_points',
  'my_rewards',
  'open_orders',
  'orders',
  'my_orders',
  'open_menu',
  'show_menu',
  'menu',
  'voicemail_tool',
  'end_call_tool',
]);

// ─── Resolve alias → canonical route ─────────────────────────────────────

export function resolveRoute(input: string): string | null {
  if (!input || typeof input !== 'string') return null;
  const raw = input.trim();
  if (!raw) return null;

  // Direct match in SCREEN_REGISTRY
  if (SCREEN_REGISTRY[raw]) return SCREEN_REGISTRY[raw];

  const normalized = raw.toLowerCase().replace(/^[/#]+/, '').trim();
  const withSlash = '/' + normalized;

  if (SCREEN_REGISTRY[withSlash]) return SCREEN_REGISTRY[withSlash];
  if (SCREEN_REGISTRY[raw.toLowerCase()]) return SCREEN_REGISTRY[raw.toLowerCase()];

  // Direct uppercase enum match (e.g. DINE_IN, TAKEAWAY, CART, MENU, HOME, ORDERS from Vapi navigate tool)
  const upper = raw.toUpperCase().replace(/[\s-]+/g, '_');
  const ENUM_ROUTES: Record<string, string> = {
    'HOME': '/home',
    'MENU': '/menu',
    'DINE_IN': '/menu',
    'TAKEAWAY': '/menu',
    'TAKE_AWAY': '/menu',
    'DELIVERY': '/menu',
    'CART': '/(checkout)/checkout',
    'CHECKOUT': '/(checkout)/checkout',
    'TAKEAWAY_CHECKOUT': '/(checkout)/checkout',
    'PAYMENT': '/(checkout)/payment',
    'TAKEAWAY_PAYMENT': '/(checkout)/payment',
    'ORDER_SUCCESS': '/(checkout)/order-success',
    'TAKEAWAY_ORDER_SUCCESS': '/(checkout)/order-success',
    'INVOICE': '/(checkout)/invoice',
    'ORDERS': '/(order)/orders',
    'ORDER_HISTORY': '/(order)/orders',
    'TRACK_ORDER': '/(order)/track-order',
    'TRACKING': '/(order)/track-order',
    'DELIVERY_TRACKING': '/(order)/delivery-tracking',
    'PROFILE': '/profile',
    'REWARDS': '/rewards',
    'FAVOURITES': '/favourites',
    'FAVORITES': '/favourites',
    'OUTLET': '/outlet-selector',
    'OUTLET_SELECTOR': '/outlet-selector',
    'CATERING': '/(main)/bulk-catering',
    'BULK_CATERING': '/(main)/bulk-catering',
    'ADDRESSES': '/(address)/my-addresses',
    'MY_ADDRESSES': '/(address)/my-addresses',
    'ADD_ADDRESS': '/(address)/add-address',
    'LOGIN': '/login',
    'SIGNUP': '/signup',
  };

  if (ENUM_ROUTES[upper]) {
    return ENUM_ROUTES[upper];
  }

  // Direct alias match
  if (ROUTE_ALIASES[raw.toLowerCase()]) return ROUTE_ALIASES[raw.toLowerCase()];
  if (ROUTE_ALIASES[normalized]) return ROUTE_ALIASES[normalized];

  // Clean common conversational phrases (e.g. "go to menu" -> "menu")
  const cleaned = raw.toLowerCase()
    .replace(/^(go to|open|show|view|navigate to|take me to|please open|please go to)\s+/, '')
    .trim();

  if (ROUTE_ALIASES[cleaned]) return ROUTE_ALIASES[cleaned];
  if (SCREEN_REGISTRY['/' + cleaned]) return SCREEN_REGISTRY['/' + cleaned];

  // Substring match in ROUTE_ALIASES, sorted longest first to avoid partial conflicts
  const sortedAliases = Object.entries(ROUTE_ALIASES).sort(
    ([a], [b]) => b.length - a.length
  );

  for (const [alias, route] of sortedAliases) {
    if (cleaned.includes(alias) || raw.toLowerCase().includes(alias)) {
      return route;
    }
  }

  return null;
}

// ─── Screen display names for "where am I?" ──────────────────────────────

export const SCREEN_NAMES: Record<string, string> = {
  '/home': 'Home',
  '/(main)/home': 'Home',
  '/menu': 'Menu',
  '/(main)/menu': 'Menu',
  '/profile': 'Profile',
  '/(main)/profile': 'Profile',
  '/rewards': 'Rewards',
  '/(main)/rewards': 'Rewards',
  '/favourites': 'Favourites',
  '/(main)/favourites': 'Favourites',
  '/orders': 'Order History',
  '/(order)/orders': 'Order History',
  '/order-details': 'Order Details',
  '/(order)/order-details': 'Order Details',
  '/track-order': 'Order Tracking',
  '/(order)/track-order': 'Order Tracking',
  '/delivery-tracking': 'Delivery Tracking',
  '/(order)/delivery-tracking': 'Delivery Tracking',
  '/checkout': 'Checkout',
  '/(checkout)/checkout': 'Checkout',
  '/delivery-checkout': 'Delivery Checkout',
  '/payment': 'Payment',
  '/(checkout)/payment': 'Payment',
  '/invoice': 'Invoice',
  '/(checkout)/invoice': 'Invoice',
  '/order-success': 'Order Placed',
  '/delivery-success': 'Delivery Order Placed',
  '/my-addresses': 'My Addresses',
  '/(address)/my-addresses': 'My Addresses',
  '/add-address': 'Add Address',
  '/(address)/add-address': 'Add Address',
  '/outlet-selector': 'Outlet Selection',
  '/(main)/outlet-selector': 'Outlet Selection',
  '/login': 'Login',
  '/(auth)/login': 'Login',
  '/signup': 'Sign Up',
  '/(auth)/signup': 'Sign Up',
  '/bulk-catering': 'Bulk Catering',
  '/(main)/bulk-catering': 'Bulk Catering',
  '/catering-choose-package': 'Catering Package Selection',
  '/catering-event-details': 'Catering Event Details',
  '/catering-customise-menu': 'Catering Menu Customization',
  '/catering-add-extras': 'Catering Add Extras',
  '/catering-review-quote': 'Catering Quote Review',
  '/catering-advance-payment': 'Catering Advance Payment',
  '/catering-balance-payment': 'Catering Balance Payment',
  '/catering-order-success': 'Catering Order Success',
  '/catering-order-details': 'Catering Order Details',
};

export function getScreenDisplayName(route: string): string {
  if (!route) return 'the app';
  return SCREEN_NAMES[route] || SCREEN_NAMES['/' + route.split('/').pop()] || 'this screen';
}
