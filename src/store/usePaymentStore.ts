import { create } from 'zustand';

interface PaymentState {
  paymentMethod: 'UPI' | 'Cash' | null;
  paymentStatus: 'pending' | 'success' | 'failed' | null;
  transactionId: string | null;
  paymentTimestamp: string | null;

  setPaymentMethod: (method: 'UPI' | 'Cash') => void;
  setPaymentSuccess: (transactionId: string) => void;
  setPaymentFailed: () => void;
  clearPayment: () => void;
}

export const usePaymentStore = create<PaymentState>((set) => ({
  paymentMethod: 'UPI',
  paymentStatus: null,
  transactionId: null,
  paymentTimestamp: null,

  setPaymentMethod: (method) => set({ paymentMethod: method }),
  setPaymentSuccess: (transactionId) => set({
    paymentStatus: 'success',
    transactionId,
    paymentTimestamp: new Date().toISOString()
  }),
  setPaymentFailed: () => set({ paymentStatus: 'failed' }),
  clearPayment: () => set({
    paymentMethod: null,
    paymentStatus: null,
    transactionId: null,
    paymentTimestamp: null
  })
}));
