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

export interface DineInItem {
  id: number | string;
  name: string;
  price: number;
  quantity: number;
  image?: string;
  category?: string;
}

export interface DineInBatch {
  id: string;
  items: any[];
  status: string;
  total: number;
}

export interface DineInOrderRound {
  id: number;
  orderId: string;
  round?: number;
  status: string;
  payment_status: string;
  total_amount: number;
  created_at?: string;
  items: any[];
}

interface DineInSessionState {
  isActive: boolean;
  tableNumber: string | null;
  tableId: string | null;
  sessionId: string | null;
  sessionDbId: number | null;
  sessionUid: string | null;
  activeOrderId: string | null;
  activeDbOrderId: number | string | null;
  orderedItems: DineInItem[];
  totalAmount: number;
  unpaidTotal: number;
  paymentStatus: 'Pending' | 'Paid';
  batches: DineInBatch[];
  orderRounds: DineInOrderRound[];

  startDineInOrder: (
    tableNumber: string,
    orderId: string,
    dbOrderId: number | string,
    items: DineInItem[],
    total: number,
    sessionData?: { sessionId?: number; sessionUid?: string }
  ) => void;
  appendOrderRound: (
    orderId: string,
    dbOrderId: number | string,
    items: DineInItem[],
    total: number
  ) => void;
  appendItemsToOrder: (newItems: DineInItem[], additionalAmount: number) => void;
  syncWithBackendOrder: (items: DineInItem[], totalAmount: number, paymentStatus?: 'Pending' | 'Paid') => void;
  syncSessionDetails: (sessionData: {
    sessionId: number;
    sessionUid: string;
    tableNumber: string;
    totalAmount: number;
    paymentStatus: 'Pending' | 'Paid';
    status?: string;
    orders: DineInOrderRound[];
    allItems?: DineInItem[];
  }) => void;
  completeDineInSession: () => void;

  // Backward-compatibility aliases
  startSession: (tableId: string, sessionId: string) => void;
  addBatch: (batch: DineInBatch) => void;
  updateBatchStatus: (batchId: string, status: string) => void;
  closeSession: () => void;
}

