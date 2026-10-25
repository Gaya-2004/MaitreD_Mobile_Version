import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Platform, StatusBar, ScrollView, BackHandler, Linking, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { orderApi } from '../../services/apiService';
import { getFullImageUrl } from '../../constants/api';
import { useRestaurantStore, useLiveOrderStore } from '../../store';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from '../(order)/_MapComponents';
import MapViewDirections from 'react-native-maps-directions';
import * as Location from 'expo-location';
import { formatTime } from '../../utils/dateUtils';
import { LIGHT_MAP_STYLE } from '../../constants/mapStyle';
import { resolveOutletLocation } from '../../utils/deliveryArea';

const GOOGLE_MAPS_APIKEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';

export default function OrderSuccessScreen() {
  const { selectedOutlet } = useRestaurantStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    orderId: string;
    total: string;
    paymentMethod: string;
    phone: string;
    tableNumber: string;
    dbOrderId?: string;
    cart?: string;
    itemCount?: string;
    orderType?: string;
    subtotal?: string;
    discountAmount?: string;
    discountCode?: string;
  }>();

  const [orderDetails, setOrderDetails] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [userLocation, setUserLocation] = useState<{latitude: number, longitude: number} | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const handleCancelTakeawayOrder = () => {
    const rawId = params.dbOrderId || (params.orderId ? params.orderId.replace(/\D/g, '') : '');
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
              const restId = selectedOutlet?.restaurant_id ? Number(selectedOutlet.restaurant_id) : undefined;
              await orderApi.cancelOrder(rawId, restId);
              useLiveOrderStore.getState().clearLiveOrder();
              Alert.alert("Order Cancelled", "Your order has been cancelled successfully.", [
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

  const dbOrderId = params.dbOrderId;

  useEffect(() => {
    (async () => {
      try {
        let { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          let location = await Location.getCurrentPositionAsync({});
          setUserLocation({
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
          });
        }
      } catch (error) {
        console.log("Error fetching location", error);
      }
    })();

    AsyncStorage.removeItem('activeDiscount').catch(e => console.log('Error clearing discount', e));

    const onBackPress = () => {
      router.dismissAll();
      router.replace('/home');
      return true;
    };
    const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);

    const saveOrderToHistory = async () => {
      try {
        const restId = selectedOutlet?.restaurant_id ? Number(selectedOutlet.restaurant_id) : 1;
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

        const exists = ordersList.some(o => o.orderId === params.orderId || (dbOrderId && o.dbOrderId === dbOrderId));
        if (exists) return;

        let itemNames = '';
        try {
          if (params.cart && params.cart !== '[object Object]') {
            const cartItems = typeof params.cart === 'string' ? JSON.parse(params.cart) : params.cart;
            if (Array.isArray(cartItems)) {
              itemNames = cartItems.map(item => `${item.name || item.itemName || 'Item'} x ${item.quantity || item.qty || 1}`).join(', ');
            }
          }
        } catch (e) { }

        const newOrderRecord = {
          id: dbOrderId || Date.now().toString(),
          dbOrderId: dbOrderId || '',
          orderId: params.orderId || `ORD-${Date.now().toString().substring(6)}`,
          restaurant: restName,
          restaurant_id: restId,
          date: new Date().toLocaleString('en-US', { hour: 'numeric', minute: 'numeric', hour12: true, day: 'numeric', month: 'short' }),
          status: params.paymentMethod === 'Cash' ? 'Pending' : 'Confirmed',
          items: itemNames || `${params.itemCount || 1} items`,
          price: params.total || '0',
          image: 'https://via.placeholder.com/150'
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

    if (!dbOrderId) {
      setTimeout(() => setLoading(false), 0);
      return;
    }

    let intervalId: ReturnType<typeof setInterval>;

    const fetchOrderDetails = async () => {
      try {
        const restId = selectedOutlet?.restaurant_id ? Number(selectedOutlet.restaurant_id) : 1;
        const data = await orderApi.getOrderDetails(dbOrderId, restId);
        if (data && data.order) {
          setOrderDetails(data);
          const status = data.order.status.toUpperCase();
          if (status === 'SERVED' || status === 'COMPLETED') {
            router.replace({
              pathname: '/order-completed',
              params: {
                orderId: params.orderId || `ORD-${data.order.id.toString().padStart(6, '0')}`,
                dbOrderId: dbOrderId.toString(),
                tableNumber: data.order.table_number || params.tableNumber || 'Take Away',
                totalAmount: data.order.total_amount?.toString() || '0.00',
                paymentMethod: data.order.payment_method || 'UPI',
                cartItems: JSON.stringify(data.items || []),
                date: data.order.updated_at || data.order.created_at || new Date().toISOString(),
                phone: params.phone || '',
              }
            });
          }
        }
      } catch (err: any) {
        console.warn("Failed to fetch order details", err?.message || err);
        if (err?.message?.includes("404") || err?.message?.includes("not found")) {
          if (intervalId) clearInterval(intervalId);
          useLiveOrderStore.getState().clearLiveOrder();
          Alert.alert("Order Not Found", "Your order could not be found on the server.", [
            { text: "OK", onPress: () => router.replace('/(main)/home') }
          ]);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchOrderDetails();
    intervalId = setInterval(fetchOrderDetails, 5000);

    return () => {
      if (subscription?.remove) {
        subscription.remove();
      }
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [dbOrderId]);

  const handleTrackOrder = () => {
    router.push({
      pathname: '/track-order',
      params: {
        orderId: params.orderId || '',
        dbOrderId: params.dbOrderId,
        tableNumber: params.tableNumber ?? 'T-06',
        cart: params.cart,
        orderType: params.orderType,
        phone: params.phone,
      }
    });
  };

  const orderItemsList = (() => {
    if (orderDetails?.items && orderDetails.items.length > 0) {
      return orderDetails.items.map((i: any) => ({
        name: i.name || i.item_name || 'Item',
        description: i.description,
        price: i.price,
        quantity: i.quantity,
        image_url: getFullImageUrl(i.image_url, i.name || i.item_name || 'Item')
      }));
    }
    if (params.cart) {
      try {
        const parsed = typeof params.cart === 'string' ? JSON.parse(params.cart) : params.cart;
        return (Array.isArray(parsed) ? parsed : []).map((i: any) => ({
          name: i.name || i.title || 'Item',
          description: i.description || 'Freshly made',
          price: i.price,
          quantity: i.quantity,
          image_url: i.image_url 
            ? getFullImageUrl(i.image_url, i.name || i.title || 'Item')
            : getFullImageUrl(i.image, i.name || i.title || 'Item')
        }));
      } catch (e) {}
    }
    return [];
  })();

  const itemNamesString = orderItemsList.slice(0, 2).map((i: any) => i.name).join(' & ') + (orderItemsList.length > 2 ? ' ...' : '');
  const isDineIn = params.orderType === 'Dine In' || params.orderType === 'Dine-In';

  const titleText = isDineIn ? 'Dine-In Order Placed!' : 'Takeaway Order Placed!';
  const basketText = isDineIn ? 'Your Dine-In Basket' : 'Your Takeaway Basket';
  const readyTimeText = isDineIn ? 'Served by' : 'Ready by';
  const displayTotal = params.total || '0.00';

  // Format 15 minutes ahead for ETA
  const etaDate = new Date();
  etaDate.setMinutes(etaDate.getMinutes() + 15);
  const etaTime = formatTime(etaDate);

  const status = orderDetails?.order?.status?.toUpperCase() || 'CONFIRMED';
  let progressStep = 1;
  let etaSubText = "Preparation started (~15 min) • Queue moving fast";
  if (status === 'PREPARING') progressStep = 2;
  else if (status === 'ALMOST_READY') { progressStep = 3; etaSubText = "Ready to pickup (~3 min) • Packing in progress"; }
  else if (status === 'READY') { progressStep = 4; etaSubText = "Ready for pickup at counter"; }
  
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#ff4500" />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
        
        {/* Header Block */}
        <View style={[styles.headerBlock, { paddingTop: insets.top + 20 }]}>
          <View style={styles.checkCircle}>
            <Ionicons name="checkmark" size={40} color="#ff4500" />
          </View>
          <Text style={styles.title}>{titleText}</Text>
          <Text style={styles.orderId}>Order ID: #{params.orderId}</Text>
          <Text style={styles.paymentMethod}>{params.paymentMethod} • {itemNamesString}</Text>
        </View>

        <View style={styles.content}>
          {/* ETA Card */}
          <View style={styles.etaCard}>
            <View style={styles.etaTopRow}>
              <Text style={styles.etaHeaderLabel}>AI-POWERED PREPARATION ETA</Text>
              <View style={styles.aheadBadge}>
                <Text style={styles.aheadBadgeText}>3 AHEAD</Text>
              </View>
            </View>
            <Text style={styles.etaTime}>{readyTimeText} {etaTime}</Text>
            
            <View style={styles.progressRow}>
              <View style={[styles.progressDot, progressStep >= 1 && styles.activeDot]} />
              <View style={[styles.progressLine, progressStep >= 2 && styles.activeLine]} />
              <View style={[styles.progressDot, progressStep >= 2 && styles.activeDot]} />
              <View style={[styles.progressLine, progressStep >= 3 && styles.activeLine]} />
              <View style={[styles.progressDot, progressStep >= 3 && styles.activeDot]} />
            </View>
            <Text style={styles.etaSubtext}>{etaSubText}</Text>
          </View>

          {/* Notification Block */}
          <View style={styles.notifyBlock}>
            <Ionicons name="notifications-outline" size={20} color="#00a01d" />
            <Text style={styles.notifyText}>We will notify when to leave! Relax.</Text>
          </View>

          {/* Basket List */}
          <Text style={styles.basketTitle}>{basketText}</Text>
          <View style={styles.basketContainer}>
            {orderItemsList.map((item: any, idx: number) => (
              <View key={idx} style={[styles.itemCard, idx === orderItemsList.length - 1 && styles.lastItemCard]}>
                <Image source={{ uri: item.image_url || 'https://via.placeholder.com/60' }} style={styles.itemImage} />
                <View style={styles.itemDetails}>
                  <View style={styles.itemTitleRow}>
                    <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.itemQty}>x{item.quantity}</Text>
                  </View>
                  <Text style={styles.itemDesc} numberOfLines={1}>{item.description}</Text>
                  <Text style={styles.itemPrice}>Rs. {item.price}</Text>
                </View>
              </View>
            ))}
          </View>

          {/* Total Amount */}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total Amount</Text>
            <Text style={styles.totalValue}>Rs. {displayTotal}</Text>
          </View>

          {/* Map Location */}
          {!isDineIn && (() => {
            const restaurantLoc = resolveOutletLocation(selectedOutlet);
            const userLoc = userLocation || {
              latitude: restaurantLoc.latitude + 0.005,
              longitude: restaurantLoc.longitude - 0.005,
            };

            return (
              <View style={[styles.mapContainer, { height: 200, overflow: 'hidden' }]}>
                <MapView
                  provider={PROVIDER_GOOGLE}
                  style={{ flex: 1 }}
                  userInterfaceStyle="light"
                  customMapStyle={LIGHT_MAP_STYLE}
                  initialRegion={{
                    latitude: restaurantLoc.latitude,
                    longitude: restaurantLoc.longitude,
                    latitudeDelta: 0.05,
                    longitudeDelta: 0.05,
                  }}
                >
                  <Marker 
                    coordinate={{ latitude: restaurantLoc.latitude, longitude: restaurantLoc.longitude }} 
                    title={restaurantLoc.name || "Data Udipi"}
                    description="Restaurant Location"
                  >
                    <Ionicons name="restaurant" size={30} color="#ff4500" />
                  </Marker>
                  <Marker 
                    coordinate={userLoc} 
                    title="You"
                    description="Your Location"
                  >
                    <Ionicons name="person-circle" size={30} color="#00a01d" />
                  </Marker>
                  {GOOGLE_MAPS_APIKEY ? (
                    <MapViewDirections
                      origin={userLoc}
                      destination={{ latitude: restaurantLoc.latitude, longitude: restaurantLoc.longitude }}
                      apikey={GOOGLE_MAPS_APIKEY}
                      strokeWidth={4}
                      strokeColor="#00a01d"
                    />
                  ) : (
                    <Polyline 
                      coordinates={[
                        userLoc,
                        { latitude: restaurantLoc.latitude, longitude: restaurantLoc.longitude }
                      ]}
                      strokeColor="#ff4500"
                      strokeWidth={3}
                      lineDashPattern={[5, 5]}
                    />
                  )}
                </MapView>
                <TouchableOpacity 
                  style={styles.mapOverlayPill}
                  onPress={() => {
                    Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${restaurantLoc.latitude},${restaurantLoc.longitude}`);
                  }}
                >
                  <Ionicons name="location" size={14} color="#ff4500" />
                  <Text style={styles.mapPillText} numberOfLines={1}>Directions to {restaurantLoc.name || 'Restaurant'}</Text>
                </TouchableOpacity>
              </View>
            );
          })()}

        </View>
      </ScrollView>

      {/* Bottom Button */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom || 20 }]}>
        <TouchableOpacity style={styles.trackButton} onPress={handleTrackOrder}>
          <Text style={styles.trackButtonText}>Track Preparation</Text>
          <Ionicons name="arrow-forward" size={20} color="#fff" />
        </TouchableOpacity>
        {['PENDING', 'CONFIRMED'].includes((orderDetails?.order?.status || '').toUpperCase()) && (
          <TouchableOpacity
            style={styles.cancelTakeawayBtn}
            onPress={handleCancelTakeawayOrder}
            disabled={cancelling}
            activeOpacity={0.8}
          >
            {cancelling ? (
              <ActivityIndicator size="small" color="#DC2626" />
            ) : (
              <Text style={styles.cancelTakeawayBtnText}>Cancel Order</Text>
            )}
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fafafa',
  },
  headerBlock: {
    backgroundColor: '#ff4500',
    alignItems: 'center',
    paddingBottom: 24,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  checkCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  orderId: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  paymentMethod: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '500',
  },
  content: {
    padding: 16,
  },
  etaCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#eee',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 5,
    elevation: 2,
  },
  etaTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  etaHeaderLabel: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#333',
  },
  aheadBadge: {
    backgroundColor: '#ff4500',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  aheadBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  etaTime: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 16,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  progressDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ddd',
  },
  activeDot: {
    backgroundColor: '#ff4500',
  },
  progressLine: {
    flex: 1,
    height: 2,
    backgroundColor: '#ddd',
    marginHorizontal: 4,
  },
  activeLine: {
    backgroundColor: '#ff4500',
  },
  etaSubtext: {
    fontSize: 12,
    color: '#888',
    fontWeight: '500',
  },
  notifyBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eaf5eb',
    padding: 14,
    borderRadius: 12,
    marginBottom: 24,
  },
  notifyText: {
    color: '#00a01d',
    fontSize: 14,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  basketTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 12,
  },
  basketContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#eee',
    marginBottom: 16,
  },
  itemCard: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
    paddingBottom: 16,
    marginBottom: 16,
  },
  lastItemCard: {
    borderBottomWidth: 0,
    paddingBottom: 0,
    marginBottom: 0,
  },
  itemImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: '#eee',
  },
  itemDetails: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  itemTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  itemName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#000',
    flex: 1,
  },
  itemQty: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#888',
    marginLeft: 8,
  },
  itemDesc: {
    fontSize: 12,
    color: '#888',
    marginBottom: 8,
  },
  itemPrice: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#000',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 8,
    marginBottom: 24,
  },
  totalLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#666',
  },
  totalValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000',
  },
  mapContainer: {
    width: '100%',
    height: 120,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
    marginBottom: 24,
    backgroundColor: '#eee',
  },
  mapImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  mapOverlayPill: {
    position: 'absolute',
    bottom: 10,
    alignSelf: 'center',
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
    maxWidth: '90%',
  },
  mapPillText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#000',
    marginLeft: 4,
    flexShrink: 1,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
    backgroundColor: '#fafafa',
    padding: 16,
    paddingTop: 8,
  },
  trackButton: {
    backgroundColor: '#00a01d',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
  },
  trackButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginRight: 8,
  },
  cancelTakeawayBtn: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    marginTop: 10,
  },
  cancelTakeawayBtnText: {
    color: '#DC2626',
    fontSize: 15,
    fontWeight: '700',
  },
});
