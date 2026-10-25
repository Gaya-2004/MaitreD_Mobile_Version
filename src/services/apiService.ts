import { API_BASE_URL } from '../constants/api';
import { useAuthStore } from '../store/useAuthStore';

/**
 * Fetch wrapper with timeout (default 15s) using AbortController.
 */
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs: number = 15000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  
  const token = useAuthStore.getState().token;
  if (token) {
    options.headers = {
      ...options.headers,
      Authorization: `Bearer ${token}`,
    };
  }

  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    if (!res.ok) {
      let message = 'API Request Failed';
      try {
        const errorData = await res.json();
        message = errorData.detail || errorData.message || message;
      } catch {
        message = res.statusText || message;
      }
      const error: any = new Error(message);
      error.status = res.status;
      throw error;
    }
    return await res.json();
  } catch (error: any) {
    clearTimeout(id);
    if (error.name === 'AbortError') {
      throw new Error('Request timed out. Please try again.');
    }
    throw error;
  }
}

/**
 * Auth & Customer Profile Endpoints
 */
export const customerApi = {
  /** POST /api/v1/public/customers/check-phone */
  checkPhone: (payload: { phone: string }) =>
    fetchWithTimeout(`${API_BASE_URL}/api/v1/public/customers/check-phone`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),

  /** POST /api/v1/public/customers/auth/request-otp */
  requestOtp: (payload: { phone: string; purpose?: string }) =>
    fetchWithTimeout(`${API_BASE_URL}/api/v1/public/customers/auth/request-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),

  /** POST /api/v1/public/customers/auth/verify-otp */
  verifyOtp: (payload: { phone: string; challenge_id: string; otp: string }) =>
    fetchWithTimeout(`${API_BASE_URL}/api/v1/public/customers/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),

  /** POST /api/v1/public/customers/signup */
  signup: (payload: { name: string; phone: string; otp?: string; challenge_id?: string; verification_token?: string }) =>
    fetchWithTimeout(`${API_BASE_URL}/api/v1/public/customers/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),

  /** POST /api/v1/public/customers/login */
  login: (payload: { phone: string; otp?: string; challenge_id?: string; verification_token?: string }) =>
    fetchWithTimeout(`${API_BASE_URL}/api/v1/public/customers/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),


  /** GET /api/v1/public/customers/{customerId}/loyalty */
  getLoyalty: (customerId: number) =>
    fetchWithTimeout(`${API_BASE_URL}/api/v1/public/customers/${customerId}/loyalty`),

  /** GET /api/v1/public/customers/{customerId}/favorites */
  getFavorites: (customerId: number) =>
    fetchWithTimeout(`${API_BASE_URL}/api/v1/public/customers/${customerId}/favorites`),

  /** GET /api/v1/public/customers/{customerId}/recommendations */
  getRecommendations: (customerId: number, restaurantId: number) => {
    if (!restaurantId) throw new Error("restaurantId is required");
    return fetchWithTimeout(`${API_BASE_URL}/api/v1/public/customers/${customerId}/recommendations?restaurant_id=${restaurantId}`);
  },

  /** POST /api/v1/public/customers/{customerId}/favorites/{menuItemId} */
  addFavorite: (customerId: number, menuItemId: number) => {
    if (!menuItemId) throw new Error("menuItemId is required");
    return fetchWithTimeout(`${API_BASE_URL}/api/v1/public/customers/${customerId}/favorites/${menuItemId}`, {
      method: 'POST',
    });
  },

  /** DELETE /api/v1/public/customers/{customerId}/favorites/{menuItemId} */
  removeFavorite: (customerId: number, menuItemId: number) => {
    if (!menuItemId) throw new Error("menuItemId is required");
    return fetchWithTimeout(`${API_BASE_URL}/api/v1/public/customers/${customerId}/favorites/${menuItemId}`, {
      method: 'DELETE',
    });
  },

  /** GET /api/v1/public/customers/{customerId}/profile — by integer ID */
  getProfileById: (customerId: number) =>
    fetchWithTimeout(`${API_BASE_URL}/api/v1/public/customers/${customerId}/profile`),

  /** GET /api/v1/public/customers/{phone}/profile — by phone (legacy) */
  getProfile: (phone: string) =>
    fetchWithTimeout(`${API_BASE_URL}/api/v1/public/customers/${encodeURIComponent(phone)}/profile`),

  /** PATCH /api/v1/public/customers/{customerId}/profile — update name/email */
  updateProfile: (customerId: number, payload: { name?: string; email?: string; address?: string }) =>
    fetchWithTimeout(`${API_BASE_URL}/api/v1/public/customers/${customerId}/profile`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),

  /** POST /api/v1/public/customers/{customerId}/upload-picture — multipart */
  uploadProfilePicture: (customerId: number, formData: FormData) =>
    fetchWithTimeout(`${API_BASE_URL}/api/v1/public/customers/${customerId}/upload-picture`, {
      method: 'POST',
      body: formData,
    }, 30000), // Upload may take longer

  /** GET /api/v1/public/customers/{customerId}/addresses */
  getAddresses: (customerId: number) =>
    fetchWithTimeout(`${API_BASE_URL}/api/v1/public/customers/${customerId}/addresses`),

  /** POST /api/v1/public/customers/{customerId}/addresses */
  addAddress: (customerId: number, payload: object) =>
    fetchWithTimeout(`${API_BASE_URL}/api/v1/public/customers/${customerId}/addresses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),

  /** PATCH /api/v1/public/customers/{customerId}/addresses/{addressId} */
  updateAddress: (customerId: number, addressId: number, payload: object) =>
    fetchWithTimeout(`${API_BASE_URL}/api/v1/public/customers/${customerId}/addresses/${addressId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),

  /** DELETE /api/v1/public/customers/{customerId}/addresses/{addressId} */
  deleteAddress: (customerId: number, addressId: number) =>
    fetchWithTimeout(`${API_BASE_URL}/api/v1/public/customers/${customerId}/addresses/${addressId}`, {
      method: 'DELETE',
    }),
};


interface CacheEntry<T> {
  timestamp: number;
  promise?: Promise<T>;
  data?: T;
}
const apiCache = new Map<string, CacheEntry<any>>();

async function cachedFetch<T>(key: string, fetcher: () => Promise<T>, ttlMs = 60000, forceRefresh = false): Promise<T> {
  const now = Date.now();
  const existing = apiCache.get(key);
  if (!forceRefresh && existing) {
    if (existing.data && (now - existing.timestamp < ttlMs)) {
      return existing.data;
    }
    if (existing.promise) {
      return existing.promise;
    }
  }

  const promise = fetcher().then((res) => {
    apiCache.set(key, { timestamp: Date.now(), data: res });
    return res;
  }).catch((err) => {
    apiCache.delete(key);
    throw err;
  });

  apiCache.set(key, { timestamp: now, promise });
  return promise;
}

/**
 * Restaurant Endpoints
 */
export const restaurantApi = {
  /** GET /api/v1/public/restaurants */
  getRestaurants: (force = false) =>
    cachedFetch('restaurants', () => fetchWithTimeout(`${API_BASE_URL}/api/v1/public/restaurants`), 120000, force),
};

/**
 * Menu Endpoints
 */
export const menuApi = {
  /** GET /api/v1/public/menu/categories */
  getCategories: (restaurantId: number, force = false) => {
    if (!restaurantId) throw new Error("restaurantId is required");
    return cachedFetch(
      `categories_${restaurantId}`,
      () => fetchWithTimeout(`${API_BASE_URL}/api/v1/public/menu/categories?restaurant_id=${restaurantId}`),
      60000,
      force
    );
  },

  /** GET /api/v1/public/menu/items */
  getItems: (restaurantId: number, force = false) => {
    if (!restaurantId) throw new Error("restaurantId is required");
    return cachedFetch(
      `items_${restaurantId}`,
      () => fetchWithTimeout(`${API_BASE_URL}/api/v1/public/menu/items?restaurant_id=${restaurantId}`),
      60000,
      force
    );
  },

  clearCache: () => apiCache.clear(),
};

/**
 * Order Endpoints
 */
export const orderApi = {
  /**
   * POST /api/orders — create a customer order (dine-in / takeaway / delivery).
   * The backend route lives in customer.py under the `Customer` tag.
   */
  createOrder: async (payload: any) => {
    if (!payload.restaurant_id) throw new Error("restaurant_id is required");
    // Format cart items to ensure every item has valid numeric id (matching backend MenuItem.id), quantity, price
    const formattedCart = Array.isArray(payload.cart)
      ? payload.cart.map((item: any) => {
          const rawId = Number(item.id || item.menu_item_id || item.menuItemId);
          if (isNaN(rawId) || rawId <= 0) {
            throw new Error(`Invalid menu item ID in cart`);
          }
          const validId = Math.floor(rawId);
          const rawQty = Number(item.quantity);
          const qty = (!isNaN(rawQty) && rawQty >= 1) ? Math.floor(rawQty) : 1;
          const price = Number(item.price) || 0;
          return { id: validId, quantity: qty, price };
        })
      : [];

    const rawAddrId = Number(payload.delivery_address_id);
    const validAddrId = (!isNaN(rawAddrId) && rawAddrId > 0 && rawAddrId < 2147483647) ? Math.floor(rawAddrId) : null;

    const fullPayload = {
      ...payload,
      delivery_address_id: validAddrId,
      cart: formattedCart,
    };

    const res = await fetchWithTimeout(`${API_BASE_URL}/api/orders?restaurant_id=${payload.restaurant_id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fullPayload),
    });

    return res;
  },

  /** GET /api/v1/public/orders/{dbOrderId} — fetch full order details */
  getOrderDetails: (dbOrderId: string, restaurantId?: number, sessionUid?: string) => {
    const params = new URLSearchParams();
    if (restaurantId) params.append('restaurant_id', String(restaurantId));
    if (sessionUid) params.append('session_uid', sessionUid);
    const q = params.toString() ? `?${params.toString()}` : '';
    return fetchWithTimeout(
      `${API_BASE_URL}/api/v1/public/orders/${encodeURIComponent(dbOrderId)}${q}`,
    );
  },

  /** GET /api/orders/{dbOrderId} — fetch order status */
  getOrderStatus: (dbOrderId: string, restaurantId: number, sessionUid?: string) => {
    if (!restaurantId) throw new Error("restaurantId is required");
    const params = new URLSearchParams();
    params.append('restaurant_id', String(restaurantId));
    if (sessionUid) params.append('session_uid', sessionUid);
    const q = `?${params.toString()}`;
    return fetchWithTimeout(
      `${API_BASE_URL}/api/orders/${encodeURIComponent(dbOrderId)}${q}`,
    );
  },

  /** POST /api/orders/{orderId}/cancel — cancel whole order before kitchen preparation */
  cancelOrder: (orderId: number | string, restaurantId?: number, reason?: string, sessionUid?: string) => {
    const rawStr = String(orderId || '').trim();
    const cleanId = rawStr.replace(/\D/g, '') || rawStr;
    const q = restaurantId ? `?restaurant_id=${restaurantId}` : '';
    return fetchWithTimeout(`${API_BASE_URL}/api/orders/${encodeURIComponent(cleanId)}/cancel${q}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        reason: reason || 'Customer requested cancellation',
        session_uid: sessionUid
      }),
    });
  },

  /** POST /api/orders/{orderId}/items/{itemId}/cancel — cancel item before preparation */
  cancelOrderItem: (orderId: number | string, itemId: number | string, restaurantId?: number, reason?: string, sessionUid?: string) => {
    const rawOrderStr = String(orderId || '').trim();
    const cleanOrderId = rawOrderStr.replace(/\D/g, '') || rawOrderStr;
    const rawItemStr = String(itemId || '').trim();
    const cleanItemId = rawItemStr.replace(/\D/g, '') || rawItemStr;
    const q = restaurantId ? `?restaurant_id=${restaurantId}` : '';
    return fetchWithTimeout(`${API_BASE_URL}/api/orders/${encodeURIComponent(cleanOrderId)}/items/${encodeURIComponent(cleanItemId)}/cancel${q}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        reason: reason || 'Customer requested cancellation',
        session_uid: sessionUid
      }),
    });
  },

  /** GET /api/orders/{orderId}/cancellation-eligibility */
  checkCancellationEligibility: (orderId: number | string, restaurantId?: number, sessionUid?: string) => {
    const rawStr = String(orderId || '').trim();
    const cleanId = rawStr.replace(/\D/g, '') || rawStr;
    const params = new URLSearchParams();
    if (restaurantId) params.append('restaurant_id', String(restaurantId));
    if (sessionUid) params.append('session_uid', sessionUid);
    const q = params.toString() ? `?${params.toString()}` : '';
    return fetchWithTimeout(`${API_BASE_URL}/api/orders/${encodeURIComponent(cleanId)}/cancellation-eligibility${q}`);
  },


  /** GET /api/v1/public/customers/orders?phone=...&restaurant_id=... — order history */
  getCustomerOrders: (phone: string, restaurantId: number) => {
    if (!restaurantId) throw new Error("restaurantId is required");
    return fetchWithTimeout(
      `${API_BASE_URL}/api/v1/public/customers/orders?phone=${encodeURIComponent(phone)}&restaurant_id=${restaurantId}`,
    );
  },

  /** GET /api/v1/public/orders/{dbOrderId}/tracking — delivery tracking data */
  getTracking: (dbOrderId: string) =>
    fetchWithTimeout(
      `${API_BASE_URL}/api/v1/public/orders/${encodeURIComponent(dbOrderId)}/tracking`,
    ),

  /** POST /api/v1/public/orders/{orderId}/feedback */
  submitFeedback: (
    orderId: string,
    payload: { rating: number; feedback_message?: string; feedback_tags?: string[] },
  ) =>
    fetchWithTimeout(`${API_BASE_URL}/api/v1/public/orders/${encodeURIComponent(orderId)}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),

  /**
   * POST /api/orders with order_id — append food items to an existing dine-in order
   */
  appendOrderItems: (orderId: number | string, payload: any) => {
    if (!payload.restaurant_id) throw new Error("restaurant_id is required");
    const formattedCart = Array.isArray(payload.cart)
      ? payload.cart.map((item: any) => {
          const rawId = Number(item.id || item.menu_item_id || item.menuItemId);
          if (isNaN(rawId) || rawId <= 0) {
            throw new Error(`Invalid menu item ID in cart`);
          }
          const validId = Math.floor(rawId);
          const rawQty = Number(item.quantity);
          const qty = (!isNaN(rawQty) && rawQty >= 1) ? Math.floor(rawQty) : 1;
          const price = Number(item.price) || 0;
          return { id: validId, quantity: qty, price };
        })
      : [];

    return fetchWithTimeout(`${API_BASE_URL}/api/orders?restaurant_id=${payload.restaurant_id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, cart: formattedCart, order_id: Number(orderId) }),
    });
  },

  /**
   * POST /api/orders/{order_id}/settle-payment — settle payment for a dine-in order and release table
   */
  settleDineInPayment: (
    orderId: number | string,
    payload: { payment_method: string; payment_id?: string; amount_paid?: number }
  ) =>
    fetchWithTimeout(`${API_BASE_URL}/api/orders/${encodeURIComponent(orderId)}/settle-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
};

/**
 * Dine-In Session Endpoints (DINE-IN ONLY)
 */
export const dineInSessionApi = {
  /** POST /api/dine-in/session/active */
  getActiveSession: (payload: { restaurant_id: number; table_number: string; phone?: string }) =>
    fetchWithTimeout(`${API_BASE_URL}/api/dine-in/session/active`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),

  /** GET /api/dine-in/session/{sessionId}/details?restaurant_id=... */
  getSessionDetails: (sessionId: string | number, restaurantId?: number) => {
    const restId = restaurantId || 1;
    return fetchWithTimeout(
      `${API_BASE_URL}/api/dine-in/session/${encodeURIComponent(sessionId)}/details?restaurant_id=${restId}`
    );
  },

  /** POST /api/dine-in/session/{sessionId}/settle?restaurant_id=... */
  settleSession: (
    sessionId: string | number,
    restaurantId: number,
    payload: { payment_method: string; payment_id?: string; amount_paid?: number }
  ) =>
    fetchWithTimeout(
      `${API_BASE_URL}/api/dine-in/session/${encodeURIComponent(sessionId)}/settle?restaurant_id=${restaurantId}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    ),
};

/**
 * Table Endpoints
 */
export const tableApi = {
  /** GET /api/customer/table/verify?table_number=...&restaurant_id=... */
  verifyTable: (tableNumber: string, restaurantId: number) => {
    if (!restaurantId) throw new Error("restaurantId is required");
    return fetchWithTimeout(
      `${API_BASE_URL}/api/customer/table/verify?table_number=${encodeURIComponent(tableNumber)}&restaurant_id=${restaurantId}`,
    );
  },
};

/**
 * Payment Endpoints
 */
export const paymentApi = {
  /** GET /api/razorpay-key */
  getRazorpayKey: () => fetchWithTimeout(`${API_BASE_URL}/api/razorpay-key`),

  /** POST /api/create-razorpay-order */
  createRazorpayOrder: (payload: { amount: number; currency?: string; receipt?: string; order_id: number }) =>
    fetchWithTimeout(`${API_BASE_URL}/api/create-razorpay-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),

  /** POST /api/verify-payment */
  verifyPayment: (payload: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
    order_id?: number;
  }) =>
    fetchWithTimeout(`${API_BASE_URL}/api/verify-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
};

/**
 * Delivery Tracking Endpoints (new — rider tracking)
 */
export const deliveryApi = {
  /** GET /api/v1/public/orders/{orderId}/rider-location */
  getRiderLocation: (orderId: string) =>
    fetchWithTimeout(
      `${API_BASE_URL}/api/v1/public/orders/${encodeURIComponent(orderId)}/rider-location`,
    ),

  /** GET /api/v1/public/orders/{orderId}/tracking */
  getOrderTracking: (orderId: string) =>
    fetchWithTimeout(
      `${API_BASE_URL}/api/v1/public/orders/${encodeURIComponent(orderId)}/tracking`,
    ),
};

/**
 * Catering Order Endpoints
 */
export const cateringOrderApi = {
  /** GET /api/v1/public/customers/{customerId}/catering-orders */
  getCateringOrders: (customerId: number) => {
    if (!customerId) throw new Error("customerId is required");
    return fetchWithTimeout(`${API_BASE_URL}/api/v1/public/customers/${customerId}/catering-orders`);
  },

  /** POST /api/v1/public/catering/orders/{orderId}/balance-payment */
  startBalancePayment: (orderId: number, paymentAmount: number) => {
    if (!orderId) throw new Error("orderId is required");
    return fetchWithTimeout(`${API_BASE_URL}/api/v1/public/catering/orders/${orderId}/balance-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payment_amount: paymentAmount }),
    });
  },

  /** POST /api/v1/public/catering/orders/{orderId}/balance-payment/verify */
  verifyBalancePayment: (orderId: number, payload: {
    amount: number;
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
    payment_method?: string;
  }) => {
    if (!orderId) throw new Error("orderId is required");
    return fetchWithTimeout(`${API_BASE_URL}/api/v1/public/catering/orders/${orderId}/balance-payment/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  },
};
