import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Platform, StatusBar, Dimensions, Linking, Alert, Animated, Modal, ActivityIndicator } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { deliveryApi, orderApi } from '../../services/apiService';
import { useRestaurantStore, useLiveOrderStore } from '../../store';
import {
  DELIVERY_STATUS,
  getDeliveryContextText,
  getDeliveryProgressStep,
  isLiveTrackingStatus,
  isDeliveredStatus,
  isTerminalStatus,
  resolveDeliveryStatus,
} from '../../utils/deliveryStatusUtils';
import { formatTime } from '../../utils/dateUtils';
import { LIGHT_MAP_STYLE } from '../../constants/mapStyle';
import { resolveOutletLocation } from '../../utils/deliveryArea';

const MapView = Platform.OS !== 'web' ? require('react-native-maps').default : null;
const Marker = Platform.OS !== 'web' ? require('react-native-maps').Marker : null;
const Polyline = Platform.OS !== 'web' ? require('react-native-maps').Polyline : null;
const MapViewDirections = Platform.OS !== 'web' ? require('react-native-maps-directions').default : null;

const { width } = Dimensions.get('window');

type DeliveryStatus = typeof DELIVERY_STATUS[keyof typeof DELIVERY_STATUS] | null;

export default function DeliveryTrackingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    orderId: string;
    dbOrderId: string;
    cart: string;
    totalAmount?: string;
    paymentMethod?: string;
  }>();

  const { selectedOutlet } = useRestaurantStore();
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const [currentStatus, setCurrentStatus] = useState('PENDING');
  const [deliveryStatus, setDeliveryStatus] = useState<DeliveryStatus>(null);
  const [riderNotified, setRiderNotified] = useState(false);
  const [riderAssignedBanner, setRiderAssignedBanner] = useState<string | null>(null);
  const [pulseAnim] = useState(() => new Animated.Value(1));

  // Cancellation State
  const [cancelling, setCancelling] = useState(false);
  const [cancelModalVisible, setCancelModalVisible] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const handleOpenCancelModal = () => {
    setCancelError(null);
    setCancelModalVisible(true);
  };

  const handleExecuteCancel = async () => {
    const rawId = params.dbOrderId || (params.orderId ? params.orderId.replace(/\D/g, '') : '');
    if (!rawId) return;

    try {
      setCancelling(true);
      setCancelError(null);
      const restId = selectedOutlet?.restaurant_id ? Number(selectedOutlet.restaurant_id) : undefined;
      await orderApi.cancelOrder(rawId, restId);

      setCurrentStatus('CANCELLED');
      setDeliveryStatus(DELIVERY_STATUS.CANCELLED);
      useLiveOrderStore.getState().clearLiveOrder();
      setCancelModalVisible(false);
      Alert.alert('Order Cancelled', 'Your delivery order has been cancelled successfully.', [
        { text: 'Return Home', onPress: () => router.replace('/(main)/home') }
      ]);
    } catch (err: any) {
      console.warn('Delivery cancel error:', err?.message || err);
      const msg = err?.message || '';
      if (msg.includes('409') || msg.toLowerCase().includes('preparing') || msg.toLowerCase().includes('already started')) {
        setCancelError('Cancellation unavailable. The kitchen has already started preparing this order.');
      } else {
        setCancelError(msg || 'Unable to cancel order at this stage.');
      }
    } finally {
      setCancelling(false);
    }
  };

  const [riderInfo, setRiderInfo] = useState<{
    id?: number;
    name?: string;
    phone?: string;
    rating?: number;
    vehicle_type?: string;
    vehicle_number?: string;
    profile_image?: string;
  } | null>(null);

  const [riderLocation, setRiderLocation] = useState<{
    latitude: number;
    longitude: number;
    speed?: number;
    heading?: number;
  } | null>(null);

  const [customerLocation, setCustomerLocation] = useState<{
    full_address?: string;
    latitude?: number;
    longitude?: number;
  } | null>(null);

  const [restaurantLocation, setRestaurantLocation] = useState<{
    name?: string;
    latitude?: number;
    longitude?: number;
  } | null>(null);

  const [timeline, setTimeline] = useState<any[]>([]);
  const hasNavigatedRef = useRef(false);
  const isPollingRef = useRef(false);
  const lastDeliveryStatusRef = useRef<string>('');
  const [networkError, setNetworkError] = useState(false);

  // Pulse animation for searching state
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.15, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  useEffect(() => {
    const dbId = params.dbOrderId;
    if (!dbId) return;

    let interval: ReturnType<typeof setInterval>;

    const fetchTracking = async () => {
      if (isPollingRef.current) return;
      isPollingRef.current = true;

      try {
        const restId = selectedOutlet?.restaurant_id ? Number(selectedOutlet.restaurant_id) : null;
        if (!restId) {
          throw new Error('Restaurant context is unavailable for this order');
        }

        const results = await Promise.allSettled([
          deliveryApi.getOrderTracking(dbId),
          orderApi.getOrderDetails(dbId, restId)
        ]);
        const trackingData = results[0].status === 'fulfilled' ? results[0].value : null;
        const orderData = results[1].status === 'fulfilled' ? results[1].value : null;
        setNetworkError(results[0].status === 'rejected' && results[1].status === 'rejected');

        if (trackingData) {
          if (trackingData.rider) {
            setRiderInfo(trackingData.rider);
          }
          if (trackingData.rider_location?.latitude) {
            setRiderLocation({
              latitude: Number(trackingData.rider_location.latitude),
              longitude: Number(trackingData.rider_location.longitude),
              speed: trackingData.rider_location.speed,
              heading: trackingData.rider_location.heading,
            });
          }
          if (trackingData.delivery_address) {
            setCustomerLocation({
              full_address: trackingData.delivery_address.full_address,
              latitude: trackingData.delivery_address.latitude ? Number(trackingData.delivery_address.latitude) : undefined,
              longitude: trackingData.delivery_address.longitude ? Number(trackingData.delivery_address.longitude) : undefined,
            });
          }
          if (trackingData.restaurant) {
            const rawLat = trackingData.restaurant.latitude != null ? Number(trackingData.restaurant.latitude) : null;
            const rawLng = trackingData.restaurant.longitude != null ? Number(trackingData.restaurant.longitude) : null;
            const outletResolved = resolveOutletLocation({
              restaurant_id: trackingData.restaurant.id || selectedOutlet?.restaurant_id,
              name: trackingData.restaurant.name || selectedOutlet?.name,
              lat: rawLat,
              lng: rawLng,
            });

            setRestaurantLocation({
              name: trackingData.restaurant.name || outletResolved.name,
              latitude: (rawLat && !isNaN(rawLat)) ? rawLat : outletResolved.latitude,
              longitude: (rawLng && !isNaN(rawLng)) ? rawLng : outletResolved.longitude,
            });
          } else {
            const outletResolved = resolveOutletLocation(selectedOutlet);
            setRestaurantLocation({
              name: outletResolved.name,
              latitude: outletResolved.latitude,
              longitude: outletResolved.longitude,
            });
          }
          if (Array.isArray(trackingData.timeline)) {
            setTimeline(trackingData.timeline);
          }
        }

        if (orderData?.order) {
          const s = orderData.order.status ? orderData.order.status.toUpperCase() : 'PENDING';
          setCurrentStatus(s);
        }

        // Determine delivery status from either response
        const rawDS = orderData?.order?.delivery_status;
        if (rawDS) {
          const resolvedDS = resolveDeliveryStatus(lastDeliveryStatusRef.current, rawDS);
          lastDeliveryStatusRef.current = resolvedDS;
          setDeliveryStatus(resolvedDS as DeliveryStatus);

          if (isDeliveredStatus(resolvedDS) && !hasNavigatedRef.current) {
            hasNavigatedRef.current = true;
            clearInterval(interval);
            router.replace({
              pathname: '/delivery-completed',
              params: {
                orderId: params.orderId,
                dbOrderId: params.dbOrderId,
              }
            });
            return;
          }

          if (isTerminalStatus(resolvedDS)) {
            clearInterval(interval);
            return;
          }
        }
      } catch (err: any) {
        console.warn('Tracking poll status:', err?.message || err);
        if (err?.message?.includes("404") || err?.message?.includes("not found")) {
          if (interval) clearInterval(interval);
          useLiveOrderStore.getState().clearLiveOrder();
          Alert.alert("Order Not Found", "Your order could not be found on the server.", [
            { text: "OK", onPress: () => router.replace('/(main)/home') }
          ]);
        } else {
          setNetworkError(true);
        }
      } finally {
        isPollingRef.current = false;
      }
    };

    fetchTracking();
    interval = setInterval(fetchTracking, 4000);
    return () => clearInterval(interval);
  }, [params.dbOrderId, selectedOutlet]);

  const orderIdText = params.orderId || 'ORD-123456';

  const items = (() => {
    try {
      if (params.cart && params.cart !== '[object Object]') {
        const parsed = JSON.parse(params.cart);
        return Array.isArray(parsed) ? parsed : [];
      }
    } catch (e) { }
    return [];
  })();

  const subtotal = items.reduce((acc: number, item: any) => acc + (Number(item.price) * (item.quantity || 1)), 0);

  // Determine current step index for order progress
  // 0: Order Confirmed, 1: Preparing, 2: Ready to Pickup, 3: Out for Delivery, 4: Delivered
  const activeStep = getDeliveryProgressStep(currentStatus, deliveryStatus);

  const progressSteps = [
    { label: 'Order\nConfirmed', icon: 'checkmark-circle' },
    { label: 'Preparing', icon: 'restaurant' },
    { label: 'Ready to\nPickup', icon: 'fast-food' },
    { label: 'Out for\nDelivery', icon: 'bicycle' },
    { label: 'Delivered', icon: 'home' },
  ];

  const isCancelled = (currentStatus || '').toUpperCase() === 'CANCELLED' || deliveryStatus === DELIVERY_STATUS.CANCELLED;
  const canCancel = !isCancelled && activeStep === 0 && ['PENDING', 'CONFIRMED'].includes((currentStatus || '').toUpperCase());

  const isSearchingRider = !riderInfo && (!deliveryStatus || deliveryStatus === DELIVERY_STATUS.RIDER_SEARCHING);
  const isOutForDelivery = isLiveTrackingStatus(deliveryStatus);
  const isBeforePickup = Boolean(deliveryStatus && !isOutForDelivery && !isTerminalStatus(deliveryStatus));

  const statusMsg = {
    title: isSearchingRider
      ? 'Finding your delivery partner...'
      : getDeliveryContextText(deliveryStatus),
    sub: isSearchingRider ? 'Your order is confirmed and being prepared' : 'Live tracking'
  };


  const activeRestaurant = restaurantLocation?.latitude && restaurantLocation?.longitude
    ? restaurantLocation
    : resolveOutletLocation(selectedOutlet);

  const mapCenterLat = riderLocation?.latitude ?? customerLocation?.latitude ?? activeRestaurant.latitude;
  const mapCenterLng = riderLocation?.longitude ?? customerLocation?.longitude ?? activeRestaurant.longitude;
  const hasCompleteMapData = Boolean(customerLocation?.latitude != null && customerLocation?.longitude != null && activeRestaurant.latitude != null && activeRestaurant.longitude != null);

  const handleCallRider = () => {
    if (riderInfo?.phone) {
      Linking.openURL(`tel:${riderInfo.phone}`);
    } else {
      Alert.alert('Delivery Partner', 'Your delivery partner will be assigned shortly.');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color="#000" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{isBeforePickup ? 'Order Tracking' : 'Live Tracking'}</Text>
        </View>
        <View style={styles.liveBadge}>
          <Animated.View style={[styles.liveDot, { transform: [{ scale: pulseAnim }] }]} />
          <Text style={styles.liveText}>{isBeforePickup ? 'STATUS' : 'LIVE'}</Text>
        </View>
      </View>

      {riderAssignedBanner && (
        <View style={{ backgroundColor: '#e8f5e9', padding: 12, marginHorizontal: 16, marginTop: 12, borderRadius: 8, flexDirection: 'row', alignItems: 'center' }}>
          <Ionicons name="bicycle" size={24} color="#00a01d" style={{ marginRight: 8 }} />
          <Text style={{ flex: 1, color: '#00a01d', fontWeight: 'bold' }}>{riderAssignedBanner}</Text>
        </View>
      )}

      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>

        {/* Map Section */}
        <View style={styles.mapContainer}>
          {Platform.OS !== 'web' && MapView && !isTerminalStatus(deliveryStatus) && hasCompleteMapData ? (
            <MapView
              style={StyleSheet.absoluteFill}
              userInterfaceStyle="light"
              customMapStyle={LIGHT_MAP_STYLE}
              region={{
                latitude: mapCenterLat,
                longitude: mapCenterLng,
                latitudeDelta: 0.03,
                longitudeDelta: 0.03,
              }}
            >
              {/* Restaurant Marker */}
              {activeRestaurant.latitude != null && activeRestaurant.longitude != null && (
                <Marker
                  coordinate={{ latitude: activeRestaurant.latitude, longitude: activeRestaurant.longitude }}
                  title={activeRestaurant.name || 'Restaurant'}
                >
                  <View style={styles.restaurantMarker}>
                    <Ionicons name="restaurant" size={14} color="#ff3400" />
                  </View>
                </Marker>
              )}

              {/* Rider Marker */}
              {riderLocation && (
                <Marker
                  coordinate={{ latitude: riderLocation.latitude, longitude: riderLocation.longitude }}
                  title={riderInfo?.name || 'Delivery Partner'}
                >
                  <View style={[styles.restaurantMarker, { backgroundColor: '#333' }]}>
                    <MaterialIcons 
                      name={riderInfo?.vehicle_type?.toLowerCase() === 'car' ? 'directions-car' : 'motorcycle'} 
                      size={18} 
                      color="#fff" 
                    />
                  </View>
                </Marker>
              )}

              {/* Customer Destination */}
              {customerLocation?.latitude && customerLocation?.longitude && (
                <Marker
                  coordinate={{ latitude: customerLocation.latitude, longitude: customerLocation.longitude }}
                  title="Your Location"
                >
                  <View style={styles.homeMarker}>
                    <Ionicons name="home" size={16} color="#00a01d" />
                  </View>
                </Marker>
              )}

              {/* Route polyline when we have both rider and customer */}
              {MapViewDirections && riderLocation && customerLocation?.latitude && process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ? (
                <MapViewDirections
                  origin={{ latitude: riderLocation.latitude, longitude: riderLocation.longitude }}
                  destination={{ latitude: customerLocation.latitude!, longitude: customerLocation.longitude! }}
                  apikey={process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY}
                  strokeWidth={4}
                  strokeColor="#ff3400"
                />
              ) : Polyline && riderLocation && customerLocation?.latitude && (
                <Polyline
                  coordinates={[
                    { latitude: riderLocation.latitude, longitude: riderLocation.longitude },
                    { latitude: customerLocation.latitude!, longitude: customerLocation.longitude! },
                  ]}
                  strokeColor="#ff3400"
                  strokeWidth={3}
                  lineDashPattern={[8, 4]}
                />
              )}
            </MapView>
          ) : (
            <View style={[styles.mapImage, { backgroundColor: '#f5f5f5', justifyContent: 'center', alignItems: 'center' }]}>
              {!isTerminalStatus(deliveryStatus) && hasCompleteMapData ? (
                riderLocation || hasCompleteMapData ? (
                  <Image
                    source={{ uri: `https://maps.googleapis.com/maps/api/staticmap?center=${mapCenterLat},${mapCenterLng}&zoom=14&size=600x400&markers=color:red%7Clabel:R%7C${activeRestaurant.latitude},${activeRestaurant.longitude}&markers=color:green%7Clabel:H%7C${customerLocation?.latitude},${customerLocation?.longitude}${riderLocation ? `&markers=color:blue%7Clabel:D%7C${riderLocation.latitude},${riderLocation.longitude}` : ''}&path=color:0xff3400ff%7Cweight:3%7C${activeRestaurant.latitude},${activeRestaurant.longitude}%7C${customerLocation?.latitude},${customerLocation?.longitude}&key=${process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || ''}` }}
                    style={styles.mapImage}
                    resizeMode="cover"
                  />
                ) : (
                  <Text style={{ color: '#666', textAlign: 'center', padding: 20 }}>Waiting for rider location...</Text>
                )
              ) : (
                <View style={{ alignItems: 'center', padding: 20 }}>
                  <Ionicons name="restaurant" size={48} color="#ccc" />
                  <Text style={{ marginTop: 12, color: '#888', textAlign: 'center' }}>Map will be available once the rider picks up your order.</Text>
                </View>
              )}
            </View>
          )}

          {/* Rider Card floating over map */}
          <View style={styles.riderCard}>
            <View style={styles.riderRow}>
              <View style={styles.riderAvatarBox}>
                {isSearchingRider ? (
                  <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                    <Ionicons name="search" size={22} color="#ff3400" />
                  </Animated.View>
                ) : (
                  <Ionicons name="person" size={24} color="#555" />
                )}
              </View>
              <View style={styles.riderInfo}>
                {isSearchingRider ? (
                  <>
                    <Text style={styles.riderName}>Finding your rider...</Text>
                    <Text style={styles.riderRole}>Assigning the best delivery partner</Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.riderName}>{riderInfo?.name || 'Delivery Partner'}</Text>
                    <Text style={styles.riderRole}>{riderInfo?.vehicle_type ? `${riderInfo.vehicle_type} • ${riderInfo.vehicle_number || ''}` : 'Your delivery partner'}</Text>
                    {riderInfo?.rating && riderInfo.rating > 0 ? (
                      <View style={styles.ratingBadge}>
                        <Ionicons name="star" size={10} color="#fff" />
                        <Text style={styles.ratingText}>{riderInfo.rating.toFixed(1)}</Text>
                      </View>
                    ) : null}
                  </>
                )}
      </View>
      {!isSearchingRider && (
        <View style={styles.riderActions}>
          <TouchableOpacity style={styles.actionBtn} onPress={handleCallRider}>
            <Ionicons name="call" size={18} color="#ff3400" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={() => Alert.alert('Chat', 'Live chat coming soon!')}>
            <Ionicons name="chatbubble-ellipses" size={18} color="#ff3400" />
          </TouchableOpacity>
        </View>
      )}
    </View>
          </View >
        </View >

    {/* Content below map */ }
    < View style = { styles.detailsContainer } >

      {/* Order ID + ETA row */}
      <View style={styles.orderInfoRow}>
        <View style={{ flex: 1, paddingRight: 8 }}>
          <Text style={styles.infoLabel}>Order ID</Text>
          <Text style={styles.orderIdVal} numberOfLines={1} adjustsFontSizeToFit>{orderIdText}</Text>
        </View>
        <View style={{ flex: 1, alignItems: 'flex-end', paddingLeft: 8 }}>
          <Text style={styles.infoLabel}>Delivery Status</Text>
          <Text style={styles.etaVal} numberOfLines={2} adjustsFontSizeToFit>
            {deliveryStatus === DELIVERY_STATUS.DELIVERED ? 'Delivered' : getDeliveryContextText(deliveryStatus)}
          </Text>
        </View>
      </View>

    <View style={styles.divider} />

  {/* Order Progress */ }
          <Text style={styles.sectionTitle}>Order Progress</Text>
          <View style={styles.progressTracker}>
            {progressSteps.map((step, idx) => {
              const isCompleted = activeStep > idx;
              const isActive = activeStep === idx;

              let circleStyle: any = styles.stepPending;
              if (isCompleted) circleStyle = styles.stepCompleted;
              else if (isActive) circleStyle = styles.stepActive;

              let textStyle = styles.stepTextPending;
              if (isCompleted) textStyle = styles.stepTextCompleted;
              else if (isActive) textStyle = styles.stepTextActive;

              const lineStyle = isCompleted ? styles.lineCompleted : isActive ? styles.lineActive : styles.linePending;

              // Try to find the step in the timeline for real timestamps
              let stepTimeStr = '...';
              if (timeline && timeline.length > 0) {
                let matchingStatus = '';
                if (idx === 0) matchingStatus = 'PENDING';
                else if (idx === 1) matchingStatus = 'PREPARING';
                else if (idx === 2) matchingStatus = 'READY';
                else if (idx === 3) matchingStatus = 'RIDER_ASSIGNED';
                else if (idx === 4) matchingStatus = 'PICKED_UP';

                // Find the *first* occurrence of this status to show when it began
                const event = timeline.find((t: any) => t.status === matchingStatus);
                if (event && event.timestamp) {
                  stepTimeStr = formatTime(event.timestamp);
                }
              }

              const timeColor = isCompleted ? '#00a01d' : isActive ? '#ff3400' : '#ccc';

              return (
                <React.Fragment key={idx}>
                  <View style={styles.stepItem}>
                    <View style={[styles.stepCircle, circleStyle]}>
                      {isCompleted && <Ionicons name="checkmark" size={12} color="#fff" />}
                      {isActive && <View style={styles.innerDot} />}
                    </View>
                    <Text style={[styles.stepText, textStyle]}>{step.label}</Text>
                    <Text style={[styles.stepTime, { color: timeColor }]}>{isCompleted ? stepTimeStr : isActive ? 'Now' : '...'}</Text>
                  </View>
                  {idx < progressSteps.length - 1 && (
                    <View style={[styles.stepLine, lineStyle]} />
                  )}
                </React.Fragment>
              );
            })}
          </View>

          <View style={styles.divider} />

  {/* Current Status Banner */ }
  <View style={styles.statusBanner}>
    <View style={[styles.statusIconCircle, { backgroundColor: isSearchingRider ? '#fff5f0' : '#e6f7ec' }]}>
      <Ionicons
        name={isSearchingRider ? 'search' : isOutForDelivery ? 'bicycle' : 'restaurant'}
        size={20}
        color={isSearchingRider ? '#ff3400' : '#00a01d'}
      />
    </View>
    <View style={{ flex: 1, marginLeft: 12 }}>
      <Text style={styles.statusBannerTitle}>{statusMsg.title}</Text>
      <Text style={styles.statusBannerSub}>{statusMsg.sub}</Text>
    </View>
  </View>

  { networkError && <Text style={{ color: '#777', fontSize: 12, marginTop: 8 }}>Retrying...</Text> }

  <View style={styles.divider} />

  {/* Order Details Accordion */ }
  <TouchableOpacity
    style={styles.accordionHeader}
    onPress={() => setDetailsExpanded(!detailsExpanded)}
    activeOpacity={0.7}
  >
    <Text style={styles.sectionTitle}>Order Details</Text>
    <Ionicons name={detailsExpanded ? 'chevron-up' : 'chevron-down'} size={20} color="#888" />
  </TouchableOpacity>

  {
    detailsExpanded && (
      <View style={styles.accordionContent}>
        {items.map((item: any, idx: number) => (
          <View key={idx} style={styles.itemRow}>
            <Text style={styles.itemName}>{item.name || item.itemName} x{item.quantity || 1}</Text>
            <Text style={styles.itemPrice}>Rs. {Number(item.price) * (item.quantity || 1)}</Text>
          </View>
        ))}
        <View style={styles.subtotalRow}>
          <Text style={styles.subtotalLabel}>Total</Text>
          <Text style={styles.subtotalValue}>Rs. {subtotal || params.totalAmount || '0'}</Text>
        </View>
      </View>
    )
  }

          {/* Cancellation Card for Delivery (Before Kitchen Prepares) */}
          {canCancel && (
            <View style={styles.cancelCard}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={styles.cancelCardTitle}>Need to cancel?</Text>
                <Text style={styles.cancelCardSub}>
                  Cancellation is available before the kitchen starts preparing your food.
                </Text>
              </View>
              <TouchableOpacity
                style={styles.cancelDeliveryBtn}
                onPress={handleOpenCancelModal}
                disabled={cancelling}
                activeOpacity={0.8}
              >
                <Ionicons name="close-circle-outline" size={16} color="#DC2626" />
                <Text style={styles.cancelDeliveryBtnText}>Cancel Order</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Cancelled Banner */}
          {isCancelled && (
            <View style={styles.cancelledBanner}>
              <Ionicons name="close-circle" size={24} color="#DC2626" />
              <View style={{ marginLeft: 12, flex: 1 }}>
                <Text style={styles.cancelledBannerTitle}>Order Cancelled</Text>
                <Text style={styles.cancelledBannerSub}>This delivery order has been cancelled.</Text>
              </View>
              <TouchableOpacity
                style={styles.returnHomeBtn}
                onPress={() => router.replace('/(main)/home')}
                activeOpacity={0.8}
              >
                <Text style={styles.returnHomeBtnText}>Home</Text>
              </TouchableOpacity>
            </View>
          )}

        </View>
      </ScrollView>

      {/* Cancellation Modal */}
      <Modal
        visible={cancelModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => !cancelling && setCancelModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalIconBox}>
              <Ionicons name="alert-circle" size={36} color="#DC2626" />
            </View>
            <Text style={styles.modalTitle}>Cancel Delivery Order?</Text>
            <Text style={styles.modalSub}>
              Are you sure you want to cancel this order? Once the kitchen starts cooking, cancellation is no longer possible.
            </Text>

            {cancelError && (
              <View style={styles.modalErrorBox}>
                <Ionicons name="warning-outline" size={16} color="#DC2626" />
                <Text style={styles.modalErrorText}>{cancelError}</Text>
              </View>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalKeepBtn}
                onPress={() => setCancelModalVisible(false)}
                disabled={cancelling}
                activeOpacity={0.8}
              >
                <Text style={styles.modalKeepText}>Keep Order</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalConfirmBtn}
                onPress={handleExecuteCancel}
                disabled={cancelling}
                activeOpacity={0.8}
              >
                {cancelling ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.modalConfirmText}>Yes, Cancel</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center' },
  backBtn: { padding: 4, marginRight: 8 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#000' },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffebf0',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#ff3400',
    marginRight: 5,
  },
  liveText: { fontSize: 11, fontWeight: 'bold', color: '#ff3400' },
  container: { flex: 1 },
  mapContainer: {
    width: '100%',
    height: width * 0.95,
    position: 'relative',
    backgroundColor: '#e8f0e8',
  },
  mapImage: { width: '100%', height: '100%' },
  restaurantMarker: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: '#fff',
    borderWidth: 2, borderColor: '#ff3400', alignItems: 'center', justifyContent: 'center',
  },
  riderMarker: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#ff2a2a',
    alignItems: 'center', justifyContent: 'center', borderWidth: 2.5, borderColor: '#fff',
    shadowColor: '#ff2a2a', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.4, shadowRadius: 6, elevation: 6,
  },
  homeMarker: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: '#fff',
    borderWidth: 2, borderColor: '#00a01d', alignItems: 'center', justifyContent: 'center',
  },
  riderCard: {
    position: 'absolute',
    bottom: 20, left: 16, right: 16,
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.12, shadowRadius: 12,
    elevation: 6,
  },
  riderRow: { flexDirection: 'row', alignItems: 'center' },
  riderAvatarBox: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: '#f5f5f5',
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  riderInfo: { flex: 1 },
  riderName: { fontSize: 15, fontWeight: 'bold', color: '#000', marginBottom: 2 },
  riderRole: { fontSize: 12, color: '#888', marginBottom: 4 },
  ratingBadge: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#00a01d',
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8, alignSelf: 'flex-start',
  },
  ratingText: { color: '#fff', fontSize: 10, fontWeight: 'bold', marginLeft: 3 },
  riderActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  actionBtn: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: '#fff',
    borderWidth: 1, borderColor: '#ffe6e0', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#ff3400', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 1,
  },
  detailsContainer: { padding: 20 },
  orderInfoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  infoLabel: { fontSize: 11, color: '#888', marginBottom: 4 },
  orderIdVal: { fontSize: 17, fontWeight: 'bold', color: '#000' },
  etaVal: { fontSize: 17, fontWeight: 'bold', color: '#ff3400' },
  divider: { height: 1, backgroundColor: '#f0f0f0', marginVertical: 18 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#000', marginBottom: 16 },
  progressTracker: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
  },
  stepItem: { alignItems: 'center', width: 62 },
  stepCircle: {
    width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginBottom: 6,
  },
  stepCompleted: { backgroundColor: '#00a01d' },
  stepActive: { backgroundColor: '#fff', borderWidth: 2.5, borderColor: '#ff3400' },
  innerDot: { width: 9, height: 9, borderRadius: 4.5, backgroundColor: '#ff3400' },
  stepPending: { backgroundColor: '#fff', borderWidth: 2, borderColor: '#ddd' },
  stepText: { fontSize: 10, fontWeight: '700', textAlign: 'center', marginBottom: 3 },
  stepTextCompleted: { color: '#00a01d' },
  stepTextActive: { color: '#ff3400' },
  stepTextPending: { color: '#ccc' },
  stepTime: { fontSize: 9 },
  stepLine: { flex: 1, height: 2.5, marginTop: 9, marginHorizontal: 2 },
  lineCompleted: { backgroundColor: '#00a01d' },
  lineActive: { backgroundColor: '#ff3400' },
  linePending: { backgroundColor: '#e0e0e0' },
  statusBanner: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#f9f9f9', borderRadius: 14, padding: 16,
  },
  statusIconCircle: {
    width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center',
  },
  statusBannerTitle: { fontSize: 15, fontWeight: 'bold', color: '#000', marginBottom: 2 },
  statusBannerSub: { fontSize: 12, color: '#666' },
  accordionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  accordionContent: { marginTop: 14, backgroundColor: '#f9f9f9', borderRadius: 12, padding: 16 },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  itemName: { fontSize: 13, color: '#333', flex: 1 },
  itemPrice: { fontSize: 13, fontWeight: 'bold', color: '#000' },
  subtotalRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    borderTopWidth: 1, borderTopColor: '#e0e0e0', paddingTop: 12, marginTop: 4,
  },
  subtotalLabel: { fontSize: 14, fontWeight: 'bold', color: '#000' },
  subtotalValue: { fontSize: 14, fontWeight: 'bold', color: '#ff3400' },
  cancelCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 14,
    padding: 14,
    marginTop: 18,
  },
  cancelCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#991B1B',
    marginBottom: 2,
  },
  cancelCardSub: {
    fontSize: 12,
    color: '#7F1D1D',
    lineHeight: 16,
  },
  cancelDeliveryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    gap: 4,
    shadowColor: '#DC2626',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 1,
  },
  cancelDeliveryBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#DC2626',
  },
  cancelledBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    borderRadius: 14,
    padding: 16,
    marginTop: 18,
  },
  cancelledBannerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#991B1B',
  },
  cancelledBannerSub: {
    fontSize: 12,
    color: '#7F1D1D',
    marginTop: 2,
  },
  returnHomeBtn: {
    backgroundColor: '#DC2626',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginLeft: 8,
  },
  returnHomeBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
  },
  modalIconBox: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 8,
    textAlign: 'center',
  },
  modalSub: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
  },
  modalErrorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 16,
    gap: 6,
    width: '100%',
  },
  modalErrorText: {
    fontSize: 12,
    color: '#991B1B',
    flex: 1,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
    marginTop: 8,
  },
  modalKeepBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
  },
  modalKeepText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#374151',
  },
  modalConfirmBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#DC2626',
    alignItems: 'center',
  },
  modalConfirmText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
});