export const useDineInSessionStore = create<DineInSessionState>()(
  persist(
    (set, get) => ({
      isActive: false,
      tableNumber: null,
      tableId: null,
      sessionId: null,
      sessionDbId: null,
      sessionUid: null,
      activeOrderId: null,
      activeDbOrderId: null,
      orderedItems: [],
      totalAmount: 0,
      unpaidTotal: 0,
      paymentStatus: 'Pending',
      batches: [],
      orderRounds: [],

      startDineInOrder: (tableNumber, orderId, dbOrderId, items, total, sessionData) =>
        set({
          isActive: true,
          tableNumber,
          tableId: tableNumber,
          activeOrderId: orderId,
          activeDbOrderId: dbOrderId,
          sessionId: sessionData?.sessionUid || orderId,
          sessionUid: sessionData?.sessionUid || null,
          sessionDbId: sessionData?.sessionId || null,
          orderedItems: [...items],
          totalAmount: total,
          unpaidTotal: total,
          paymentStatus: 'Pending',
          batches: [
            {
              id: `batch-${Date.now()}`,
              items: [...items],
              status: 'CONFIRMED',
              total,
            },
          ],
          orderRounds: [
            {
              id: Number(dbOrderId) || 1,
              orderId,
              round: 1,
              status: 'PENDING',
              payment_status: 'Pending',
              total_amount: total,
              items: [...items],
            },
          ],
        }),

      appendOrderRound: (orderId, dbOrderId, items, total) =>
        set((state) => {
          const newTotal = state.totalAmount + total;
          const newRounds = [
            ...state.orderRounds,
            {
              id: Number(dbOrderId) || state.orderRounds.length + 1,
              orderId,
              round: state.orderRounds.length + 1,
              status: 'PENDING',
              payment_status: 'Pending',
              total_amount: total,
              items: [...items],
            },
          ];
          const newOrderedItems = [...state.orderedItems, ...items];
          return {
            activeOrderId: orderId,
            activeDbOrderId: dbOrderId,
            orderedItems: newOrderedItems,
            totalAmount: newTotal,
            unpaidTotal: newTotal,
            orderRounds: newRounds,
          };
        }),

      appendItemsToOrder: (newItems, additionalAmount) =>
        set((state) => {
          const existingItems = [...state.orderedItems];
          newItems.forEach((newItem) => {
            const idx = existingItems.findIndex((x) => x.id === newItem.id);
            if (idx > -1) {
              existingItems[idx] = {
                ...existingItems[idx],
                quantity: existingItems[idx].quantity + newItem.quantity,
              };
            } else {
              existingItems.push(newItem);
            }
          });

          const newTotal = state.totalAmount + additionalAmount;
          return {
            orderedItems: existingItems,
            totalAmount: newTotal,
            unpaidTotal: newTotal,
            batches: [
              ...state.batches,
              {
                id: `batch-${Date.now()}`,
                items: [...newItems],
                status: 'CONFIRMED',
                total: additionalAmount,
              },
            ],
          };
        }),

      syncWithBackendOrder: (items, totalAmount, paymentStatus = 'Pending') =>
        set((state) => ({
          orderedItems: [...items],
          totalAmount: totalAmount,
          unpaidTotal: paymentStatus === 'Paid' ? 0 : totalAmount,
          paymentStatus: paymentStatus,
        })),

      syncSessionDetails: (sessionData) =>
        set((state) => {
          const activeRounds = (sessionData.orders || []).filter(
            (o) => (o.status || '').toUpperCase() !== 'CANCELLED'
          );
          const allCancelled = (sessionData.orders || []).length > 0 && activeRounds.length === 0;
          const isSessionActive = sessionData.paymentStatus !== 'Paid' && !allCancelled && (sessionData.status || '').toUpperCase() !== 'CANCELLED';

          if (!isSessionActive) {
            return {
              isActive: false,
              tableNumber: null,
              tableId: null,
              sessionDbId: null,
              sessionUid: null,
              sessionId: null,
              totalAmount: 0,
              unpaidTotal: 0,
              paymentStatus: sessionData.paymentStatus || 'Paid',
              orderRounds: [],
              orderedItems: [],
              activeOrderId: null,
              activeDbOrderId: null,
              batches: [],
            };
          }

          const rawItems = sessionData.allItems && sessionData.allItems.length > 0
            ? sessionData.allItems
            : activeRounds.flatMap((o) => (o.items || []).filter((it: any) => (it.status || '').toUpperCase() !== 'CANCELLED'));
          const latestOrder = activeRounds.length > 0 ? activeRounds[activeRounds.length - 1] : null;

          return {
            isActive: true,
            tableNumber: sessionData.tableNumber || state.tableNumber,
            tableId: sessionData.tableNumber || state.tableId,
            sessionDbId: sessionData.sessionId,
            sessionUid: sessionData.sessionUid,
            sessionId: sessionData.sessionUid,
            totalAmount: sessionData.totalAmount || 0,
            unpaidTotal: sessionData.paymentStatus === 'Paid' ? 0 : (sessionData.totalAmount || 0),
            paymentStatus: sessionData.paymentStatus,
            orderRounds: activeRounds,
            orderedItems: rawItems.length > 0 ? rawItems : state.orderedItems,
            activeOrderId: latestOrder ? latestOrder.orderId : state.activeOrderId,
            activeDbOrderId: latestOrder ? latestOrder.id : state.activeDbOrderId,
          };
        }),

      completeDineInSession: () => {
        try {
          AsyncStorage.removeItem('dineInTable').catch(() => {});
          if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
            localStorage.removeItem('dineInTable');
          }
          delete (globalThis as any).dineInTable;
        } catch (e) {
          // ignore cleanup errors
        }
        set({
          isActive: false,
          tableNumber: null,
          tableId: null,
          sessionId: null,
          sessionDbId: null,
          sessionUid: null,
          activeOrderId: null,
          activeDbOrderId: null,
          orderedItems: [],
          totalAmount: 0,
          unpaidTotal: 0,
          paymentStatus: 'Paid',
          batches: [],
          orderRounds: [],
        });
      },

      // Backward-compatible methods
      startSession: (tableId, sessionId) =>
        set({
          isActive: true,
          tableId,
          tableNumber: tableId,
          sessionId,
          activeOrderId: sessionId,
          orderedItems: [],
          totalAmount: 0,
          unpaidTotal: 0,
          paymentStatus: 'Pending',
          batches: [],
        }),

      addBatch: (batch) =>
        set((state) => ({
          batches: [...state.batches, batch],
          unpaidTotal: state.unpaidTotal + batch.total,
          totalAmount: state.totalAmount + batch.total,
        })),

      updateBatchStatus: (batchId, status) =>
        set((state) => ({
          batches: state.batches.map((b) => (b.id === batchId ? { ...b, status } : b)),
        })),

      closeSession: () =>
        set({
          isActive: false,
          tableNumber: null,
          tableId: null,
          sessionId: null,
          activeOrderId: null,
          activeDbOrderId: null,
          orderedItems: [],
          totalAmount: 0,
          unpaidTotal: 0,
          paymentStatus: 'Paid',
          batches: [],
        }),
    }),
    {
      name: 'dine-in-session-storage',
      storage: createJSONStorage(() => webSafeStorage),
    }
  )
);
