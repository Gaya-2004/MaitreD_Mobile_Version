import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface PaymentItem {
  id: string;
  category: 'card' | 'upi' | 'wallet';
  badgeType: 'VISA' | 'UPI' | 'Paytm' | 'MASTERCARD' | 'RUPAY' | 'AMEX' | 'PhonePe';
  title: string;
  subtitle: string;
}

const DEFAULT_PAYMENT_METHODS: PaymentItem[] = [];

interface PaymentMethodState {
  paymentMethods: PaymentItem[];
  selectedMethodId: string | null;
  addPaymentMethod: (item: PaymentItem) => void;
  removePaymentMethod: (id: string) => void;
  setSelectedMethod: (id: string | null) => void;
  clearPaymentMethods: () => void;
}

export const usePaymentMethodStore = create<PaymentMethodState>()(
  persist(
    (set) => ({
      paymentMethods: DEFAULT_PAYMENT_METHODS,
      selectedMethodId: null,

      addPaymentMethod: (item) =>
        set((state) => ({
          paymentMethods: [...state.paymentMethods, item],
          selectedMethodId: item.id, // Auto-select the newly added method
        })),

      removePaymentMethod: (id) =>
        set((state) => {
          const newMethods = state.paymentMethods.filter((item) => item.id !== id);
          return {
            paymentMethods: newMethods,
            selectedMethodId: state.selectedMethodId === id 
              ? (newMethods.length > 0 ? newMethods[0].id : null) 
              : state.selectedMethodId,
          };
        }),

      setSelectedMethod: (id) => set({ selectedMethodId: id }),

      clearPaymentMethods: () => set({ paymentMethods: [], selectedMethodId: null }),
    }),
    {
      name: 'payment-method-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        paymentMethods: state.paymentMethods,
        selectedMethodId: state.selectedMethodId,
      }),
    }
  )
);
