import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, BackHandler, Platform, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRestaurantStore, useLiveOrderStore } from '../../store';
import { orderApi } from '../../services/apiService';
import { parseDate, formatTime } from '../../utils/dateUtils';

export default function DeliverySuccessScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { selectedOutlet } = useRestaurantStore();
  const params = useLocalSearchParams<{
    orderId: string;
    total: string;
    paymentMethod: string;
    phone: string;
    dbOrderId?: string;
    cart?: string;
    itemCount?: string;
    orderType?: string;
  }>();

  const [itemsName, setItemsName] = useState('Item x1');
  const [orderDetails, setOrderDetails] = useState<any>(null);
  const [cancelling, setCancelling] = useState(false);

  const handleCancelOrder = () => {
    const rawId = params.dbOrderId || (params.orderId ? params.orderId.replace(/\D/g, '') : '');
    if (!rawId) return;

    Alert.alert(
      "Cancel Delivery Order",
      "Are you sure you want to cancel this order? Once kitchen preparation begins, orders cannot be cancelled.",
      [
        { text: "Keep Order", style: "cancel" },
        {
          text: "Yes, Cancel",
          style: "destructive",
          onPress: async () => {
            try {
              setCancelling(true);
              const restId = selectedOutlet?.restaurant_id ? Number(selectedOutlet.restaurant_id) : undefined;
              await orderApi.cancelOrder(rawId, restId);
              useLiveOrderStore.getState().clearLiveOrder();
              Alert.alert("Order Cancelled", "Your delivery order has been cancelled successfully.", [
                { text: "Return Home", onPress: () => router.replace('/(main)/home') }
              ]);
            } catch (err: any) {
              const msg = err?.message || '';
              if (msg.includes('409') || msg.toLowerCase().includes('preparing') || msg.toLowerCase().includes('already started')) {
                Alert.alert("Cannot Cancel", "Cancellation unavailable. The kitchen has already started preparing this order.");
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

  useEffect(() => {
    const dbOrderId = params.dbOrderId;
    if (!dbOrderId) return;
    
    let intervalId: ReturnType<typeof setInterval>;
    const fetchOrderDetails = async () => {
      try {
        const restId = selectedOutlet?.restaurant_id ? Number(selectedOutlet.restaurant_id) : null;
        if (!restId) return;
        const data = await orderApi.getOrderDetails(dbOrderId, restId);
        if (data && data.order) {
          setOrderDetails(data);
        }
      } catch (err: any) {
        console.warn("Failed to fetch delivery order details", err?.message || err);
        if (err?.message?.includes("404") || err?.message?.includes("not found")) {
          if (intervalId) clearInterval(intervalId);
          useLiveOrderStore.getState().clearLiveOrder();
          Alert.alert("Order Not Found", "Your order could not be found on the server.", [
            { text: "OK", onPress: () => router.replace('/(main)/home') }
          ]);
        }
      }
    };

    fetchOrderDetails();
    intervalId = setInterval(fetchOrderDetails, 5000);

    return () => clearInterval(intervalId);
  }, [params.dbOrderId, selectedOutlet]);

  useEffect(() => {
    AsyncStorage.removeItem('activeDiscount').catch(e => console.log('Error clearing discount', e));

    const onBackPress = () => {
      router.dismissAll();
      router.replace('/home');
      return true;
    };
    const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);

    try {
      if (params.cart && params.cart !== '[object Object]') {
        const cartItems = typeof params.cart === 'string' ? JSON.parse(params.cart) : params.cart;
        if (Array.isArray(cartItems) && cartItems.length > 0) {
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setItemsName(`${cartItems[0].name || cartItems[0].itemName || 'Item'} x${cartItems[0].quantity || 1}`);
        }
      }
    } catch (e) { }

    const saveOrderToHistory = async () => {
      try {
        const restId = selectedOutlet?.restaurant_id ? Number(selectedOutlet.restaurant_id) : null;
        if (!restId) return;
        const restName = selectedOutlet?.name || 'Data Udipi — Mugalivakkam';
        let storedOrders = null;
        try {
          if (Platform.OS === 'web') {
            storedOrders = typeof window !== 'undefined' ? localStorage.getItem('userOrders') : null;
          } else {
            storedOrders = await AsyncStorage.getItem('userOrders');
          }
        } catch (e) { }
        if (!storedOrders) {
          try {
            if (typeof localStorage !== 'undefined') {
              storedOrders = localStorage.getItem('userOrders');
            }
          } catch (e) {}
        }
        if (!storedOrders) {
          storedOrders = (globalThis as any).userOrders || null;
        }

        let ordersList: any[] = [];
        if (storedOrders) {
          try {
            ordersList = typeof storedOrders === 'string' ? JSON.parse(storedOrders) : storedOrders;
          } catch (e) {
            ordersList = [];
          }
        }
        if (!Array.isArray(ordersList)) {
          ordersList = [];
        }

        const exists = ordersList.some(o => o.orderId === params.orderId || (params.dbOrderId && o.dbOrderId === params.dbOrderId));
        if (exists) return;

        let itemNames = '';
        try {
          if (params.cart && params.cart !== '[object Object]') {
            const cartItems = typeof params.cart === 'string' ? JSON.parse(params.cart) : params.cart;
            if (Array.isArray(cartItems)) {
              itemNames = cartItems.map((item: any) => `${item.name || item.itemName || 'Item'} x ${item.quantity || item.qty || 1}`).join(', ');
            }
          }
        } catch (e) { }

        const newOrderRecord = {
          id: params.dbOrderId || Date.now().toString(),
          dbOrderId: params.dbOrderId || '',
          orderId: params.orderId || `ORD-${Date.now().toString().substring(6)}`,
          restaurant: restName,
          restaurant_id: restId,
          date: new Date().toLocaleString('en-US', { hour: 'numeric', minute: 'numeric', hour12: true, day: 'numeric', month: 'short' }),
          status: 'Confirmed',
          items: itemNames || `${params.itemCount || 1} items`,
          price: params.total || '0',
          image: 'https://via.placeholder.com/150',
          order_type: 'Delivery'
        };

        ordersList.unshift(newOrderRecord);
        const listStr = JSON.stringify(ordersList);
        
        let saved = false;
        try {
          await AsyncStorage.setItem('userOrders', listStr);
          saved = true;
        } catch (e) { }
        if (!saved) {
          try {
            if (typeof localStorage !== 'undefined') {
              localStorage.setItem('userOrders', listStr);
              saved = true;
            }
          } catch (e) {}
        }
        (globalThis as any).userOrders = listStr;
      } catch (err) {
        console.error("Error saving order to history", err);
      }
    };

    saveOrderToHistory();

    return () => {
      if (subscription?.remove) {
        subscription.remove();
      }
    };
  }, [params.cart]);

  const handleTrackOrder = () => {
    router.push({
      pathname: '/delivery-tracking',
      params: {
        orderId: params.orderId || '',
        dbOrderId: params.dbOrderId,
        cart: params.cart,
        orderType: params.orderType,
        phone: params.phone,
      }
    });
  };

  const handleBackToMenu = () => {
    router.dismissAll();
    router.replace('/home');
  };

  const displayTotal = params.total || '0.00';
  const displayPayment = params.paymentMethod || 'Cash';
  const orderIdText = params.orderId ? params.orderId.replace('ORD-', 'UDP-') : 'UDP-868518';

  // Calculate ETA dynamically from order creation or fallback
  const displayEta = useMemo(() => {
    const baseTime = parseDate(orderDetails?.order?.created_at);
    baseTime.setMinutes(baseTime.getMinutes() + 45);
    return formatTime(baseTime);
  }, [orderDetails]);

  const status = orderDetails?.order?.status?.toUpperCase() || 'PENDING';
  const isRiderPhase = ['DISPATCHED', 'ON_THE_WAY', 'DELIVERED', 'COMPLETED'].includes(status);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* Top Banner */}
        <View style={styles.topBanner}>
          <View style={styles.bannerIconBox}>
            <Ionicons name="restaurant-outline" size={20} color="#00a01d" />
          </View>
          <View>
            <Text style={styles.bannerTitle}>Restaurant Accepted</Text>
            <Text style={styles.bannerSubtitle}>Food preparation in progress</Text>
          </View>
        </View>

        {/* Success Icon */}
        <View style={styles.centerBox}>
          <View style={styles.successCircle}>
            <Ionicons name="checkmark" size={32} color="#00a01d" />
          </View>
          <Text style={styles.successTitle}>Order Placed Successfully!</Text>
          <Text style={styles.successSubtitle}>{orderIdText} • Paid via {displayPayment}</Text>
        </View>

        {/* ETA Card */}
        <View style={styles.card}>
          <View style={styles.cardTopRow}>
            <Text style={styles.cardTitle}>Estimated Delivery by {displayEta}</Text>
            <View style={styles.aiBadge}>
              <Text style={styles.aiBadgeText}>AI Pred</Text>
            </View>
          </View>

          <View style={styles.progressRow}>
             {/* Kitchen preparing */}
             <View style={[styles.progressLine, styles.activeLine, { flex: 1.5 }]} />
             <View style={[styles.progressLine, styles.activeLine, { flex: 1 }]} />
             <View style={[styles.progressDot, styles.activeDot]} />
             <View style={[styles.progressLine, isRiderPhase ? styles.activeLine : styles.inactiveLine, { flex: 1.5 }]} />
             <View style={[styles.progressLine, isRiderPhase ? styles.activeLine : styles.inactiveLine, { flex: 1 }]} />
          </View>

          <View style={styles.progressLabels}>
            <Text style={styles.progressLabelActive}>Order Received</Text>
            <Text style={isRiderPhase ? styles.progressLabelActive : styles.progressLabelInactive}>Rider heading over</Text>
          </View>

          <View style={styles.infoBox}>
            <Ionicons name="information-circle-outline" size={16} color="#00a01d" style={{ marginTop: 2, marginRight: 8 }} />
            <Text style={styles.infoText}>We have received your order and our chef will begin preparing your fresh meal soon.</Text>
          </View>
        </View>

        {/* Order Details Card */}
        <View style={styles.card}>
           <View style={styles.detailRow}>
             <Text style={styles.detailLabel}>Items</Text>
             <Text style={styles.detailValue}>{itemsName}</Text>
           </View>
           <View style={styles.detailRow}>
             <Text style={styles.detailLabel}>Table / Mode</Text>
             <Text style={styles.detailValue}>Delivery to Home</Text>
           </View>
           <View style={[styles.detailRow, { marginBottom: 0 }]}>
             <Text style={styles.detailLabel}>Amount Paid</Text>
             <Text style={styles.detailAmount}>Rs. {displayTotal}</Text>
           </View>
        </View>

        {/* Restaurant Pill */}
        <View style={styles.restaurantPill}>
          <Ionicons name="fast-food-outline" size={14} color="#ff3400" />
          <Text style={styles.restaurantPillText}>{selectedOutlet?.name || 'Data Udipi'} has accepted your order</Text>
        </View>

      </ScrollView>

      {/* Footer Buttons */}
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <TouchableOpacity style={styles.trackBtn} onPress={handleTrackOrder}>
          <Text style={styles.trackBtnText}>Track Your Order</Text>
        </TouchableOpacity>
        {['PENDING', 'CONFIRMED'].includes(status) && (
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={handleCancelOrder}
            disabled={cancelling}
            activeOpacity={0.8}
          >
            {cancelling ? (
              <ActivityIndicator size="small" color="#DC2626" />
            ) : (
              <Text style={styles.cancelBtnText}>Cancel Order</Text>
            )}
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.backMenuBtn} onPress={handleBackToMenu}>
          <Text style={styles.backMenuText}>Back to Main Menu</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scrollContent: {
    padding: 16,
    paddingTop: 24,
    paddingBottom: 40,
  },
  topBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 12,
    padding: 16,
    marginBottom: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 2,
  },
  bannerIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#e6f7eb',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  bannerTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 2,
  },
  bannerSubtitle: {
    fontSize: 12,
    color: '#888',
  },
  centerBox: {
    alignItems: 'center',
    marginBottom: 32,
  },
  successCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#e6f7eb',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  successTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  successSubtitle: {
    fontSize: 12,
    color: '#888',
  },
  card: {
    backgroundColor: '#f9f9f9',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
  },
  aiBadge: {
    backgroundColor: '#e6f7eb',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  aiBadgeText: {
    color: '#00a01d',
    fontSize: 10,
    fontWeight: 'bold',
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  progressLine: {
    height: 3,
    marginHorizontal: 2,
    borderRadius: 2,
  },
  activeLine: {
    backgroundColor: '#ff3400',
  },
  inactiveLine: {
    backgroundColor: '#e0e0e0',
  },
  progressDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginHorizontal: 2,
  },
  activeDot: {
    backgroundColor: '#ff3400',
  },
  inactiveDot: {
    backgroundColor: '#e0e0e0',
  },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  progressLabelActive: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#ff3400',
  },
  progressLabelInactive: {
    fontSize: 11,
    color: '#aaa',
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  infoText: {
    fontSize: 11,
    color: '#666',
    flex: 1,
    lineHeight: 16,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  detailLabel: {
    fontSize: 12,
    color: '#888',
  },
  detailValue: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
  },
  detailAmount: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#ff3400',
  },
  restaurantPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f9f9f9',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
    alignSelf: 'center',
    marginTop: 8,
  },
  restaurantPillText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#333',
    marginLeft: 8,
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 16,
    backgroundColor: '#fff',
  },
  trackBtn: {
    backgroundColor: '#00a01d',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  trackBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  cancelBtn: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  cancelBtnText: {
    color: '#DC2626',
    fontSize: 15,
    fontWeight: '700',
  },
  backMenuBtn: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  backMenuText: {
    color: '#666',
    fontSize: 14,
    fontWeight: 'bold',
  }
});
