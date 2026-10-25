import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Share, Alert, Platform, ActivityIndicator } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useCartStore, useRestaurantStore } from '../../store';
import { useAuthStore } from '../../store/useAuthStore';

import { orderApi, customerApi, deliveryApi } from '../../services/apiService';
import { formatDateOnly } from '../../utils/dateUtils';

export default function DeliveryCompletedScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    orderId: string;
    dbOrderId?: string;
    cart: string;
    riderName?: string;
    riderPhone?: string;
    totalAmount?: string;
    paymentMethod?: string;
  }>();

  const { clearCart, addItem, setOrderType } = useCartStore();
  const { customerId } = useAuthStore();
  const { selectedOutlet } = useRestaurantStore();

  const [foodRating, setFoodRating] = useState(0);
  const [deliveryRating, setDeliveryRating] = useState(0);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);

  const tags = ['Great packaging', 'Tasty Food', 'Fast Delivery', 'Friendly Rider', 'Perfect Temperature'];

  const toggleTag = (tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const [loading, setLoading] = useState(true);
  const [orderData, setOrderData] = useState<any>(null);
  const [trackingData, setTrackingData] = useState<any>(null);
  const [loyaltyPoints, setLoyaltyPoints] = useState<number | null>(null);

  useEffect(() => {
    const fetchRealData = async () => {
      const dbId = params.dbOrderId;
      if (!dbId) {
        setLoading(false);
        return;
      }
      try {
        const restaurantId = selectedOutlet?.restaurant_id ? Number(selectedOutlet.restaurant_id) : null;
        if (!restaurantId) throw new Error('Restaurant context is unavailable for this order');
        const results = await Promise.allSettled([
          orderApi.getOrderDetails(dbId, restaurantId),
          deliveryApi.getOrderTracking(dbId),
        ]);
        if (results[0].status === 'fulfilled' && results[0].value?.order) {
          setOrderData(results[0].value);
        }
        if (results[1].status === 'fulfilled') {
          setTrackingData(results[1].value);
        }

        // Fetch loyalty transactions, don't fail if it doesn't work
        try {
          const lData = customerId ? await customerApi.getLoyalty(Number(customerId)).catch(() => null) : null;
          if (lData) {
            // Find the points earned for this order
            // Note: The structure might be 'recent_transactions' or 'transactions'
            const txs = lData.recent_transactions || lData.transactions || [];
            const txForOrder = txs.find((t: any) => String(t.order_id) === String(dbId));
            if (txForOrder && txForOrder.points) {
              setLoyaltyPoints(txForOrder.points);
            }
          }
        } catch (e) {
          // Ignore loyalty error
        }

      } catch (err) {
        console.error('Failed to load completed order data', err);
      } finally {
        setLoading(false);
      }
    };
    fetchRealData();
  }, [params.dbOrderId, selectedOutlet]);

  const items = orderData?.items?.length ? orderData.items : (() => {
    try {
      if (params.cart && params.cart !== '[object Object]') {
        const parsed = JSON.parse(params.cart);
        return Array.isArray(parsed) ? parsed : [];
      }
    } catch (e) {}
    return [];
  })();

  const subtotal = items.reduce((acc: number, item: any) => acc + (Number(item.price || item.unit_price) * (item.quantity || 1)), 0);
  const totalAmt = orderData?.order?.total_amount ? Number(orderData.order.total_amount) : (params.totalAmount ? Number(params.totalAmount) : subtotal);
  const orderIdDisplay = params.orderId || (orderData?.order?.id ? `ORD-${orderData.order.id}` : 'UDP-XXXXXX');
  const deliveryFee = Number(orderData?.order?.delivery_fee || 0);
  const packagingFee = Number(orderData?.order?.packaging_fee || 0);
  const gstAmt = Number(orderData?.order?.gst_amount || 0);
  const tipAmt = Number(orderData?.order?.tip_amount || 0);
  const discountAmt = Number(orderData?.order?.discount_amount || 0);
  const grandTotal = totalAmt;
  const paymentMethod = orderData?.order?.payment_method || params.paymentMethod || 'UPI';
  
  const deliveredTimelineEvent = trackingData?.timeline?.find((event: any) => event.status === 'DELIVERED');
  const deliveredAt = trackingData?.assignment?.delivered_at || orderData?.order?.delivered_at || deliveredTimelineEvent?.created_at;
  const deliveryDateStr = deliveredAt
    ? formatDateOnly(deliveredAt)
    : 'Date unavailable';

  const handleReorder = () => {
    if (items.length === 0) {
      Alert.alert('No items', 'Cannot reorder — order details not found.');
      return;
    }
    clearCart();
    setOrderType('Delivery');
    items.forEach((item: any) => {
      addItem({
        id: item.id || item.menu_item_id,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        image: item.image || item.image_url || 'https://via.placeholder.com/150',
        category: item.category || 'Special',
      });
    });
    router.push('/checkout');
  };

  const handleShareInvoice = async () => {
    const lines = [
      `🧾 Order Invoice — Udupi Restaurant`,
      `Order ID: ${orderIdDisplay}`,
      `Date: ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}`,
      `Payment: ${params.paymentMethod || 'UPI'}`,
      ``,
      `Items:`,
      ...items.map((i: any) => `  ${i.name} x${i.quantity || 1}  —  Rs. ${Number(i.price) * (i.quantity || 1)}`),
      ``,
      `Subtotal:   Rs. ${subtotal}`,
      `Delivery:   Rs. ${deliveryFee}`,
      `GST (5%):   Rs. ${gstAmt}`,
      `─────────────────────`,
      `Total:      Rs. ${grandTotal}`,
      ``,
      `Thank you for ordering! 🙏`,
    ].join('\n');

    try {
      await Share.share({ message: lines, title: `Invoice — ${orderIdDisplay}` });
    } catch (e) {
      Alert.alert('Share failed', 'Could not open share sheet.');
    }
  };

  const handleSubmitFeedback = () => {
    setFeedbackSubmitted(true);
    Alert.alert('Thank you!', 'Your feedback has been submitted.');
  };

  const renderStars = (rating: number, setRating: (v: number) => void) => (
    <View style={styles.starsRow}>
      {[1, 2, 3, 4, 5].map(star => (
        <TouchableOpacity key={star} onPress={() => setRating(star)} activeOpacity={0.7}>
          <Ionicons
            name={star <= rating ? 'star' : 'star-outline'}
            size={26}
            color={star <= rating ? '#ffc107' : '#ddd'}
            style={{ marginLeft: 4 }}
          />
        </TouchableOpacity>
      ))}
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: '#00a01d', alignItems: 'center', justifyContent: 'center' }]}> 
        <ActivityIndicator size="large" color="#fff" />
        <Text style={{ color: '#fff', marginTop: 12 }}>Loading your completed order...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: '#00a01d' }]}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} bounces={false}>

        {/* Green header */}
        <View style={styles.headerBox}>
          <View style={styles.checkCircle}>
            <Ionicons name="checkmark" size={40} color="#00a01d" />
          </View>
          <Text style={styles.headerTitle}>Order Delivered! 🎉</Text>
          <Text style={styles.headerSubtitle}>
            {params.riderName ? `Delivered by ${params.riderName}` : 'Your food has been delivered'}
          </Text>
          <View style={styles.orderIdPill}>
            <Text style={styles.orderIdPillText}>{orderIdDisplay}</Text>
          </View>
        </View>

        {/* White body */}
        <View style={styles.bodySection}>

          {/* Invoice Card */}
          <View style={styles.invoiceCard}>
            <View style={styles.invoiceHeader}>
              <Text style={styles.invoiceTitle}>Order Invoice</Text>
              <TouchableOpacity style={styles.shareBtn} onPress={handleShareInvoice}>
                <Ionicons name="share-outline" size={16} color="#ff3400" />
                <Text style={styles.shareBtnText}>Share</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.invoiceMeta}>
              <View>
                <Text style={styles.invoiceMetaLabel}>Date</Text>
                <Text style={styles.invoiceMetaValue}>{deliveryDateStr}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.invoiceMetaLabel}>Payment</Text>
                <Text style={styles.invoiceMetaValue}>{paymentMethod}</Text>
              </View>
            </View>

            <View style={styles.invoiceDivider} />

            {/* Items */}
            {items.map((item: any, idx: number) => (
              <View key={idx} style={styles.invoiceItemRow}>
                <View style={styles.invoiceItemLeft}>
                  <View style={styles.qtyBadge}><Text style={styles.qtyText}>{item.quantity || 1}</Text></View>
                  <Text style={styles.invoiceItemName} numberOfLines={1}>{item.name || item.itemName || 'Item'}</Text>
                </View>
                <Text style={styles.invoiceItemPrice}>Rs. {Number(item.price || item.unit_price) * (item.quantity || 1)}</Text>
              </View>
            ))}

            <View style={styles.invoiceDivider} />

            {/* Breakdown */}
            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>Subtotal</Text>
              <Text style={styles.breakdownValue}>Rs. {subtotal}</Text>
            </View>
            {packagingFee > 0 && (
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>Packaging fee</Text>
                <Text style={styles.breakdownValue}>Rs. {packagingFee}</Text>
              </View>
            )}
            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>Delivery fee</Text>
              <Text style={styles.breakdownValue}>Rs. {deliveryFee}</Text>
            </View>
            {tipAmt > 0 && (
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>Rider Tip</Text>
                <Text style={styles.breakdownValue}>Rs. {tipAmt}</Text>
              </View>
            )}
            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>GST (5%)</Text>
              <Text style={styles.breakdownValue}>Rs. {gstAmt}</Text>
            </View>
            {discountAmt > 0 && (
              <View style={styles.breakdownRow}>
                <Text style={[styles.breakdownLabel, { color: '#00a01d' }]}>Discount</Text>
                <Text style={[styles.breakdownValue, { color: '#00a01d' }]}>- Rs. {discountAmt}</Text>
              </View>
            )}

            <View style={[styles.invoiceDivider, { marginBottom: 12 }]} />
            <View style={styles.grandTotalRow}>
              <Text style={styles.grandTotalLabel}>Total Paid</Text>
              <Text style={styles.grandTotalValue}>Rs. {grandTotal}</Text>
            </View>
          </View>

          {/* Loyalty Points */}
          <View style={styles.loyaltyPill}>
            <MaterialCommunityIcons name="medal-outline" size={20} color="#ff8c00" />
            <Text style={styles.loyaltyText}>
              {loyaltyPoints ? (
                <>You earned <Text style={{ color: '#ff8c00', fontWeight: 'bold' }}>{loyaltyPoints} Loyalty Points!</Text></>
              ) : (
                'Points will appear shortly'
              )}
            </Text>
          </View>

          {/* Rating Card */}
          {!feedbackSubmitted ? (
            <View style={styles.ratingCard}>
              <Text style={styles.cardTitle}>Rate Your Experience</Text>

              <View style={styles.ratingRow}>
                <Text style={styles.ratingLabel}>Food Quality</Text>
                {renderStars(foodRating, setFoodRating)}
              </View>
              <View style={styles.ratingRow}>
                <Text style={styles.ratingLabel}>Delivery Service</Text>
                {renderStars(deliveryRating, setDeliveryRating)}
              </View>

              <Text style={styles.tagsTitle}>WHAT DID YOU LIKE MOST?</Text>
              <View style={styles.tagsContainer}>
                {tags.map(tag => {
                  const active = selectedTags.includes(tag);
                  return (
                    <TouchableOpacity key={tag} style={[styles.tagBtn, active && styles.tagBtnActive]} onPress={() => toggleTag(tag)}>
                      <Text style={[styles.tagText, active && styles.tagTextActive]}>{tag}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <TouchableOpacity style={styles.submitFeedbackBtn} onPress={handleSubmitFeedback}>
                <Text style={styles.submitFeedbackText}>Submit Feedback</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.feedbackDoneBox}>
              <Ionicons name="checkmark-circle" size={32} color="#00a01d" />
              <Text style={styles.feedbackDoneText}>Thanks for your feedback!</Text>
            </View>
          )}

          {/* Action Buttons */}
          <TouchableOpacity style={styles.reorderBtn} onPress={handleReorder}>
            <Ionicons name="refresh" size={18} color="#fff" style={{ marginRight: 8 }} />
            <Text style={styles.reorderBtnText}>Reorder This Meal</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.homeBtn}
            onPress={() => router.push({
              pathname: '/(checkout)/invoice' as any,
              params: {
                dbOrderId: String(params.dbOrderId || ''),
                orderId: orderIdDisplay || '',
                orderType: 'Delivery',
                paymentMethod: paymentMethod || 'UPI',
                finalTotal: String(totalAmt || ''),
                cartData: JSON.stringify(items || []),
              },
            })}
            disabled={!params.dbOrderId}
          >
            <Ionicons name="document-text-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
            <Text style={styles.homeBtnText}>Download Invoice</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.homeBtn} onPress={() => router.replace('/(main)/home' as any)}>
            <Text style={styles.homeBtnText}>Back to Home</Text>
          </TouchableOpacity>

        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  scrollContent: { flexGrow: 1 },

  // Header
  headerBox: { backgroundColor: '#00a01d', alignItems: 'center', paddingTop: 32, paddingBottom: 40, paddingHorizontal: 20 },
  checkCircle: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  headerTitle: { fontSize: 26, fontWeight: '800', color: '#fff', marginBottom: 6 },
  headerSubtitle: { fontSize: 14, color: 'rgba(255,255,255,0.85)', textAlign: 'center', marginBottom: 14 },
  orderIdPill: {
    backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20,
  },
  orderIdPillText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },

  // Body
  bodySection: { backgroundColor: '#fff', flex: 1, paddingTop: 24, paddingHorizontal: 16 },

  // Invoice
  invoiceCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 20,
    borderWidth: 1, borderColor: '#f0f0f0',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8,
    elevation: 3, marginBottom: 20,
  },
  invoiceHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  invoiceTitle: { fontSize: 17, fontWeight: '800', color: '#000' },
  shareBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#fff5f2', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  shareBtnText: { color: '#ff3400', fontSize: 13, fontWeight: '600' },
  invoiceMeta: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
  invoiceMetaLabel: { fontSize: 11, color: '#999', marginBottom: 2 },
  invoiceMetaValue: { fontSize: 13, fontWeight: '700', color: '#333' },
  invoiceDivider: { height: 1, backgroundColor: '#f0f0f0', marginVertical: 12 },
  invoiceItemRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  invoiceItemLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  qtyBadge: {
    width: 22, height: 22, borderRadius: 11, backgroundColor: '#f0f0f0',
    alignItems: 'center', justifyContent: 'center', marginRight: 10,
  },
  qtyText: { fontSize: 11, fontWeight: 'bold', color: '#333' },
  invoiceItemName: { fontSize: 13, color: '#333', flex: 1 },
  invoiceItemPrice: { fontSize: 13, fontWeight: '700', color: '#000' },
  breakdownRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  breakdownLabel: { fontSize: 13, color: '#777' },
  breakdownValue: { fontSize: 13, color: '#333' },
  grandTotalRow: { flexDirection: 'row', justifyContent: 'space-between' },
  grandTotalLabel: { fontSize: 16, fontWeight: '800', color: '#000' },
  grandTotalValue: { fontSize: 16, fontWeight: '800', color: '#ff3400' },

  // Loyalty
  loyaltyPill: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#fff8ee', alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 20,
    borderRadius: 24, marginBottom: 20, borderWidth: 1, borderColor: '#ffe0aa',
  },
  loyaltyText: { fontSize: 14, color: '#333', marginLeft: 8 },

  // Rating
  ratingCard: { backgroundColor: '#f9f9f9', borderRadius: 16, padding: 20, marginBottom: 20 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#333', textAlign: 'center', marginBottom: 18 },
  ratingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  ratingLabel: { fontSize: 14, color: '#555', fontWeight: '500' },
  starsRow: { flexDirection: 'row', alignItems: 'center' },
  tagsTitle: { fontSize: 11, fontWeight: '700', color: '#aaa', textAlign: 'center', marginTop: 14, marginBottom: 12 },
  tagsContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  tagBtn: { borderWidth: 1, borderColor: '#e0e0e0', backgroundColor: '#fff', paddingVertical: 7, paddingHorizontal: 14, borderRadius: 20 },
  tagBtnActive: { borderColor: '#ff3400', backgroundColor: '#fff5f2' },
  tagText: { fontSize: 12, color: '#888' },
  tagTextActive: { color: '#ff3400', fontWeight: '600' },
  submitFeedbackBtn: { marginTop: 16, paddingVertical: 11, alignItems: 'center', backgroundColor: '#e6f7eb', borderRadius: 10 },
  submitFeedbackText: { color: '#00a01d', fontWeight: '700', fontSize: 14 },

  // Feedback done
  feedbackDoneBox: { alignItems: 'center', paddingVertical: 24, marginBottom: 20 },
  feedbackDoneText: { marginTop: 8, fontSize: 14, color: '#00a01d', fontWeight: '600' },

  // Buttons
  reorderBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#ff3400', paddingVertical: 16, borderRadius: 14, marginBottom: 12,
    shadowColor: '#ff3400', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 5,
  },
  reorderBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  homeBtn: { alignItems: 'center', paddingVertical: 14, marginBottom: 30 },
  homeBtnText: { color: '#888', fontSize: 15, fontWeight: '500' },
});
