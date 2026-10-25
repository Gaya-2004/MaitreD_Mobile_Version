/**
 * agentContext.ts
 *
 * PHASE 5 — getMobileAgentContext()
 *
 * Gathers CURRENT frontend state to provide context to the Vapi assistant.
 * Only safe, non-sensitive data is included.
 * 
 * NEVER includes: DB credentials, tokens, Razorpay secrets, other customers' data.
 */

import { useAuthStore } from '../store/useAuthStore';
import { useCartStore } from '../store/useCartStore';
import { useRestaurantStore } from '../store/useRestaurantStore';
import { useLiveOrderStore } from '../store/useLiveOrderStore';
import { useDineInSessionStore } from '../store/useDineInSessionStore';

export interface MobileAgentContext {
  auth: {
    isAuthenticated: boolean;
    customerId: number | null;
    customerName: string | null;
    phone: string | null;
  };
  restaurant: {
    selectedOutletId: number | null;
    selectedOutletName: string | null;
  };
  cart: {
    orderType: string;
    itemCount: number;
    subtotal: number;
    tableNumber: string;
    items: { id: string | number; name: string; quantity: number; price: number }[];
  };
  liveOrder: {
    hasActiveOrder: boolean;
    orderType: string | null;
    orderId: string | null;
    dbOrderId: string | null;
    status: string | null;
  };
  dineIn: {
    isActive: boolean;
    tableNumber: string | null;
    activeOrderId: string | null;
    totalAmount: number;
    itemCount: number;
  };
}

export function getMobileAgentContext(): MobileAgentContext {
  const auth = useAuthStore.getState();
  const cart = useCartStore.getState();
  const restaurant = useRestaurantStore.getState();
  const liveOrder = useLiveOrderStore.getState();
  const dineIn = useDineInSessionStore.getState();

  const cartItems = Object.values(cart.items).map(i => ({
    id: i.id,
    name: i.name,
    quantity: i.quantity,
    price: i.price,
  }));

  return {
    auth: {
      isAuthenticated: auth.isAuthenticated,
      customerId: auth.customerId,
      customerName: auth.customerName,
      phone: auth.phone,
    },
    restaurant: {
      selectedOutletId: restaurant.selectedOutlet?.restaurant_id ?? null,
      selectedOutletName: restaurant.selectedOutlet?.name ?? null,
    },
    cart: {
      orderType: cart.orderType,
      itemCount: cart.getItemCount(),
      subtotal: cart.getSubtotal(),
      tableNumber: cart.tableNumber,
      items: cartItems,
    },
    liveOrder: {
      hasActiveOrder: !!liveOrder.dbOrderId,
      orderType: liveOrder.orderType,
      orderId: liveOrder.orderId,
      dbOrderId: liveOrder.dbOrderId,
      status: liveOrder.status,
    },
    dineIn: {
      isActive: dineIn.isActive,
      tableNumber: dineIn.tableNumber,
      activeOrderId: dineIn.activeOrderId,
      totalAmount: dineIn.totalAmount,
      itemCount: dineIn.orderedItems?.length ?? 0,
    },
  };
}
