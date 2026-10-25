import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface FavoriteItem {
  favorite_id: number;
  menu_item_id: number;
  name: string;
  price: number;
  image_url: string | null;
  is_veg: boolean;
}

interface FavoritesState {
  favorites: FavoriteItem[];
  setFavorites: (favorites: FavoriteItem[]) => void;
  addFavorite: (item: FavoriteItem) => void;
  removeFavorite: (menuItemId: number) => void;
  clearFavorites: () => void;
  isFavorite: (menuItemId: number) => boolean;
}

export const useFavoritesStore = create<FavoritesState>()(
  persist(
    (set, get) => ({
      favorites: [],

      setFavorites: (favorites) => set({ favorites }),

      addFavorite: (item) =>
        set((state) => {
          if (state.favorites.some((f) => f.menu_item_id === item.menu_item_id)) {
            return state;
          }
          return { favorites: [...state.favorites, item] };
        }),

      removeFavorite: (menuItemId) =>
        set((state) => ({
          favorites: state.favorites.filter((f) => f.menu_item_id !== menuItemId),
        })),

      clearFavorites: () => set({ favorites: [] }),

      isFavorite: (menuItemId) => get().favorites.some((f) => f.menu_item_id === menuItemId),
    }),
    {
      name: 'favorites-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ favorites: state.favorites }),
    }
  )
);
