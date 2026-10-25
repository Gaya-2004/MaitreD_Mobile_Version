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

interface AuthState {
  customerId: number | null;
  customerName: string | null;
  phone: string | null;
  token: string | null;
  isAuthenticated: boolean;
  _hasHydrated: boolean;
  
  login: (data: { customerId: number; customerName: string; phone: string; token: string }) => void;
  logout: () => void;
  setHasHydrated: (state: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      customerId: null,
      customerName: null,
      phone: null,
      token: null,
      isAuthenticated: false,
      _hasHydrated: false,

      login: (data) => set({ 
        customerId: data.customerId, 
        customerName: data.customerName, 
        phone: data.phone, 
        token: data.token, 
        isAuthenticated: true 
      }),
      logout: () => set({ 
        customerId: null, 
        customerName: null, 
        phone: null, 
        token: null, 
        isAuthenticated: false 
      }),
      setHasHydrated: (state) => set({ _hasHydrated: state }),
    }),
    {
      name: 'auth-storage-v3',
      storage: createJSONStorage(() => webSafeStorage),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
