import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  ScrollView,
  BackHandler,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCartStore, useOrderStore } from '../../store';
import { orderApi } from '../../services/apiService';
import { formatTime } from '../../utils/dateUtils';

// ─── Component ────────────────────────────────────────────────────────────────

export default function OrderCompletedScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { clearCart, addItem } = useCartStore();
  const { currentOrder } = useOrderStore();

  const params = useLocalSearchParams<{
    orderId: string;
    dbOrderId?: string;
    tableNumber: string;
    totalAmount: string;
    paymentMethod: string;
    cartItems?: string;
    date?: string;
    phone?: string;
    discountAmount?: string;
    discountCode?: string;
    orderType?: string;
    subtotal?: string;
    customerName?: string;
  }>();

  // Guard: redirect if no order context
  React.useEffect(() => {
    if (!params.orderId && !currentOrder?.orderId) {
      router.replace('/home');
    }
  }, [params, currentOrder, router]);

  // ── Derived values ──
  const displayOrderId = params.orderId || '';
  const feedbackOrderId = params.dbOrderId || displayOrderId;
  const totalAmount = parseFloat(params.totalAmount || '0');
  const completedTime = formatTime(params.date);

  const initialItems: any[] = (() => {
    if (params.cartItems) {
      try {
        return typeof params.cartItems === 'string'
          ? JSON.parse(params.cartItems)
          : params.cartItems;
      } catch (_) {}
    }
    return [];
  })();

  const [orderItemsList, setOrderItemsList] = useState<any[]>(initialItems);
  const [billNumber, setBillNumber] = useState<number | string | null>(null);

  useEffect(() => {
    const fetchId = params.dbOrderId || (params.orderId ? params.orderId.replace(/\D/g, '') : null);
    if (!fetchId) return;

    orderApi.getOrderDetails(fetchId)
      .then((data: any) => {
        if (data?.items && data.items.length > 0) {
          setOrderItemsList(data.items);
        }
        if (data?.order?.bill_no) {
          setBillNumber(data.order.bill_no);
        }
      })
      .catch(() => {});
  }, [params.dbOrderId, params.orderId]);

  const isTakeAway =
    (params.tableNumber?.toLowerCase().includes('takeaway') ||
      params.tableNumber?.toLowerCase().includes('take away') ||
      params.orderType?.toLowerCase() === 'take away') ?? false;

  const isDelivery =
    params.tableNumber?.toLowerCase().includes('delivery') ||
    params.orderType?.toLowerCase() === 'delivery';

  const isDineIn = !isTakeAway && !isDelivery;

  // ── Animation ──
  const [headerScale] = useState(() => new Animated.Value(0.85));
  const [cardOpacity] = useState(() => new Animated.Value(0));
  const [cardTranslateY] = useState(() => new Animated.Value(30));

  // ── Navigation ──
  const handleReturnHome = () => {
    try {
      const { completeTakeawaySession, completeDeliverySession, closeDineInSession } =
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('../../store/sessionUtils');
      if (isDelivery) completeDeliverySession(false);
      else if (isDineIn) closeDineInSession();
      else completeTakeawaySession(false);
    } catch (_) {}
    router.dismissAll();
    router.replace('/home');
  };

  useEffect(() => {
    Animated.sequence([
      Animated.spring(headerScale, { toValue: 1, useNativeDriver: true, tension: 60 }),
      Animated.parallel([
        Animated.timing(cardOpacity, { toValue: 1, duration: 350, useNativeDriver: true }),
        Animated.timing(cardTranslateY, { toValue: 0, duration: 350, useNativeDriver: true }),
      ]),
    ]).start();

    const onBack = () => { handleReturnHome(); return true; };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => sub.remove();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Feedback state ──
  const [rating, setRating] = useState(0);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [feedbackDone, setFeedbackDone] = useState(false);

  const TAGS = isDineIn
    ? ['Fast service', 'Delicious food', 'Clean table', 'Great ambiance']
    : ['Fast prep', 'Fresh food', 'Easy pickup', 'Great packing'];

  const toggleTag = (tag: string) =>
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );

  const submitFeedback = async () => {
    if (rating === 0) {
      Alert.alert('Rate your experience', 'Please tap a star before submitting.');
      return;
    }
    setSubmitting(true);
    try {
      const apiTags = selectedTags.map(t =>
        t === 'Great packing' ? 'GREAT_PACKAGING' : t.toUpperCase().replace(/ /g, '_')
      );
      const res = await orderApi.submitFeedback(feedbackOrderId, {
        rating,
        feedback_tags: apiTags,
      } as any);
      if (res?.success) {
        setFeedbackDone(true);
        Alert.alert('Thank you! 🎉', res.message || 'Your feedback has been submitted.');
      } else {
        Alert.alert('Error', 'Could not submit feedback. Please try again.');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Network error submitting feedback.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReorder = () => {
    clearCart();
    orderItemsList.forEach((item: any) => addItem(item));
    Alert.alert('Reordered', 'Items have been added back to your cart.');
    router.dismissAll();
    router.replace((isDelivery ? '/delivery-checkout' : '/checkout') as any);
  };

  const handleDownloadInvoice = () => {
    router.push({
      pathname: '/(checkout)/invoice' as any,
      params: {
        orderId: displayOrderId,
        dbOrderId: params.dbOrderId || feedbackOrderId,
        billNo: billNumber ? String(billNumber) : '',
        finalTotal: totalAmount.toString(),
        subtotal: params.subtotal || totalAmount.toString(),
        mobileNumber: params.phone || 'WALK-IN',
        customerName: params.customerName || 'REGISTERED',
        paymentMethod: params.paymentMethod || 'UPI',
        cartData: JSON.stringify(orderItemsList),
        discountAmount: params.discountAmount || '0',
        discountCode: params.discountCode || '',
        orderType: isDelivery ? 'Delivery' : isTakeAway ? 'Take Away' : 'Dine In',
      },
    });
  };

  // ── Theming by order type ──
  const headerColor = '#16a34a';
  const accentColor = '#ff5a1f';

  const headerIcon = isTakeAway ? 'bag-check-outline' : isDelivery ? 'bicycle-outline' : 'restaurant-outline';
  const headerTitle = isTakeAway ? 'Picked Up!' : isDelivery ? 'Delivered!' : 'Order Served!';
  const headerSubtitle = isTakeAway
    ? `Order completed at ${completedTime}  •  ${params.paymentMethod ? `Paid (${params.paymentMethod})` : 'Paid'}${billNumber ? `  •  Bill #${billNumber}` : ''}  •  Total Rs. ${totalAmount.toFixed(0)}`
    : isDelivery
    ? `Delivered at ${completedTime}  •  ${params.paymentMethod ? `Paid (${params.paymentMethod})` : 'Paid'}${billNumber ? `  •  Bill #${billNumber}` : ''}  •  Total Rs. ${totalAmount.toFixed(0)}`
    : `Served at ${completedTime}  •  ${params.paymentMethod ? `Paid (${params.paymentMethod})` : 'Paid'}${billNumber ? `  •  Bill #${billNumber}` : ''}  •  Total Rs. ${totalAmount.toFixed(0)}`;

  const feedbackQuestion = isDineIn
    ? 'How was your dine-in experience?'
    : isDelivery
    ? 'How was your delivery experience?'
    : 'How was your takeaway experience?';

  // ── Loyalty points (mock: 1 point per ₹10) ──
  const loyaltyPoints = Math.max(1, Math.round(totalAmount / 10));

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={styles.root}>
      {/* ── Header ── */}
      <Animated.View
        style={[
          styles.header,
          { paddingTop: insets.top + 28, backgroundColor: headerColor },
          { transform: [{ scale: headerScale }] },
        ]}
      >
        {/* Icon circle */}
        <View style={styles.iconCircle}>
          <Ionicons name={headerIcon as any} size={30} color={headerColor} />
        </View>
        <Text style={styles.headerTitle}>{headerTitle}</Text>
        <Text style={styles.headerSubtitle}>{headerSubtitle}</Text>
      </Animated.View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 200 }]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View
          style={{ opacity: cardOpacity, transform: [{ translateY: cardTranslateY }] }}
        >
          {/* ── Loyalty Points Card ── */}
          <View style={styles.loyaltyCard}>
            <View style={styles.loyaltyLeft}>
              <Ionicons name="gift-outline" size={18} color={accentColor} />
              <Text style={styles.loyaltyLabel}>Data Udipi Club Points</Text>
            </View>
            <Text style={styles.loyaltyPoints}>+{loyaltyPoints} points</Text>
          </View>

          {/* ── Feedback Card ── */}
          <View style={styles.card}>
            <Text style={styles.feedbackQuestion}>{feedbackQuestion}</Text>

            {/* Star Rating */}
            <View style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map(star => (
                <TouchableOpacity
                  key={star}
                  onPress={() => !feedbackDone && setRating(star)}
                  activeOpacity={0.7}
                  disabled={feedbackDone}
                >
                  <Ionicons
                    name={rating >= star ? 'star' : 'star-outline'}
                    size={36}
                    color="#f59e0b"
                    style={{ marginHorizontal: 4 }}
                  />
                </TouchableOpacity>
              ))}
            </View>

            {/* Quick Tags */}
            <View style={styles.tagsWrap}>
              {TAGS.map(tag => {
                const selected = selectedTags.includes(tag);
                return (
                  <TouchableOpacity
                    key={tag}
                    onPress={() => !feedbackDone && toggleTag(tag)}
                    style={[styles.tagPill, selected && styles.tagPillSelected]}
                    activeOpacity={0.8}
                    disabled={feedbackDone}
                  >
                    <Text style={[styles.tagText, selected && styles.tagTextSelected]}>
                      {tag}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Submit / Done */}
            {feedbackDone ? (
              <View style={styles.feedbackDoneRow}>
                <Ionicons name="checkmark-circle" size={18} color="#16a34a" />
                <Text style={styles.feedbackDoneText}>Feedback submitted — thank you!</Text>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.submitBtn, rating === 0 && styles.submitBtnDisabled]}
                onPress={submitFeedback}
                activeOpacity={0.8}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.submitBtnText}>Submit Feedback</Text>
                )}
              </TouchableOpacity>
            )}
          </View>

          {/* ── Items Ordered ── */}
          {orderItemsList.length > 0 && (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Items Ordered</Text>
              {orderItemsList.map((item: any, idx: number) => (
                <View key={idx} style={styles.itemRow}>
                  <Text style={styles.itemName}>
                    {item.quantity || 1}x {item.name || item.itemName || 'Item'}
                  </Text>
                  <Text style={styles.itemPrice}>
                    Rs. {((item.price || 0) * (item.quantity || 1)).toFixed(0)}
                  </Text>
                </View>
              ))}
              <View style={styles.divider} />
              <View style={styles.itemRow}>
                <Text style={[styles.itemName, { fontWeight: '700', color: '#111' }]}>
                  Total Paid {params.paymentMethod ? `(${params.paymentMethod})` : ''}
                </Text>
                <Text style={[styles.itemPrice, { color: accentColor }]}>
                  Rs. {totalAmount.toFixed(0)}
                </Text>
              </View>
            </View>
          )}
        </Animated.View>
      </ScrollView>

      {/* ── Bottom Actions ── */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 16 }]}>
        {/* Reorder */}
        <TouchableOpacity style={styles.reorderBtn} onPress={handleReorder} activeOpacity={0.85}>
          <Ionicons name="refresh-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
          <Text style={styles.reorderText}>Reorder This Meal</Text>
        </TouchableOpacity>

        {/* Download E-Invoice */}
        <TouchableOpacity style={styles.invoiceBtn} onPress={handleDownloadInvoice} activeOpacity={0.85}>
          <Ionicons name="document-text-outline" size={16} color={accentColor} style={{ marginRight: 6 }} />
          <Text style={styles.invoiceText}>Download E-Invoice</Text>
        </TouchableOpacity>

        {/* Back to Home */}
        <TouchableOpacity onPress={handleReturnHome} activeOpacity={0.7} style={styles.homeBtn}>
          <Text style={styles.homeText}>Back to Home</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },

  // Header
  header: {
    alignItems: 'center',
    paddingBottom: 32,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 6,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.3,
    marginBottom: 6,
  },
  headerSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.88)',
    textAlign: 'center',
    paddingHorizontal: 24,
  },

  // Scroll
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 18,
  },

  // Loyalty card
  loyaltyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff5f0',
    borderWidth: 1,
    borderColor: '#ffd5c2',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 14,
  },
  loyaltyLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  loyaltyLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
  },
  loyaltyPoints: {
    fontSize: 14,
    fontWeight: '800',
    color: '#ff5a1f',
  },

  // Card
  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },

  // Feedback
  feedbackQuestion: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111',
    textAlign: 'center',
    marginBottom: 16,
  },
  starsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 18,
  },
  tagsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
    marginBottom: 20,
  },
  tagPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  tagPillSelected: {
    backgroundColor: '#fff0eb',
    borderColor: '#ff5a1f',
  },
  tagText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  tagTextSelected: {
    color: '#ff5a1f',
    fontWeight: '700',
  },
  submitBtn: {
    backgroundColor: '#ff5a1f',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#ff5a1f',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  submitBtnDisabled: {
    backgroundColor: '#ccc',
    shadowOpacity: 0,
    elevation: 0,
  },
  submitBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  feedbackDoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f0fdf4',
    borderRadius: 12,
    paddingVertical: 12,
    gap: 6,
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  feedbackDoneText: {
    fontSize: 13,
    color: '#16a34a',
    fontWeight: '600',
  },

  // Items ordered
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111',
    marginBottom: 14,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  itemName: {
    fontSize: 13,
    color: '#444',
    fontWeight: '500',
    flex: 1,
    marginRight: 8,
  },
  itemPrice: {
    fontSize: 13,
    color: '#111',
    fontWeight: '700',
  },
  divider: {
    height: 1,
    backgroundColor: '#f0f0f0',
    marginVertical: 6,
  },

  // Bottom bar
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#ececec',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 8,
  },
  reorderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ff5a1f',
    borderRadius: 24,
    paddingVertical: 15,
    marginBottom: 10,
    shadowColor: '#ff5a1f',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 6,
    elevation: 3,
  },
  reorderText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  invoiceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff5f0',
    borderRadius: 24,
    paddingVertical: 13,
    marginBottom: 8,
    borderWidth: 1.5,
    borderColor: '#ff5a1f',
  },
  invoiceText: {
    color: '#ff5a1f',
    fontSize: 14,
    fontWeight: '700',
  },
  homeBtn: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  homeText: {
    fontSize: 14,
    color: '#888',
    fontWeight: '600',
  },
});
