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

export type OrderType = 'Take Away' | 'Dine In' | 'Delivery' | null;
export type LiveOrderStatus = string | null;

interface LiveOrderState {
  orderType: OrderType;
  orderId: string | null;
  dbOrderId: string | null;
  status: LiveOrderStatus;
  restaurantStatus: string | null;
  estimatedTime: string | null;
  pollingActive: boolean;

  setLiveOrder: (
    orderType: OrderType, 
    orderId: string, 
    dbOrderId: string, 
    status: LiveOrderStatus,
    estimatedTime?: string
  ) => void;
  updateStatus: (status: LiveOrderStatus) => void;
  setPollingActive: (active: boolean) => void;
  clearLiveOrder: () => void;
}

export const useLiveOrderStore = create<LiveOrderState>()(
  persist(
    (set) => ({
      orderType: null,
      orderId: null,
      dbOrderId: null,
      status: null as any,
      restaurantStatus: null,
      estimatedTime: null,
      pollingActive: false,

      setLiveOrder: (orderType, orderId, dbOrderId, status, estimatedTime = undefined) => 
        set({ orderType, orderId, dbOrderId, status, estimatedTime: estimatedTime ?? null, pollingActive: true }),
      
      updateStatus: (status) => set({ status }),
      
      setPollingActive: (pollingActive) => set({ pollingActive }),
      
      clearLiveOrder: () => set({ 
        orderType: null, 
        orderId: null, 
        dbOrderId: null, 
        status: null as any, 
        restaurantStatus: null,
        estimatedTime: null,
        pollingActive: false
      })
    }),
    {
      name: 'live-order-storage',
      storage: createJSONStorage(() => webSafeStorage),
    }
  )
);
