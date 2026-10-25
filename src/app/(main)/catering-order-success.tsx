import { API_BASE_URL } from '../../constants/api';
import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  SafeAreaView, Platform, StatusBar, ActivityIndicator, Animated
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '../../store/useAuthStore';
import { useCateringSessionStore } from '../../store/useCateringSessionStore';

interface CateringOrder {
  id: number;
  catering_session_id: string;
  package_name: string;
  event_name: string | null;
  event_date: string | null;
  guest_count: number;
  total_amount: number;
  advance_amount: number;
  paid_amount: number;
  balance_amount: number;
  full_payment_due_date: string | null;
  payment_status: string;
  order_status: string;
  restaurant_id?: number | null;
}

const TIMELINE_STEPS = [
  { key: 'CONFIRMED', label: 'Menu Confirmed & Setup', doneStatuses: ['CONFIRMED', 'PREPARING', 'READY', 'DELIVERED'] },
  { key: 'PREPARING', label: 'Kitchen Planning', doneStatuses: ['PREPARING', 'READY', 'DELIVERED'] },
  { key: 'READY', label: 'Event Day Preparation & Delivery', doneStatuses: ['READY', 'DELIVERED'] },
];

export default function CateringOrderSuccess() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const auth = useAuthStore();
  const { orderType } = useCateringSessionStore();

  const orderId = parseInt(params.orderId as string || '0', 10);
  const advanceAmount = parseFloat(params.advanceAmount as string || '0');
  const paidAmount = parseFloat(params.paidAmount as string || advanceAmount.toString());
  const totalAmount = parseFloat(params.totalAmount as string || '0');

  const [order, setOrder] = useState<CateringOrder | null>(null);
  const [loading, setLoading] = useState(true);

  // Animated scale for the success icon
  const [scaleAnim] = useState(() => new Animated.Value(0));

  const fetchOrderDetails = async () => {
    try {
      const baseUrl = API_BASE_URL;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(auth.token ? { Authorization: `Bearer ${auth.token}` } : {}),
      };
      const res = await fetch(`${baseUrl}/api/v1/public/catering/orders/${orderId}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setOrder(data);
      }
    } catch (e) {
      console.error('Failed to fetch order details', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      tension: 60,
      friction: 6,
      useNativeDriver: true,
    }).start();

    if (orderId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchOrderDetails();
    } else {
      setTimeout(() => setLoading(false), 0);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, scaleAnim]);


  const fmt = (n: number) =>
    n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  // Use live order data if available, fallback to passed params
  const displayOrder = {
    id: order?.id || orderId,
    packageName: order?.package_name || (params.packageName as string) || '-',
    eventName: order?.event_name || (params.eventName as string) || '-',
    guestCount: order?.guest_count || parseInt(params.guestCount as string || '0', 10),
    paidAmount: order?.paid_amount ?? paidAmount,
    balance: order?.balance_amount ?? (totalAmount - paidAmount),
    dueDate: order?.full_payment_due_date,
    orderStatus: order?.order_status || 'CONFIRMED',
    paymentStatus: order?.payment_status || 'ADVANCE_PAID',
    restaurant_id: order?.restaurant_id ?? (params.restaurantId ? Number(params.restaurantId) : undefined),
  };

  const displayOrderId = `ORD-${displayOrder.id.toString().padStart(6, '0')}`;

  const getStepState = (step: typeof TIMELINE_STEPS[0]) => {
    if (step.doneStatuses.includes(displayOrder.orderStatus)) return 'done';
    if (step.key === displayOrder.orderStatus) return 'active';
    // Next pending step after done ones
    const doneCount = TIMELINE_STEPS.filter(s =>
      s.doneStatuses.includes(displayOrder.orderStatus)
    ).length;
    const stepIndex = TIMELINE_STEPS.findIndex(s => s.key === step.key);
    if (stepIndex === doneCount) return 'pending';
    return 'future';
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#2ecc71" />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>

        {/* Green Success Banner */}
        <View style={styles.banner}>
          <Animated.View style={[styles.checkCircle, { transform: [{ scale: scaleAnim }] }]}>
            <Ionicons name="checkmark" size={36} color="#2ecc71" />
          </Animated.View>

          <Text style={styles.bannerTitle}>{orderType} Booked Successfully!</Text>
          <View style={styles.orderIdPill}>
            <Text style={styles.orderIdText}>ID: {displayOrderId}</Text>
          </View>
        </View>

        <View style={styles.content}>

          {loading ? (
            <ActivityIndicator size="large" color="#ff4500" style={{ marginVertical: 30 }} />
          ) : (
            <>
              {/* Payment Record */}
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Payment Record</Text>
                <View style={styles.row}>
                  <Text style={styles.rowLabel}>Paid Amount</Text>
                  <Text style={[styles.rowValue, { color: '#2ecc71' }]}>Rs. {fmt(displayOrder.paidAmount)}</Text>
                </View>
                <View style={styles.row}>
                  <Text style={styles.rowLabel}>Remaining Balance</Text>
                  <Text style={[styles.rowValue, { color: '#333' }]}>Rs. {fmt(displayOrder.balance)}</Text>
                </View>
                {displayOrder.balance > 0 && (
                  <Text style={styles.balanceNote}>
                    {displayOrder.dueDate 
                      ? `Full payment is due by ${displayOrder.dueDate}`
                      : 'Remaining balance is due before the event'}
                  </Text>
                )}
              </View>

              {/* Order Details */}
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Order Details</Text>
                <View style={styles.row}>
                  <Text style={styles.rowLabel}>Package</Text>
                  <Text style={[styles.rowValue, { flex: 1, textAlign: 'right' }]}>{displayOrder.packageName}</Text>
                </View>
                {displayOrder.eventName && displayOrder.eventName !== '-' && (
                  <View style={styles.row}>
                    <Text style={styles.rowLabel}>Event</Text>
                    <Text style={styles.rowValue}>{displayOrder.eventName}</Text>
                  </View>
                )}
                {displayOrder.guestCount > 0 && (
                  <View style={styles.row}>
                    <Text style={styles.rowLabel}>Guests</Text>
                    <Text style={styles.rowValue}>{displayOrder.guestCount}</Text>
                  </View>
                )}
                <View style={styles.row}>
                  <Text style={styles.rowLabel}>Payment Status</Text>
                  <View style={styles.statusPill}>
                    <Text style={styles.statusPillText}>{displayOrder.paymentStatus.replace(/_/g, ' ')}</Text>
                  </View>
                </View>
              </View>

              {/* Prep Timeline */}
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Prep Timeline</Text>

                {TIMELINE_STEPS.map((step, index) => {
                  const state = getStepState(step);
                  return (
                    <View key={step.key} style={styles.timelineRow}>
                      {/* Connector line */}
                      <View style={styles.timelineLeft}>
                        <View style={[
                          styles.timelineDot,
                          state === 'done' && styles.timelineDotDone,
                          state === 'pending' && styles.timelineDotPending,
                          state === 'future' && styles.timelineDotFuture,
                        ]}>
                          {state === 'done' && <Ionicons name="checkmark" size={10} color="#fff" />}
                        </View>
                        {index < TIMELINE_STEPS.length - 1 && (
                          <View style={[styles.timelineLine, state === 'done' && styles.timelineLineDone]} />
                        )}
                      </View>
                      <View style={styles.timelineContent}>
                        <Text style={[
                          styles.timelineLabel,
                          state === 'done' && styles.timelineLabelDone,
                          state === 'pending' && styles.timelineLabelPending,
                          state === 'future' && styles.timelineLabelFuture,
                        ]}>
                          {step.label}
                          {state === 'pending' && ' (Pending)'}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>

              {/* Support Note */}
              <View style={styles.supportCard}>
                <Ionicons name="mail-outline" size={16} color="#888" style={{ marginRight: 8, marginTop: 1 }} />
                <Text style={styles.supportText}>
                  Need help or changes? Reach out to support at{' '}
                  <Text style={styles.supportEmail}>catering@dataudipi.com</Text>
                </Text>
              </View>
            </>
          )}

          {/* Buttons */}
          <TouchableOpacity
            style={styles.viewOrderBtn}
            onPress={() => router.push({
              pathname: '/(main)/catering-order-details',
              params: {
                orderId: displayOrder.id.toString(),
                restaurantId: (params.restaurantId as string) || (displayOrder.restaurant_id ? displayOrder.restaurant_id.toString() : ''),
                restaurantName: (params.restaurantName as string) || ''
              }
            })}
          >
            <Text style={styles.viewOrderBtnText}>View Order Details</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.homeLink} onPress={() => router.replace('/(main)/home')}>
            <Text style={styles.homeLinkText}>Back to Home</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  banner: {
    backgroundColor: '#27ae60',
    alignItems: 'center',
    paddingTop: 40,
    paddingBottom: 40,
    paddingHorizontal: 24,
  },
  checkCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
  },
  bannerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 12,
    lineHeight: 28,
  },
  orderIdPill: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  orderIdText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  content: {
    padding: 16,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 18,
    marginBottom: 14,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#222',
    marginBottom: 14,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  rowLabel: {
    fontSize: 13,
    color: '#666',
  },
  rowValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#333',
  },
  balanceNote: {
    fontSize: 11,
    color: '#aaa',
    marginTop: 10,
    fontStyle: 'italic',
  },
  statusPill: {
    backgroundColor: '#e8f8ee',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#27ae60',
    textTransform: 'capitalize',
  },
  // Timeline
  timelineRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  timelineLeft: {
    alignItems: 'center',
    width: 26,
    marginRight: 14,
  },
  timelineDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#ddd',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineDotDone: {
    backgroundColor: '#27ae60',
    borderColor: '#27ae60',
  },
  timelineDotPending: {
    backgroundColor: '#ff4500',
    borderColor: '#ff4500',
  },
  timelineDotFuture: {
    backgroundColor: '#f0f0f0',
    borderColor: '#ddd',
  },
  timelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: '#eee',
    marginVertical: 3,
    minHeight: 24,
  },
  timelineLineDone: {
    backgroundColor: '#27ae60',
  },
  timelineContent: {
    flex: 1,
    paddingTop: 2,
    paddingBottom: 20,
  },
  timelineLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#888',
  },
  timelineLabelDone: {
    color: '#27ae60',
    fontWeight: '700',
  },
  timelineLabelPending: {
    color: '#ff4500',
    fontWeight: '700',
  },
  timelineLabelFuture: {
    color: '#ccc',
  },
  supportCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#fafafa',
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#eeeeee',
  },
  supportText: {
    fontSize: 12,
    color: '#888',
    flex: 1,
    lineHeight: 18,
  },
  supportEmail: {
    color: '#ff4500',
    fontWeight: '600',
  },
  viewOrderBtn: {
    backgroundColor: '#ff4500',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    marginBottom: 14,
    elevation: 2,
    shadowColor: '#ff4500',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  viewOrderBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    letterSpacing: 0.4,
  },
  homeLink: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  homeLinkText: {
    fontSize: 14,
    color: '#888',
    fontWeight: '600',
  },
});

