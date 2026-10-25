import { API_BASE_URL } from '../../constants/api';
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  SafeAreaView, Platform, StatusBar, ActivityIndicator, Alert
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useAuthStore } from '../../store/useAuthStore';
import { cateringOrderApi } from '../../services/apiService';
import { formatDateTime } from '../../utils/dateUtils';

export default function CateringOrderDetails() {
  const router = useRouter();
  const { orderId } = useLocalSearchParams();
  const auth = useAuthStore();
  
  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<any>(null);

  const fetchOrderDetails = async () => {
    try {
      const BASE_URL = API_BASE_URL;
      const res = await fetch(`${BASE_URL}/api/v1/public/catering/orders/${orderId}`, {
        headers: {
          'Content-Type': 'application/json',
          ...(auth.token ? { 'Authorization': `Bearer ${auth.token}` } : {})
        }
      });
      if (!res.ok) {
        throw new Error('Failed to load order details');
      }
      const data = await res.json();
      setOrder(data);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (orderId) fetchOrderDetails();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color="#ff4500" style={{ marginTop: 50 }} />
      </SafeAreaView>
    );
  }

  if (!order) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={{ textAlign: 'center', marginTop: 50 }}>Order not found.</Text>
      </SafeAreaView>
    );
  }

  const isOverdue = order.balance_amount > 0 && order.full_payment_due_date && new Date(order.full_payment_due_date) < new Date();

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Order #{order.id}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Status Card */}
        <View style={styles.card}>
          <View style={styles.statusRow}>
            <Text style={styles.label}>Order Status</Text>
            <Text style={[styles.statusVal, { color: '#4CAF50' }]}>{order.order_status}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.statusRow}>
            <Text style={styles.label}>Payment Status</Text>
            <Text style={[styles.statusVal, { color: order.payment_status === 'PAID' ? '#4CAF50' : '#ff9800' }]}>
              {order.payment_status}
            </Text>
          </View>
        </View>

        {/* Details Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Event Details</Text>
          
          <View style={styles.detailRow}>
            <MaterialIcons name="event" size={16} color="#666" style={styles.icon} />
            <Text style={styles.detailText}>{order.event_name || 'Event'} on {order.event_date}</Text>
          </View>
          <View style={styles.detailRow}>
            <MaterialIcons name="schedule" size={16} color="#666" style={styles.icon} />
            <Text style={styles.detailText}>{order.serving_time}</Text>
          </View>
          <View style={styles.detailRow}>
            <MaterialIcons name="group" size={16} color="#666" style={styles.icon} />
            <Text style={styles.detailText}>{order.guest_count} Guests</Text>
          </View>
          <View style={styles.detailRow}>
            <MaterialIcons name="restaurant-menu" size={16} color="#666" style={styles.icon} />
            <Text style={styles.detailText}>{order.package_name}</Text>
          </View>
        </View>

        {/* Customizations Card */}
        {order.customizations && order.customizations.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Customizations</Text>
            {order.customizations.map((cust: any) => (
              <View key={cust.id} style={styles.custItem}>
                <Text style={styles.custText}>
                  {cust.action_type === 'REPLACE' && `Swapped ${cust.original_item_name} → ${cust.new_item_name}`}
                  {cust.action_type === 'ADD' && `Added ${cust.new_item_name}`}
                  {cust.action_type === 'REMOVE' && `Removed ${cust.original_item_name}`}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Payments Breakdown */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Payment Breakdown</Text>
          
          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>Total Amount</Text>
            <Text style={styles.priceVal}>Rs. {order.total_amount}</Text>
          </View>
          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>Total Paid</Text>
            <Text style={[styles.priceVal, { color: '#4CAF50' }]}>Rs. {order.paid_amount}</Text>
          </View>
          <View style={[styles.priceRow, { borderTopWidth: 1, borderTopColor: '#eee', paddingTop: 10, marginTop: 5 }]}>
            <Text style={[styles.priceLabel, { fontWeight: 'bold', color: '#222' }]}>Balance Remaining</Text>
            <Text style={[styles.priceVal, { fontWeight: 'bold', color: '#ff4500' }]}>Rs. {order.balance_amount}</Text>
          </View>
          
          {order.balance_amount > 0 && order.full_payment_due_date && (
            <Text style={[styles.dueDateText, isOverdue && styles.overdueText]}>
              Full payment {isOverdue ? 'was due' : 'due'} by {new Date(order.full_payment_due_date).toLocaleDateString()}
            </Text>
          )}

          {order.balance_amount > 0 && (
            <TouchableOpacity 
              style={styles.payBalanceBtn}
              onPress={() => {
                router.push({
                  pathname: '/(main)/catering-balance-payment',
                  params: {
                    orderId: order.id,
                    balanceAmount: order.balance_amount
                  }
                });
              }}
            >
              <Text style={styles.payBalanceText}>PAY BALANCE</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Transaction History */}
        {order.payments && order.payments.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Payment History</Text>
            {order.payments.map((p: any) => (
              <View key={p.id} style={styles.paymentHistRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.payHistType}>{p.payment_type} ({p.payment_method})</Text>
                  <Text style={styles.payHistId}>Txn: {p.transaction_id}</Text>
                  {p.created_at && <Text style={styles.payHistDate}>{formatDateTime(p.created_at)}</Text>}
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.payHistAmt}>Rs. {p.amount}</Text>
                  <Text style={[styles.payHistStatus, { color: p.payment_status === 'SUCCESS' ? '#4CAF50' : '#f44336' }]}>
                    {p.payment_status}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5', paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 },
  header: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#eee' },
  backBtn: { marginRight: 16 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  scrollContent: { padding: 16, paddingBottom: 40 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 16, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 3 },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  divider: { height: 1, backgroundColor: '#eee', marginVertical: 4 },
  label: { fontSize: 14, color: '#666', fontWeight: '500' },
  statusVal: { fontSize: 14, fontWeight: 'bold' },
  cardTitle: { fontSize: 16, fontWeight: 'bold', color: '#333', marginBottom: 12 },
  detailRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  icon: { marginRight: 10, width: 20 },
  detailText: { fontSize: 14, color: '#444', flex: 1 },
  custItem: { paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#f9f9f9' },
  custText: { fontSize: 13, color: '#555' },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  priceLabel: { fontSize: 14, color: '#555' },
  priceVal: { fontSize: 14, color: '#333' },
  dueDateText: { marginTop: 12, fontSize: 13, color: '#888', fontStyle: 'italic', textAlign: 'center' },
  overdueText: { color: '#f44336', fontWeight: 'bold' },
  payBalanceBtn: { marginTop: 16, backgroundColor: '#ff4500', paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  payBalanceText: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  paymentHistRow: { flexDirection: 'row', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  payHistType: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 2 },
  payHistId: { fontSize: 11, color: '#888', marginBottom: 2 },
  payHistDate: { fontSize: 11, color: '#aaa' },
  payHistAmt: { fontSize: 14, fontWeight: 'bold', color: '#333', marginBottom: 4 },
  payHistStatus: { fontSize: 12, fontWeight: '600' }
});

