import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

export interface Address {
  id: string | number;
  type: string;
  address: string;
  full_address: string;
  latitude?: number;
  longitude?: number;
  flat_house_no?: string;
  building_apartment_name?: string;
  floor?: string;
  landmark?: string;
  city?: string;
  state?: string;
  pincode?: string;
  contact_name?: string;
  contact_phone?: string;
  delivery_instructions?: string;
  icon: string;
  iconBg: string;
  iconColor: string;
  isDefault?: boolean;
}

interface AddressState {
  addresses: Address[];
  selectedDeliveryAddress: string | null;
  selectedAddressId?: number;

  setAddresses: (addresses: Address[]) => void;
  setSelectedDeliveryAddress: (address: string, id?: number) => void;
  addAddress: (address: Address) => void;
  clearAddresses: () => void;
}

// Fallback to localStorage on web if AsyncStorage fails or throws
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

export const useAddressStore = create<AddressState>()(
  persist(
    (set) => ({
      addresses: [],
      selectedDeliveryAddress: null,
      selectedAddressId: undefined,

      setAddresses: (addresses) => set({ addresses }),
      setSelectedDeliveryAddress: (selectedDeliveryAddress, selectedAddressId) => set({ selectedDeliveryAddress, selectedAddressId }),
      addAddress: (address) => set((state) => ({ addresses: [...state.addresses, address] })),
      clearAddresses: () => set({ addresses: [], selectedDeliveryAddress: null, selectedAddressId: undefined }),
    }),
    {
      name: 'address-storage',
      storage: createJSONStorage(() => webSafeStorage),
    }
  )
);
