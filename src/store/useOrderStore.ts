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

export interface PastOrder {
  orderId: string;
  dbOrderId: string;
  date: string;
  total: number;
  itemsCount: number;
  status: string;
  payment_status?: string;
  table_number?: string;
  order_type?: string;
  customer_phone?: string;
  items?: any[];
}

interface OrderState {
  pastOrders: PastOrder[];
  currentOrder: any | null; // Detailed current order obj

  addPastOrder: (order: PastOrder) => void;
  setCurrentOrder: (order: any) => void;
  clearCurrentOrder: () => void;
}

export const useOrderStore = create<OrderState>()(
  persist(
    (set) => ({
      pastOrders: [],
      currentOrder: null,

      addPastOrder: (order) => set((state) => {
        const existingIdx = state.pastOrders.findIndex(
          (o) => (order.dbOrderId && String(o.dbOrderId) === String(order.dbOrderId)) ||
                 (order.orderId && o.orderId === order.orderId)
        );
        if (existingIdx >= 0) {
          const updated = [...state.pastOrders];
          updated[existingIdx] = {
            ...updated[existingIdx],
            ...order,
            total: order.total !== undefined ? order.total : updated[existingIdx].total,
            itemsCount: order.itemsCount !== undefined ? order.itemsCount : updated[existingIdx].itemsCount,
            items: order.items || updated[existingIdx].items,
            status: order.status || updated[existingIdx].status,
            payment_status: order.payment_status || updated[existingIdx].payment_status,
          };
          return { pastOrders: updated };
        }
        return { pastOrders: [order, ...state.pastOrders] };
      }),
      setCurrentOrder: (currentOrder) => set({ currentOrder }),
      clearCurrentOrder: () => set({ currentOrder: null })
    }),
    {
      name: 'order-storage',
      storage: createJSONStorage(() => webSafeStorage),
      partialize: (state) => ({ pastOrders: state.pastOrders }), // only persist past orders
    }
  )
);
