import { useCartStore } from './useCartStore';
import { useOrderStore } from './useOrderStore';
import { useLiveOrderStore } from './useLiveOrderStore';
import { useDineInSessionStore } from './useDineInSessionStore';
// Note: usePaymentStore might need to be created or imported if it exists

export const completeTakeawaySession = (keepOrderId = true) => {
  useCartStore.getState().clearCart();
  
  if (!keepOrderId) {
    useOrderStore.getState().clearCurrentOrder();
    useLiveOrderStore.getState().clearLiveOrder();
  } else {
    // Retain completed order ID for receipt/feedback/reorder
    // We clear polling and live status, but keep the ID
    const liveStore = useLiveOrderStore.getState();
    liveStore.setPollingActive(false);
  }
};

export const completeDeliverySession = (keepOrderId = true) => {
  useCartStore.getState().clearCart();
  
  const liveStore = useLiveOrderStore.getState();
  liveStore.setPollingActive(false);
  
  if (!keepOrderId) {
    useOrderStore.getState().clearCurrentOrder();
    liveStore.clearLiveOrder();
  }
};

export const closeDineInSession = () => {
  useCartStore.getState().clearCart();
  useDineInSessionStore.getState().closeSession();
  useOrderStore.getState().clearCurrentOrder();
};
