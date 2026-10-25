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

export const DEFAULT_OUTLET = {
  id: "1",
  restaurant_id: 1,
  name: "Data Udipi — Mugalivakkam",
  address: "Mount-Poonamallee Road, Mugalivakkam, Chennai 600125",
  lat: 13.0210,
  lng: 80.1614,
  open: true,
  comingSoon: false,
};

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
      selectedOutlet: DEFAULT_OUTLET,
      categories: [{ id: "all", label: "All Menu" }],
      menuItems: [],

      setSelectedOutlet: (selectedOutlet) => set({ selectedOutlet: selectedOutlet || DEFAULT_OUTLET }),
      setCategories: (categories) => set({ categories }),
      setMenuItems: (menuItems) => set({ menuItems }),
    }),
    {
      name: 'restaurant-storage-v2',
      storage: createJSONStorage(() => webSafeStorage),
      partialize: (state) => ({ selectedOutlet: state.selectedOutlet || DEFAULT_OUTLET }),
      onRehydrateStorage: () => (state) => {
        if (!state?.selectedOutlet) {
          useRestaurantStore.setState({ selectedOutlet: DEFAULT_OUTLET });
        }
      },
    }
  )
);

