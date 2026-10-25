/**
 * deliveryStatusUtils.ts
 *
 * SINGLE SOURCE OF TRUTH for all delivery status logic in the customer app.
 *
 * Source of truth for customer UI: orders.delivery_status (from backend).
 * Rider detail text: assignment.status (from /tracking endpoint).
 *
 * DO NOT duplicate status comparisons in individual screens.
 * Import from this file in: track-order.tsx, delivery-tracking.tsx,
 * delivery-completed.tsx, rider banner, and any future delivery screens.
 */

// ─── Canonical order.delivery_status values ───────────────────────────────────
// These are the exact values the backend emits in orders.delivery_status.
// delivery_status.py status_mapping determines these values.

export const DELIVERY_STATUS = {
  PENDING:                    'PENDING',
  CONFIRMED:                  'CONFIRMED',
  PREPARING:                  'PREPARING',
  READY:                      'READY',
  RIDER_SEARCHING:            'RIDER_SEARCHING',
  RIDER_ASSIGNED:             'RIDER_ASSIGNED',
  RIDER_GOING_TO_RESTAURANT:  'RIDER_GOING_TO_RESTAURANT',
  RIDER_ARRIVED_AT_RESTAURANT:'RIDER_ARRIVED_AT_RESTAURANT',
  PICKED_UP:                  'PICKED_UP',
  OUT_FOR_DELIVERY:           'OUT_FOR_DELIVERY',
  RIDER_ARRIVED:              'RIDER_ARRIVED',
  DELIVERED:                  'DELIVERED',
  DELIVERY_FAILED:            'DELIVERY_FAILED',
  CANCELLED:                  'CANCELLED',
} as const;

export type DeliveryStatusValue = typeof DELIVERY_STATUS[keyof typeof DELIVERY_STATUS];

// ─── Canonical assignment.status values ───────────────────────────────────────
// Used for the secondary rider-status card text only.
export const ASSIGNMENT_STATUS = {
  PENDING:              'PENDING',
  ASSIGNED:             'ASSIGNED',
  ACCEPTED:             'ACCEPTED',
  GOING_TO_RESTAURANT:  'GOING_TO_RESTAURANT',
  ARRIVED_AT_RESTAURANT:'ARRIVED_AT_RESTAURANT',
  PICKED_UP:            'PICKED_UP',
  OUT_FOR_DELIVERY:     'OUT_FOR_DELIVERY',
  ARRIVED_AT_CUSTOMER:  'ARRIVED_AT_CUSTOMER',
  DELIVERED:            'DELIVERED',
  REJECTED:             'REJECTED',
  FAILED:               'FAILED',
  CANCELLED:            'CANCELLED',
} as const;

// ─── Customer-facing labels for orders.delivery_status ────────────────────────

export const DELIVERY_STATUS_LABELS: Record<string, string> = {
  [DELIVERY_STATUS.PENDING]:                    'Order Received',
  [DELIVERY_STATUS.CONFIRMED]:                  'Order Received',
  [DELIVERY_STATUS.PREPARING]:                  'Preparing Your Order',
  [DELIVERY_STATUS.READY]:                      'Ready for Pickup',
  [DELIVERY_STATUS.RIDER_SEARCHING]:            'Finding Your Rider...',
  [DELIVERY_STATUS.RIDER_ASSIGNED]:             'Rider Assigned',
  [DELIVERY_STATUS.RIDER_GOING_TO_RESTAURANT]:  'Rider Heading to Restaurant',
  [DELIVERY_STATUS.RIDER_ARRIVED_AT_RESTAURANT]:'Rider at Restaurant',
  [DELIVERY_STATUS.PICKED_UP]:                  'Out for Delivery',
  [DELIVERY_STATUS.OUT_FOR_DELIVERY]:           'Out for Delivery',
  [DELIVERY_STATUS.RIDER_ARRIVED]:              'Rider Has Arrived',
  [DELIVERY_STATUS.DELIVERED]:                  'Delivered',
  [DELIVERY_STATUS.DELIVERY_FAILED]:            'Delivery Issue',
  [DELIVERY_STATUS.CANCELLED]:                  'Order Cancelled',
};

// ─── Secondary rider card text for assignment.status ──────────────────────────

