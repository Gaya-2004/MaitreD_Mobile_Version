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

export interface Category {
  id: string;
  label: string;
}

export interface MenuItem {
  id: number;
  name: string;
  desc: string;
  price: number;
  available: boolean;
  image: string;
  category: string;
}

interface RestaurantState {
  selectedOutlet: any | null;
  categories: Category[];
  menuItems: MenuItem[];

  setSelectedOutlet: (outlet: any) => void;
  setCategories: (categories: Category[]) => void;
  setMenuItems: (items: MenuItem[]) => void;
}

export const useRestaurantStore = create<RestaurantState>()(
  persist(
    (set) => ({
      selectedOutlet: null,
      categories: [{ id: "all", label: "All Menu" }],
      menuItems: [],

      setSelectedOutlet: (selectedOutlet) => set({ selectedOutlet }),
      setCategories: (categories) => set({ categories }),
      setMenuItems: (menuItems) => set({ menuItems }),
    }),
    {
      name: 'restaurant-storage',
      storage: createJSONStorage(() => webSafeStorage),
      partialize: (state) => ({ selectedOutlet: state.selectedOutlet }), // Only persist outlet
    }
  )
);
