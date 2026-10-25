import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const webSafeStorage = {
  getItem: async (name: string): Promise<string | null> => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      return localStorage.getItem(name);
    }
    return await AsyncStorage.getItem(name);
  },
  setItem: async (name: string, value: string): Promise<void> => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      localStorage.setItem(name, value);
    } else {
      await AsyncStorage.setItem(name, value);
    }
  },
  removeItem: async (name: string): Promise<void> => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      localStorage.removeItem(name);
    } else {
      await AsyncStorage.removeItem(name);
    }
  },
};

export interface CartItem {
  id: number | string;
  name: string;
  price: number;
  image: string;
  quantity: number;
  category: string;
  desc?: string;
  note?: string;
}

const normalizeCartKey = (id: string | number) => String(id).trim();

export type OrderType = 'Dine In' | 'Take Away' | 'Delivery';

interface CartState {
  items: Record<string | number, CartItem>;
  orderType: OrderType;
  tableNumber: string;
  tableStatus: string | null;
  discountCode: string | null;

  // Actions
  addItem: (item: Omit<CartItem, 'quantity'> & { quantity?: number }) => void;
  removeItem: (id: string | number) => void;
  incrementQuantity: (id: string | number) => void;
  decrementQuantity: (id: string | number) => void;
  clearCart: () => void;
  setOrderType: (type: OrderType) => void;
  setTableNumber: (tableNumber: string) => void;
  clearTableNumber: () => void;
  setTableStatus: (tableStatus: string | null) => void;
  applyDiscount: (code: string) => void;
  removeDiscount: () => void;

  // Computed
  getSubtotal: () => number;
  getDiscountAmount: () => number;
  getItemCount: () => number;
  getGst: () => number;
  getServiceCharge: () => number;

  getGrandTotal: (explicitDiscountAmount?: number) => number;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
  items: {},
  orderType: 'Dine In',
  tableNumber: '',
  tableStatus: null,
  discountCode: null,

  addItem: (item) => set((state) => {
    const normalizedId = normalizeCartKey(item.id);
    const existing = state.items[normalizedId] || state.items[item.id] || Object.values(state.items).find((entry) => String(entry.id) === normalizedId);
    const nextQuantity = Math.max(1, Number(item.quantity) || 1);
    return {
      items: {
        ...state.items,
        [normalizedId]: {
          ...item,
          id: normalizedId,
          quantity: existing ? existing.quantity + nextQuantity : nextQuantity,
        }
      }
    };
  }),

  removeItem: (id) => set((state) => {
    const normalizedId = normalizeCartKey(id);
    const { [normalizedId]: _, ...rest } = state.items;
    const altKeys = Object.fromEntries(Object.entries(state.items).filter(([key]) => key !== normalizedId && String(key) !== normalizedId));
    return { items: altKeys };
  }),

  incrementQuantity: (id) => set((state) => {
    const normalizedId = normalizeCartKey(id);
    const existing = state.items[normalizedId] || state.items[id] || Object.values(state.items).find((entry) => String(entry.id) === normalizedId);
    if (!existing) return state;
    return {
      items: {
        ...state.items,
        [normalizeCartKey(existing.id)]: { ...existing, id: normalizeCartKey(existing.id), quantity: existing.quantity + 1 }
      }
    };
  }),

  decrementQuantity: (id) => set((state) => {
    const normalizedId = normalizeCartKey(id);
    const existing = state.items[normalizedId] || state.items[id] || Object.values(state.items).find((entry) => String(entry.id) === normalizedId);
    if (!existing) return state;
    if (existing.quantity <= 1) {
      const { [normalizeCartKey(existing.id)]: _, ...rest } = state.items;
      return { items: rest };
    }
    return {
      items: {
        ...state.items,
        [normalizeCartKey(existing.id)]: { ...existing, id: normalizeCartKey(existing.id), quantity: existing.quantity - 1 }
      }
    };
  }),

  clearCart: () => set({ items: {}, discountCode: null }),
  setOrderType: (type) => set((state) => {
    if (state.orderType === type) return state;
    // When changing modes, clear items so carts never mix across Dine In, Delivery, or Takeaway.
    // Also clear tableNumber when leaving Dine In.
    if (state.orderType === 'Dine In' && type !== 'Dine In') {
      return { orderType: type, items: {}, discountCode: null, tableNumber: '', tableStatus: null };
    }
    return { orderType: type, items: {}, discountCode: null };
  }),
  setTableNumber: (tableNumber) => set({ tableNumber }),
  clearTableNumber: () => set({ tableNumber: '', tableStatus: null }),
  setTableStatus: (tableStatus) => set({ tableStatus }),
  applyDiscount: (code) => set({ discountCode: code }),
  removeDiscount: () => set({ discountCode: null }),

  getSubtotal: () => {
    return Object.values(get().items).reduce((sum, item) => sum + item.price * item.quantity, 0);
  },

  getItemCount: () => {
    return Object.keys(get().items).length;
  },

  getGst: () => 0,
  getServiceCharge: () => 0,


  getDiscountAmount: () => {
    const code = get().discountCode;
    if (!code) return 0;
    const match = code.match(/(\d+)%/);
    if (!match) return 0;
    return get().getSubtotal() * (parseInt(match[1], 10) / 100);
  },

  getGrandTotal: () => {
    const { getSubtotal, getGst, getServiceCharge, getDiscountAmount } = get();
    return getSubtotal() - getDiscountAmount() + getGst() + getServiceCharge();
  }
}),
  {
    name: 'cart-storage-v2',
    storage: createJSONStorage(() => webSafeStorage),
    partialize: (state) => ({
      items: state.items,
      orderType: state.orderType,
      tableNumber: state.tableNumber,
      tableStatus: state.tableStatus,
      discountCode: state.discountCode,
    }),
  }
)
);