export const ASSIGNMENT_STATUS_LABELS: Record<string, string> = {
  [ASSIGNMENT_STATUS.ASSIGNED]:             'Rider has been assigned',
  [ASSIGNMENT_STATUS.ACCEPTED]:             'Rider accepted your delivery',
  [ASSIGNMENT_STATUS.GOING_TO_RESTAURANT]:  'Rider heading to restaurant',
  [ASSIGNMENT_STATUS.ARRIVED_AT_RESTAURANT]:'Rider at restaurant',
  [ASSIGNMENT_STATUS.PICKED_UP]:            'Order picked up',
  [ASSIGNMENT_STATUS.ARRIVED_AT_CUSTOMER]:  'Rider has arrived',
  [ASSIGNMENT_STATUS.DELIVERED]:            'Delivered',
};

// ─── Navigation / Render Decision Helpers ─────────────────────────────────────

/**
 * Returns true when the live map should be shown to the customer.
 * Only after rider picks up the order.
 */
export function isLiveTrackingStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  return [
    DELIVERY_STATUS.PICKED_UP,
    DELIVERY_STATUS.OUT_FOR_DELIVERY,
    DELIVERY_STATUS.RIDER_ARRIVED,
  ].includes(status.toUpperCase() as 'PICKED_UP' | 'OUT_FOR_DELIVERY' | 'RIDER_ARRIVED');
}

/**
 * Returns true when the order has been delivered.
 * Navigate to delivery-completed ONCE when this is true.
 */
export function isDeliveredStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  return status.toUpperCase() === DELIVERY_STATUS.DELIVERED;
}

/**
 * Returns true for terminal statuses — stop polling when these are reached.
 */
export function isTerminalStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  const s = status.toUpperCase();
  return (
    s === DELIVERY_STATUS.DELIVERED ||
    s === DELIVERY_STATUS.DELIVERY_FAILED ||
    s === DELIVERY_STATUS.CANCELLED
  );
}

/**
 * Returns true for statuses before the rider picks up the order.
 * During this phase, track-order.tsx should remain visible (no live map).
 */
export function isPrePickupStatus(status: string | null | undefined): boolean {
  if (!status) return true; // treat unknown as pre-pickup to be safe
  return !isLiveTrackingStatus(status) && !isDeliveredStatus(status);
}

// ─── Delivery Progress Step ────────────────────────────────────────────────────
//
// 5-step delivery progress:
//   0: Order Received  (PENDING / CONFIRMED)
//   1: Preparing       (PREPARING)
//   2: Ready           (READY)
//   3: Rider Assigned  (RIDER_SEARCHING / RIDER_ASSIGNED / RIDER_GOING_TO_RESTAURANT / RIDER_ARRIVED_AT_RESTAURANT)
//   4: Out for Delivery (PICKED_UP / OUT_FOR_DELIVERY / RIDER_ARRIVED / DELIVERED)
//
// Note: orderStatus and deliveryStatus can overlap (e.g. PREPARING + RIDER_ASSIGNED).
// Take the max step from both to show the most advanced state.

export function getDeliveryProgressStep(
  orderStatus: string | null | undefined,
  deliveryStatus: string | null | undefined,
): number {
  const os = (orderStatus || '').toUpperCase();
  const ds = (deliveryStatus || '').toUpperCase();

  let step = 0;

  // From kitchen order status
  if (os === 'PREPARING') step = Math.max(step, 1);
  if (os === 'READY' || os === 'SERVED' || os === 'COMPLETED') step = Math.max(step, 2);

  // From delivery_status
  if (ds === DELIVERY_STATUS.PREPARING) step = Math.max(step, 1);
  if (ds === DELIVERY_STATUS.READY) step = Math.max(step, 2);
  
  // Skip RIDER_ASSIGNED logic for progress bar, it stays at step 2 or whatever kitchen is at.
  
  if (
    ds === DELIVERY_STATUS.PICKED_UP ||
    ds === DELIVERY_STATUS.OUT_FOR_DELIVERY ||
    ds === DELIVERY_STATUS.RIDER_ARRIVED
  ) step = Math.max(step, 3);
  
  if (ds === DELIVERY_STATUS.DELIVERED) step = Math.max(step, 4);

  return step;
}

// ─── Contextual Status Text (no hardcoded ETAs) ───────────────────────────────

/**
 * Returns a contextual (non-numeric) status description.
 * Never returns fake time estimates like "10-15 min".
 */
