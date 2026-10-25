import { API_BASE_URL } from '../../constants/api';
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Platform, StatusBar, ActivityIndicator, Alert, TextInput, Modal
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets, SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../store/useAuthStore';

type PaymentMethod = 'upi' | 'card' | 'cash';
type UpiOption = 'gpay' | 'other';

export default function BalancePayment() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const auth = useAuthStore();

  const orderId = params.orderId as string;
  const packageName = params.packageName as string || 'Catering Package';
  const balanceAmount = parseFloat(params.balanceAmount as string || '0');

  const [paymentAmount, setPaymentAmount] = useState(balanceAmount.toString());

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('upi');
  const [upiOption, setUpiOption] = useState<UpiOption>('gpay');
  const [termsAccepted, setTermsAccepted] = useState(true);
  const [paying, setPaying] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertConfig, setAlertConfig] = useState({ title: '', message: '' });

  const showAlert = (title: string, message: string) => {
    setAlertConfig({ title, message });
    setAlertVisible(true);
  };

  const BASE_URL = API_BASE_URL;
  const authHeaders = {
    'Content-Type': 'application/json',
    ...(auth.token ? { 'Authorization': `Bearer ${auth.token}` } : {})
  };

  const customerName = auth.customerName || 'Customer';
  const customerPhone = auth.phone || '';

  const fmt = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  const parsedPaymentAmount = parseFloat(paymentAmount) || 0;

  const handlePaymentVerification = async (paymentId: string, razorpayOrderId: string, signature: string) => {
    setVerifying(true);
    try {
      const verifyRes = await fetch(`${BASE_URL}/api/v1/public/catering/orders/${orderId}/balance-payment/verify`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          amount: parsedPaymentAmount,
          razorpay_payment_id: paymentId,
          razorpay_order_id: razorpayOrderId,
          razorpay_signature: signature,
          payment_method: paymentMethod === 'cash' ? 'CASH' : (paymentMethod === 'upi' ? 'UPI' : 'CARD')
        })
      });

      if (!verifyRes.ok) {
        const err = await verifyRes.json().catch(() => ({}));
        throw new Error(err.detail || 'Payment verification failed');
      }

      await verifyRes.json();
      router.setParams({ razorpay_status: undefined });

      showAlert('Payment Successful', `Balance of Rs. ${fmt(parsedPaymentAmount)} paid successfully!`);
      setTimeout(() => {
          setAlertVisible(false);
          router.replace('/(order)/orders');
      }, 2000);
    } catch (e: any) {
      showAlert('Verification Failed', e.message || 'Payment received but verification failed.');
    } finally {
      setVerifying(false);
    }
  };

  useEffect(() => {
    if (params.razorpay_status === 'success' && params.razorpay_payment_id && params.razorpay_order_id && params.razorpay_signature) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      handlePaymentVerification(
        params.razorpay_payment_id as string,
        params.razorpay_order_id as string,
        params.razorpay_signature as string
      );
    } else if (params.razorpay_status === 'failed') {
      setTimeout(() => {
        showAlert('Payment Failed', (params.razorpay_reason as string) || 'The payment could not be processed.');
      }, 0);
      router.setParams({ razorpay_status: undefined });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.razorpay_status]);

  const handlePay = async () => {
    if (!termsAccepted) {
      showAlert('Terms Required', 'Please accept the Terms & Cancellation Policy to proceed.');
      return;
    }
    if (parsedPaymentAmount > balanceAmount) {
      showAlert('Invalid Amount', `Payment amount cannot exceed pending balance Rs. ${fmt(balanceAmount)}`);
      return;
    }

    if (paymentMethod === 'cash') {
      handlePaymentVerification(`test_cash_${Date.now()}`, `test_order_${Date.now()}`, 'test_signature');
      return;
    }

    setPaying(true);
    try {
      const startRes = await fetch(`${BASE_URL}/api/v1/public/catering/orders/${orderId}/balance-payment`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          payment_amount: parsedPaymentAmount
        })
      });
      
      if (!startRes.ok) {
        const err = await startRes.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to initiate payment');
      }
      
      const startData = await startRes.json();

      router.push({
        pathname: '/(checkout)/razorpay-screen',
        params: {
          amount: parsedPaymentAmount.toString(),
          phone: customerPhone,
          orderType: 'Catering',
          paymentMethodId: paymentMethod,
          razorpayOrderId: startData.razorpay_order_id,
          returnPath: '/(main)/catering-balance-payment',
          returnParams: JSON.stringify({
            orderId,
            packageName,
            balanceAmount: parsedPaymentAmount.toString()
          })
        }
      });
    } catch (e: any) {
      showAlert('Payment Failed', e.message || 'Something went wrong. Please try again.');
    } finally {
      setPaying(false);
    }
  };


  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      {/* Custom Modal for Alerts */}
      <Modal visible={alertVisible} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 24, width: '80%', alignItems: 'center' }}>
            <Ionicons name="warning-outline" size={48} color="#ff4500" style={{ marginBottom: 12 }} />
            <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#333', marginBottom: 8, textAlign: 'center' }}>{alertConfig.title}</Text>
            <Text style={{ fontSize: 14, color: '#666', textAlign: 'center', marginBottom: 20 }}>{alertConfig.message}</Text>
            <TouchableOpacity 
              style={{ backgroundColor: '#ff4500', paddingVertical: 12, paddingHorizontal: 30, borderRadius: 8, width: '100%', alignItems: 'center' }}
              onPress={() => setAlertVisible(false)}
            >
              <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#000" />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.stepText}>PAY BALANCE</Text>
          <Text style={styles.headerTitle}>Balance Payment</Text>
        </View>
        <MaterialCommunityIcons name="leaf" size={24} color="#8bc34a" />
      </View>

      {/* Progress */}
      <View style={styles.progressBar}>
        <View style={[styles.progressSeg, styles.progressActive]} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>

        {/* Amount Due Box */}
        <View style={styles.amountCard}>
          <Text style={styles.amountLabel}>Pending Balance for {packageName}</Text>
          <View style={styles.inputContainer}>
            <Text style={styles.currencyPrefix}>Rs.</Text>
            <TextInput
              style={styles.amountInput}
              keyboardType="numeric"
              value={paymentAmount}
              editable={false}
            />
          </View>
          <Text style={styles.estimatedTotal}>Total amount to clear the balance.</Text>
        </View>

        {/* UPI Options */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Select Payment Option</Text>

          <TouchableOpacity
            style={[styles.payOptionCard, paymentMethod === 'cash' && styles.payOptionSelected]}
            onPress={() => setPaymentMethod('cash')}
          >
            <View style={[styles.radioOuter, paymentMethod === 'cash' && styles.radioOuterSelected]}>
              {paymentMethod === 'cash' && <View style={styles.radioInner} />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.payOptionTitle}>Cash / Manual (Test)</Text>
              <Text style={styles.payOptionSub}>Will bypass Razorpay and mark as Paid</Text>
            </View>
            <Ionicons name="cash-outline" size={24} color="#8bc34a" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.payOptionCard, paymentMethod === 'upi' && upiOption === 'gpay' && styles.payOptionSelected]}
            onPress={() => { setPaymentMethod('upi'); setUpiOption('gpay'); }}
          >
            <View style={[styles.radioOuter, paymentMethod === 'upi' && upiOption === 'gpay' && styles.radioOuterSelected]}>
              {paymentMethod === 'upi' && upiOption === 'gpay' && <View style={styles.radioInner} />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.payOptionTitle}>Google Pay / PhonePe</Text>
              <Text style={styles.payOptionSub}>Instant bank verification & setup</Text>
            </View>
            <View style={styles.upiIconRow}>
              <View style={styles.upiIcon}><Text style={{ fontSize: 9, fontWeight: 'bold', color: '#4285F4' }}>G</Text></View>
              <View style={[styles.upiIcon, { backgroundColor: '#5F259F' }]}><Text style={{ fontSize: 8, fontWeight: 'bold', color: '#fff' }}>PP</Text></View>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.payOptionCard, paymentMethod === 'card' && styles.payOptionSelected]}
            onPress={() => setPaymentMethod('card')}
          >
            <View style={[styles.radioOuter, paymentMethod === 'card' && styles.radioOuterSelected]}>
              {paymentMethod === 'card' && <View style={styles.radioInner} />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.payOptionTitle}>Credit or Debit Card</Text>
            </View>
            <Ionicons name="card-outline" size={22} color="#666" />
          </TouchableOpacity>
        </View>

        {/* Billing Contact */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Billing Contact</Text>
          <View style={styles.billingCard}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarText}>{customerName.charAt(0).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.billingName}>{customerName}</Text>
              {customerPhone ? <Text style={styles.billingPhone}>{customerPhone}</Text> : null}
            </View>
          </View>
        </View>

        {/* Terms */}
        <TouchableOpacity style={styles.termsRow} onPress={() => setTermsAccepted(!termsAccepted)}>
          <View style={[styles.checkbox, termsAccepted && styles.checkboxChecked]}>
            {termsAccepted && <Ionicons name="checkmark" size={14} color="#fff" />}
          </View>
          <Text style={styles.termsText}>I agree to the <Text style={styles.termsLink}>Bulk Catering Terms & Cancellation Policy</Text></Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Pay Button */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom > 0 ? insets.bottom + 10 : 20 }]}>
        <TouchableOpacity
          style={[styles.payBtn, (!termsAccepted || paying) && { opacity: 0.6 }]}
          onPress={handlePay}
          disabled={!termsAccepted || paying}
        >
          {(paying || verifying) ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.payBtnText}>Pay Rs. {fmt(parsedPaymentAmount)} Securely</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5', paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 15, backgroundColor: '#fff' },
  backBtn: { marginRight: 15 },
  headerText: { flex: 1 },
  stepText: { fontSize: 10, fontWeight: '700', color: '#ff4500', letterSpacing: 1 },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#333', marginTop: 2 },
  progressBar: { flexDirection: 'row', paddingHorizontal: 20, paddingBottom: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  progressSeg: { flex: 1, height: 4, backgroundColor: '#f0f0f0', borderRadius: 2, marginHorizontal: 2 },
  progressActive: { backgroundColor: '#ff4500' },
  amountCard: {
    backgroundColor: '#fff', margin: 16, borderRadius: 16, padding: 24,
    alignItems: 'center', elevation: 2,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6,
  },
  amountLabel: { fontSize: 13, color: '#888', marginBottom: 8 },
  inputContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 6, borderBottomWidth: 1, borderBottomColor: '#eee', paddingBottom: 4 },
  currencyPrefix: { fontSize: 28, fontWeight: 'bold', color: '#2ecc71', marginRight: 4 },
  amountInput: { fontSize: 36, fontWeight: 'bold', color: '#2ecc71', padding: 0, minWidth: 100 },
  estimatedTotal: { fontSize: 12, color: '#aaa', marginTop: 8 },
  section: { paddingHorizontal: 16, marginTop: 20 },
  sectionTitle: { fontSize: 14, fontWeight: 'bold', color: '#555', marginBottom: 12, letterSpacing: 0.3 },
  payOptionCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    borderRadius: 12, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: '#eee',
    elevation: 1,
  },
  payOptionSelected: { borderColor: '#ff4500', borderWidth: 1.5 },
  radioOuter: {
    width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#ccc',
    alignItems: 'center', justifyContent: 'center', marginRight: 14,
  },
  radioOuterSelected: { borderColor: '#ff4500' },
  radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#ff4500' },
  payOptionTitle: { fontSize: 14, fontWeight: '600', color: '#333' },
  payOptionSub: { fontSize: 12, color: '#888', marginTop: 2 },
  upiIconRow: { flexDirection: 'row', gap: 4 },
  upiIcon: {
    width: 26, height: 26, borderRadius: 13, backgroundColor: '#fff',
    borderWidth: 1, borderColor: '#eee', alignItems: 'center', justifyContent: 'center',
  },
  billingCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#eee'
  },
  avatarCircle: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: '#ff4500',
    alignItems: 'center', justifyContent: 'center', marginRight: 14
  },
  avatarText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  billingName: { fontSize: 15, fontWeight: 'bold', color: '#222' },
  billingPhone: { fontSize: 12, color: '#888', marginTop: 2 },
  termsRow: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 16, marginTop: 20, marginBottom: 10 },
  checkbox: {
    width: 20, height: 20, borderRadius: 4, borderWidth: 1.5, borderColor: '#ccc',
    marginRight: 12, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', marginTop: 2
  },
  checkboxChecked: { backgroundColor: '#ff4500', borderColor: '#ff4500' },
  termsText: { fontSize: 13, color: '#555', flex: 1, lineHeight: 19 },
  termsLink: { color: '#ff4500', fontWeight: '600' },
  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#fff',
    padding: 20, borderTopWidth: 1, borderTopColor: '#eee', elevation: 8
  },
  payBtn: { backgroundColor: '#ff4500', paddingVertical: 17, borderRadius: 14, alignItems: 'center' },
  payBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold', letterSpacing: 0.5 },
});

