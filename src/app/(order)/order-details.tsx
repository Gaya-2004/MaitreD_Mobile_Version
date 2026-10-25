import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  StatusBar,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { orderApi } from '../../services/apiService';
import { getFullImageUrl } from '../../constants/api';
import { useCartStore, useRestaurantStore, useOrderStore, useLiveOrderStore } from '../../store';
import { useDineInSessionStore } from '../../store/useDineInSessionStore';
import BottomNavBar from '../../components/layout/BottomNavBar';
import { formatOrderDate } from '../../utils/dateUtils';

const DEFAULT_FOOD_IMAGE = 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=200';

export default function OrderDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    orderId?: string;
    isHistorical?: string;
    restaurantId?: string;
    orderJson?: string;
    displayOrderId?: string;
  }>();

  const { clearCart, addItem, setOrderType } = useCartStore();
  const { selectedOutlet } = useRestaurantStore();

  // Instant data initialization from route params if available
  const initialData = useMemo(() => {
    if (params.orderJson) {
      try {
        const parsed = JSON.parse(params.orderJson);
        return parsed;
      } catch (_) {}
    }
    return null;
  }, [params.orderJson]);

  const [order, setOrder] = useState<any>(initialData);
  const [items, setItems] = useState<any[]>(() => {
    if (initialData?.items) {
      if (Array.isArray(initialData.items)) return initialData.items;
      if (typeof initialData.items === 'string') {
        try {
          const parsed = JSON.parse(initialData.items);
          if (Array.isArray(parsed)) return parsed;
        } catch (_) {}
      }
    }
    return [];
  });
  const [loading, setLoading] = useState(() => {
    const rawId = params.orderId || initialData?.dbOrderId || initialData?.dbId || initialData?.id;
    return Boolean(!initialData && rawId);
  });

  useEffect(() => {
    const rawId = params.orderId || initialData?.dbOrderId || initialData?.dbId || initialData?.id;
    if (!rawId) {
      return;
    }

    const resId = Number(params.restaurantId) || selectedOutlet?.restaurant_id || 1;

    orderApi.getOrderDetails(String(rawId), Number(resId))
      .then((data: any) => {
        if (data && data.order) {
          let mappedType = data.order.order_type || 'Dine In';
          if (mappedType === 'DINE_IN') mappedType = 'Dine In';
          if (mappedType === 'TAKEAWAY') mappedType = 'Take Away';
          if (mappedType === 'DELIVERY') mappedType = 'Delivery';
          data.order.order_type = mappedType;

          setOrder(data.order);
          if (Array.isArray(data.items) && data.items.length > 0) {
            setItems(data.items);
          }
        }
      })
      .catch((err) => {
        console.warn('[OrderDetails] Fetch error:', err?.message || err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [params.orderId, params.restaurantId, initialData, selectedOutlet]);

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/orders');
    }
  };

  const handleInvoice = () => {
    if (!order) return;
    router.push({
      pathname: '/(checkout)/invoice' as any,
      params: {
        dbOrderId: String(order.id || order.dbOrderId || params.orderId || ''),
        orderId: String(order.orderId || (order.id ? `ORD-${order.id}` : '') || ''),
        billNo: order.bill_no ? String(order.bill_no) : '',
        orderType: String(order.order_type || 'Dine In'),
        tableNumber: String(order.table_number || order.table || ''),
        restaurantId: String(order.restaurant_id || params.restaurantId || ''),
        finalTotal: String(order.total_amount || order.finalTotal || order.total || ''),
        subtotal: String(order.subtotal || ''),
        discountAmount: String(order.discount_amount || '0'),
        discountCode: String(order.discount_code || ''),
        paymentMethod: String(order.payment_method || 'UPI'),
        mobileNumber: String(order.customer_phone || order.phone || ''),
        customerName: String(order.customer_name || 'REGISTERED'),
        cartData: JSON.stringify(items || []),
      },
    });
  };

  const handleReorder = () => {
    if (!items || items.length === 0) {
      Alert.alert('Reorder', 'Item list not available for this order.');
      return;
    }
    clearCart();
    if (order?.order_type === 'Take Away') setOrderType('Take Away');
    else if (order?.order_type === 'Delivery') setOrderType('Delivery');
    else setOrderType('Dine In');

    items.forEach((item: any) => {
      addItem({
        id: String(item.menu_item_id || item.id),
        name: item.name || 'Special Item',
        price: Number(item.price || 0),
        quantity: Number(item.quantity || item.qty || 1),
        image: getFullImageUrl(item.image_url || item.image, item.name),
        category: 'Special',
      });
    });

    Alert.alert('Reordered', 'Items have been added to your cart.');
    router.push('/checkout');
  };

  const [cancelling, setCancelling] = useState(false);

  const handleCancelOrder = () => {
    const rawId = order?.id || params.orderId;
    if (!rawId) return;

    Alert.alert(
      "Cancel Order",
      "Are you sure you want to cancel this order? Once food preparation starts, cancellation is not possible.",
      [
        { text: "Keep Order", style: "cancel" },
        {
          text: "Yes, Cancel",
          style: "destructive",
          onPress: async () => {
            try {
              setCancelling(true);
              const restId = order?.restaurant_id ? Number(order.restaurant_id) : (selectedOutlet?.restaurant_id ? Number(selectedOutlet.restaurant_id) : undefined);
              await orderApi.cancelOrder(rawId, restId);
              Alert.alert("Order Cancelled", "Your order has been cancelled successfully.");
              setOrder((prev: any) => prev ? { ...prev, status: 'CANCELLED' } : null);
              useLiveOrderStore.getState().clearLiveOrder();
              useOrderStore.getState().clearCurrentOrder();

              const dStore = useDineInSessionStore.getState();
              if (dStore.isActive) {
                const currentRounds = dStore.orderRounds || [];
                const updatedRounds = currentRounds.map((r: any) => {
                  if (String(r.id) === String(rawId) || String(r.orderId).includes(String(rawId))) {
                    return { ...r, status: 'CANCELLED' };
                  }
                  return r;
                });
                const nonCancelled = updatedRounds.filter((r: any) => (r.status || '').toUpperCase() !== 'CANCELLED');
                if (nonCancelled.length === 0) {
                  dStore.completeDineInSession();
                } else {
                  const newTotal = nonCancelled.reduce((sum: number, r: any) => sum + (Number(r.total_amount) || 0), 0);
                  dStore.syncSessionDetails({
                    sessionId: dStore.sessionDbId || 0,
                    sessionUid: dStore.sessionUid || '',
                    tableNumber: dStore.tableNumber || '',
                    totalAmount: newTotal,
                    paymentStatus: dStore.paymentStatus || 'Pending',
                    orders: updatedRounds,
                    allItems: dStore.orderedItems || [],
                  });
                }
              }
            } catch (err: any) {
              const msg = err.message || '';
              if (msg.includes('409') || msg.toLowerCase().includes('preparing') || msg.toLowerCase().includes('already started')) {
                Alert.alert("Cancellation Unavailable", "Cancellation unavailable. The kitchen has already started preparing this order.");
              } else {
                Alert.alert("Cannot Cancel", msg || "Unable to cancel order at this stage.");
              }
            } finally {
              setCancelling(false);
            }
          }
        }
      ]
    );
  };

  // ── ID formatting ────────────────────────────────────────────────────────────
  const displayOrderIdText = useMemo(() => {
    const raw = String(order?.orderId || order?.id || params.displayOrderId || params.orderId || '').trim();
    if (!raw) return 'Order #DU-847294';
    if (raw.startsWith('DU-')) return `Order #${raw}`;
    if (raw.startsWith('#DU-')) return `Order ${raw}`;
    if (raw.startsWith('ORD-')) return `Order #${raw.replace('ORD-', 'DU-')}`;
    if (/^\d+$/.test(raw)) return `Order #DU-${raw.padStart(6, '0')}`;
    return `Order #${raw.replace(/^#/, '')}`;
  }, [order, params]);

  // ── Status styling ───────────────────────────────────────────────────────────
  const { statusLabel, statusBg, statusColor } = useMemo(() => {
    const s = String(order?.status || '').toUpperCase();
    const type = order?.order_type || '';

    if (s === 'CANCELLED') {
      return { statusLabel: 'Cancelled', statusBg: '#FEE2E2', statusColor: '#EF4444' };
    }
    if (s === 'PREPARING') {
      return { statusLabel: 'Preparing', statusBg: '#EFF6FF', statusColor: '#2563EB' };
    }
    if (s === 'CONFIRMED') {
      return { statusLabel: 'Confirmed', statusBg: '#EFF6FF', statusColor: '#2563EB' };
    }
    if (s === 'READY') {
      const label = type === 'Delivery' ? 'Ready for Delivery' : type === 'Take Away' ? 'Ready to Pick up' : 'Ready to Serve';
      return { statusLabel: label, statusBg: '#FEF3C7', statusColor: '#D97706' };
    }

    // Default completed
    if (type === 'Take Away') {
      return { statusLabel: 'Picked Up', statusBg: '#E8F8EE', statusColor: '#16A34A' };
    }
    if (type === 'Dine In') {
      return { statusLabel: 'Served', statusBg: '#E8F8EE', statusColor: '#16A34A' };
    }
    return { statusLabel: 'Delivered', statusBg: '#E8F8EE', statusColor: '#16A34A' };
  }, [order]);

  // ── Bill calculations ────────────────────────────────────────────────────────
  const subtotal = useMemo(() => {
    if (!items || items.length === 0) {
      return Number(order?.total_amount || order?.total || 0);
    }
    return items.reduce((sum, item) => {
      const p = Number(item.price || 0);
      const q = Number(item.quantity || item.qty || 1);
      return sum + p * q;
    }, 0);
  }, [items, order]);

  const isDelivery = order?.order_type === 'Delivery';
  const deliveryFee = isDelivery ? (Number(order?.delivery_fee) || 0) : 0;
  const discountAmount = Number(order?.discount_amount || 0);
  const taxesAmount = useMemo(() => {
    if (order?.gst_amount !== undefined && order?.gst_amount !== null && Number(order.gst_amount) > 0) {
      return Number(order.gst_amount);
    }
    return 0;
  }, [order]);

  const grandTotal = useMemo(() => {
    const rawTotal = Number(order?.total_amount || order?.total || 0);
    if (rawTotal > 0) return rawTotal;
    return subtotal + (isDelivery && deliveryFee > 0 ? deliveryFee : 0) + taxesAmount - discountAmount;
  }, [order, subtotal, isDelivery, deliveryFee, taxesAmount, discountAmount]);

  // ── Location & Payment ───────────────────────────────────────────────────────
  const deliveryLocationLabel = isDelivery
    ? 'DELIVERED TO'
    : (order?.order_type === 'Take Away' ? 'PICKED UP AT' : 'SERVED AT');

  const deliveryAddressText = useMemo(() => {
    if (isDelivery) {
      if (order?.delivery_address) {
        if (typeof order.delivery_address === 'string') return order.delivery_address;
        const a = order.delivery_address;
        const parts = [
          a.flat_no || a.house_no || a.flat_number || a.building,
          a.street_address || a.address_line || a.address || a.area,
          a.landmark ? `Near ${a.landmark}` : null,
          a.city || 'Bangalore',
          a.pincode ? `Bangalore - ${a.pincode}` : null,
        ].filter(Boolean);
        if (parts.length > 0) return parts.join(', ');
      }
      return order?.address || order?.customer_address || 'Flat 402, Sunshine Residency, Koramangala 3rd Block, Bangalore';
    }

    if (order?.order_type === 'Take Away') {
      return `${selectedOutlet?.name || 'Data Udipi'} — Takeaway Counter, Mount-Poonamallee Road`;
    }

    const tableStr = order?.table_number ? `Table ${order.table_number}` : 'Table T-01';
    return `${tableStr}, ${selectedOutlet?.name || 'Data Udipi — Mugalivakkam'}`;
  }, [order, isDelivery, selectedOutlet]);

  const paymentMethodText = useMemo(() => {
    const method = String(order?.payment_method || '').trim();
    if (!method) return 'Google Pay (UPI)';
    const lower = method.toLowerCase();
    if (lower.includes('google') || lower.includes('gpay')) return 'Google Pay (UPI)';
    if (lower.includes('phonepe')) return 'PhonePe (UPI)';
    if (lower.includes('paytm')) return 'Paytm (UPI)';
    if (lower.includes('counter')) return 'Paid (Pay at Counter)';
    if (lower.includes('cash') || lower.includes('cod')) return 'Cash on Delivery';
    if (lower.includes('razorpay')) return 'Razorpay (UPI)';
    if (lower.includes('upi')) return `${method}`;
    return method;
  }, [order]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color="#FF4500" />
      </SafeAreaView>
    );
  }

  if (!order && items.length === 0) {
    return (
      <SafeAreaView style={[styles.container, styles.center]}>
        <Text style={{ fontSize: 16, color: '#666', marginBottom: 16 }}>Order details not found</Text>
        <TouchableOpacity style={styles.backButtonSimple} onPress={handleBack}>
          <Text style={{ color: '#FF4500', fontWeight: 'bold' }}>Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* ── Top Bar ── */}
      <View style={styles.topHeader}>
        <TouchableOpacity style={styles.backBtn} onPress={handleBack} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.topHeaderTitle}>Order Details</Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 110 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Order Header ── */}
        <View style={styles.orderHeaderRow}>
          <View style={{ flex: 1, paddingRight: 8 }}>
            <Text style={styles.orderIdTitle}>{displayOrderIdText}</Text>
            <Text style={styles.orderDateSubtitle}>
              {formatOrderDate(order?.created_at || order?.date)}
            </Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusBg }]}>
            <Text style={[styles.statusBadgeText, { color: statusColor }]}>{statusLabel}</Text>
          </View>
        </View>

        <View style={styles.divider} />

        {/* ── Items List ── */}
        {items.map((item: any, idx: number) => {
          const qty = Number(item.quantity || item.qty || 1);
          const price = Number(item.price || 0);
          const itemTotal = price * qty;
          const imageUri = getFullImageUrl(item.image_url || item.image, item.name);

          return (
            <View key={item.id || item.menu_item_id || idx} style={styles.itemRow}>
              <Image
                source={{ uri: imageUri || DEFAULT_FOOD_IMAGE }}
                style={styles.itemImage}
                defaultSource={{ uri: DEFAULT_FOOD_IMAGE }}
              />
              <View style={styles.itemInfo}>
                <Text style={styles.itemName} numberOfLines={1}>{item.name || 'Menu Item'}</Text>
                <Text style={styles.itemQty}>Qty: {qty} • Rs. {price.toFixed(0)} each</Text>
              </View>
              <Text style={styles.itemTotal}>Rs. {itemTotal.toFixed(0)}</Text>
            </View>
          );
        })}

        <View style={styles.divider} />

        {/* ── Bill Breakdown ── */}
        <View style={styles.billRow}>
          <Text style={styles.billLabel}>Subtotal</Text>
          <Text style={styles.billValue}>Rs. {subtotal.toFixed(0)}</Text>
        </View>

        {isDelivery && (
          <View style={styles.billRow}>
            <Text style={styles.billLabel}>Delivery Fee</Text>
            {deliveryFee === 0 ? (
              <Text style={styles.billValue}>
                <Text style={styles.strikethrough}>Rs. 40</Text>
                <Text style={styles.freeText}> FREE</Text>
              </Text>
            ) : (
              <Text style={styles.billValue}>Rs. {deliveryFee.toFixed(0)}</Text>
            )}
          </View>
        )}

        {discountAmount > 0 && (
          <View style={styles.billRow}>
            <Text style={styles.billLabel}>Discount</Text>
            <Text style={[styles.billValue, { color: '#EF4444' }]}>
              - Rs. {discountAmount.toFixed(2)}
            </Text>
          </View>
        )}

        {taxesAmount > 0 && (
          <View style={styles.billRow}>
            <Text style={styles.billLabel}>Taxes & charges</Text>
            <Text style={styles.billValue}>Rs. {taxesAmount.toFixed(2)}</Text>
          </View>
        )}

        <View style={styles.grandTotalRow}>
          <Text style={styles.grandTotalLabel}>Grand Total</Text>
          <Text style={styles.grandTotalValue}>Rs. {grandTotal.toFixed(2)}</Text>
        </View>

        <View style={styles.divider} />

        {/* ── Delivery / Service Destination ── */}
        <View style={styles.metaSection}>
          <Text style={styles.metaSectionLabel}>{deliveryLocationLabel}</Text>
          <Text style={styles.metaSectionValue}>{deliveryAddressText}</Text>
        </View>

        {/* ── Payment Method ── */}
        <View style={styles.metaSection}>
          <Text style={styles.metaSectionLabel}>PAYMENT METHOD</Text>
          <View style={styles.paymentMethodRow}>
            <Ionicons name="card-outline" size={18} color="#4B5563" />
            <Text style={styles.paymentMethodText}>{paymentMethodText}</Text>
          </View>
        </View>

        {/* ── Action Buttons ── */}
        <View style={styles.actionButtonsRow}>
          {['PENDING', 'CONFIRMED'].includes(String(order?.status || '').toUpperCase()) && (
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={handleCancelOrder}
              disabled={cancelling}
              activeOpacity={0.8}
            >
              {cancelling ? (
                <ActivityIndicator size="small" color="#EF4444" />
              ) : (
                <Text style={styles.cancelBtnText}>Cancel Order</Text>
              )}
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.invoiceBtn} onPress={handleInvoice} activeOpacity={0.8}>
            <Text style={styles.invoiceBtnText}>Invoice</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.reorderBtn} onPress={handleReorder} activeOpacity={0.8}>
            <Text style={styles.reorderBtnText}>Reorder</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* ── Bottom Nav Bar ── */}
      <BottomNavBar activeTab="orders" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButtonSimple: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FF4500',
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  backBtn: {
    padding: 4,
    marginRight: 12,
  },
  topHeaderTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    backgroundColor: '#FFFFFF',
  },
  orderHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  orderIdTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  orderDateSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 4,
  },
  statusBadge: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 20,
  },
  statusBadgeText: {
    fontSize: 13,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: '#F3F4F6',
    marginVertical: 18,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  itemImage: {
    width: 52,
    height: 52,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
  },
  itemInfo: {
    flex: 1,
    marginLeft: 14,
    marginRight: 12,
  },
  itemName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  itemQty: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 3,
  },
  itemTotal: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  billRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  billLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  billValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  strikethrough: {
    fontSize: 13,
    color: '#9CA3AF',
    textDecorationLine: 'line-through',
  },
  freeText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#16A34A',
  },
  grandTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
    marginBottom: 4,
  },
  grandTotalLabel: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FF4500',
  },
  grandTotalValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FF4500',
  },
  metaSection: {
    marginBottom: 18,
  },
  metaSectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  metaSectionValue: {
    fontSize: 14,
    color: '#1F2937',
    lineHeight: 20,
  },
  paymentMethodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  paymentMethodText: {
    fontSize: 14,
    color: '#1F2937',
    marginLeft: 8,
    fontWeight: '500',
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 18,
    marginBottom: 12,
  },
  invoiceBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  invoiceBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#4B5563',
  },
  reorderBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#FF4500',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reorderBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  cancelBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FECACA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#EF4444',
  },
});