export function getDeliveryContextText(status: string | null | undefined): string {
  if (!status) return 'Your order has been received';
  const s = status.toUpperCase();

  switch (s) {
    case DELIVERY_STATUS.PENDING:
    case DELIVERY_STATUS.CONFIRMED:
      return 'Your order has been received';
    case DELIVERY_STATUS.PREPARING:
      return 'Your order is being prepared';
    case DELIVERY_STATUS.READY:
      return 'Your order is ready for pickup';
    case DELIVERY_STATUS.RIDER_SEARCHING:
      return 'Finding the best rider for you';
    case DELIVERY_STATUS.RIDER_ASSIGNED:
      return 'Your rider has been assigned';
    case DELIVERY_STATUS.RIDER_GOING_TO_RESTAURANT:
      return 'Your rider is heading to the restaurant';
    case DELIVERY_STATUS.RIDER_ARRIVED_AT_RESTAURANT:
      return 'Your rider is at the restaurant';
    case DELIVERY_STATUS.PICKED_UP:
    case DELIVERY_STATUS.OUT_FOR_DELIVERY:
      return 'Your rider is on the way';
    case DELIVERY_STATUS.RIDER_ARRIVED:
      return 'Your rider has arrived';
    case DELIVERY_STATUS.DELIVERED:
      return 'Your order has been delivered';
    case DELIVERY_STATUS.DELIVERY_FAILED:
      return 'There was a delivery issue. Please contact support.';
    case DELIVERY_STATUS.CANCELLED:
      return 'Your order has been cancelled';
    default:
      return 'Your order is in progress';
  }
}

// ─── Status Priority Order (for regression prevention) ────────────────────────
// Higher index = more advanced state. Never regress to a lower index.

export const ORDER_STATUS_PRIORITY: Record<string, number> = {
  'PENDING':   0,
  'CONFIRMED': 1,
  'PREPARING': 2,
  'READY':     3,
  'SERVED':    4,
  'COMPLETED': 5,
  'DELIVERED': 6,
};

export const DELIVERY_STATUS_PRIORITY: Record<string, number> = {
  [DELIVERY_STATUS.PENDING]:                    0,
  [DELIVERY_STATUS.CONFIRMED]:                  1,
  [DELIVERY_STATUS.PREPARING]:                  2,
  [DELIVERY_STATUS.READY]:                      3,
  [DELIVERY_STATUS.RIDER_SEARCHING]:            4,
  [DELIVERY_STATUS.RIDER_ASSIGNED]:             5,
  [DELIVERY_STATUS.RIDER_GOING_TO_RESTAURANT]:  6,
  [DELIVERY_STATUS.RIDER_ARRIVED_AT_RESTAURANT]:7,
  [DELIVERY_STATUS.PICKED_UP]:                  8,
  [DELIVERY_STATUS.OUT_FOR_DELIVERY]:           9,
  [DELIVERY_STATUS.RIDER_ARRIVED]:              10,
  [DELIVERY_STATUS.DELIVERED]:                  11,
  [DELIVERY_STATUS.DELIVERY_FAILED]:            11,
  [DELIVERY_STATUS.CANCELLED]:                  11,
};

/**
 * Returns the new status only if it represents an equal or more advanced state.
 * Use this to prevent stale poll responses from regressing the UI.
 */
export function resolveDeliveryStatus(
  current: string | null | undefined,
  incoming: string | null | undefined,
): string {
  if (!incoming) return current || '';
  if (!current) return incoming.toUpperCase();
  const currPriority = DELIVERY_STATUS_PRIORITY[current.toUpperCase()] ?? -1;
  const incomPriority = DELIVERY_STATUS_PRIORITY[incoming.toUpperCase()] ?? -1;
  return incomPriority >= currPriority ? incoming.toUpperCase() : current.toUpperCase();
}

export function resolveOrderStatus(
  current: string | null | undefined,
  incoming: string | null | undefined,
): string {
  if (!incoming) return current || '';
  if (!current) return incoming.toUpperCase();
  const currPriority = ORDER_STATUS_PRIORITY[current.toUpperCase()] ?? -1;
  const incomPriority = ORDER_STATUS_PRIORITY[incoming.toUpperCase()] ?? -1;
  return incomPriority >= currPriority ? incoming.toUpperCase() : current.toUpperCase();
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Normalize a raw delivery_status string from the API to uppercase. */
export function normalizeDeliveryStatus(raw: string | null | undefined): string {
  return (raw || '').toUpperCase();
}

/** Get a label for a status, with a safe fallback. */
export function getLabelForStatus(status: string | null | undefined): string {
  if (!status) return 'Order Received';
  return DELIVERY_STATUS_LABELS[status.toUpperCase()] || status;
}

/** Get secondary rider card text for an assignment status. */
export function getLabelForAssignment(assignmentStatus: string | null | undefined): string {
  if (!assignmentStatus) return '';
  return ASSIGNMENT_STATUS_LABELS[assignmentStatus.toUpperCase()] || assignmentStatus;
}
