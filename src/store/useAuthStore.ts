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

const SIGNED_DEV_GUEST_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIrOTE5ODc2NTQzMjEwIiwidXNlcl9pZCI6IjEiLCJyb2xlIjoiQ1VTVE9NRVIiLCJhY2NvdW50X3R5cGUiOiJDVVNUT01FUiJ9.XeS3lrCNOdG8kVUrk9uTe0Pe_ZrQsM0_O-N2Eu_QY_s';

const DEFAULT_GUEST_USER = {
  customerId: 1,
  customerName: 'Guest User',
  phone: '9876543210',
  token: SIGNED_DEV_GUEST_TOKEN,
  isAuthenticated: true,
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
      customerId: DEFAULT_GUEST_USER.customerId,
      customerName: DEFAULT_GUEST_USER.customerName,
      phone: DEFAULT_GUEST_USER.phone,
      token: DEFAULT_GUEST_USER.token,
      isAuthenticated: true,
      _hasHydrated: false,

      login: (data) => set({ 
        customerId: data.customerId, 
        customerName: data.customerName, 
        phone: data.phone, 
        token: data.token, 
        isAuthenticated: true 
      }),
      logout: () => set({ 
        ...DEFAULT_GUEST_USER,
      }),
      setHasHydrated: (state) => set({ _hasHydrated: state }),
    }),
    {
      name: 'auth-storage-v4',
      storage: createJSONStorage(() => webSafeStorage),
      onRehydrateStorage: () => (state) => {
        if (!state?.isAuthenticated || !state?.phone || state?.token === 'guest_token') {
          useAuthStore.setState({
            customerId: DEFAULT_GUEST_USER.customerId,
            customerName: DEFAULT_GUEST_USER.customerName,
            phone: DEFAULT_GUEST_USER.phone,
            token: DEFAULT_GUEST_USER.token,
            isAuthenticated: true,
          });
        }
        state?.setHasHydrated(true);
      },
    }
  )
);
