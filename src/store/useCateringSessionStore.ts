import { create } from 'zustand';

interface CateringSessionState {
  orderType: 'Catering Order' | 'Party Order';
  eventName: string;
  date: string;
  time: string;
  occasion: string;
  guestCount: string;
  serviceType: string;
  address: string;
  restaurantId: number | null;
  restaurantName: string | null;
  setOrderType: (type: 'Catering Order' | 'Party Order') => void;
  setRestaurant: (id: number | null, name?: string | null) => void;
  setEventDetails: (details: Partial<CateringSessionState>) => void;
  reset: () => void;
}

export const useCateringSessionStore = create<CateringSessionState>((set) => ({
  orderType: 'Catering Order',
  eventName: '',
  date: '',
  time: '',
  occasion: '',
  guestCount: '50',
  serviceType: 'Delivery Only',
  address: '',
  restaurantId: null,
  restaurantName: null,
  setOrderType: (type) => set({ orderType: type }),
  setRestaurant: (id, name) => set({ restaurantId: id, restaurantName: name || null }),
  setEventDetails: (details) => set((state) => ({ ...state, ...details })),
  reset: () => set({
    orderType: 'Catering Order',
    eventName: '',
    date: '',
    time: '',
    occasion: '',
    guestCount: '50',
    serviceType: 'Delivery Only',
    address: '',
    restaurantId: null,
    restaurantName: null,
  }),
}));
