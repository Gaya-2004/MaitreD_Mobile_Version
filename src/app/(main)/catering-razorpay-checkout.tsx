import React, { useRef, useState } from 'react';
import {
  View, StyleSheet, Platform, StatusBar,
  ActivityIndicator, Text, TouchableOpacity, Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../store/useAuthStore';
import { API_BASE_URL } from '../../constants/api';

/**
 * Razorpay WebView Checkout for Catering Advance Payment.
 *
 * Expected params:
 *   sessionId, advanceAmount, totalAmount, packageName, eventName,
 *   customerName, customerEmail, customerPhone
 */
export default function CateringRazorpayCheckout() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const auth = useAuthStore();
  const webViewRef = useRef<WebView>(null);

  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);

  const sessionId = params.sessionId as string;
  const advanceAmount = parseFloat(params.advanceAmount as string || '0');
  const totalAmount = parseFloat(params.totalAmount as string || '0');
  const packageName = params.packageName as string;
  const eventName = params.eventName as string;

  const customerName = (params.customerName as string) || auth.customerName || 'Customer';
  const customerEmail = (params.customerEmail as string) || 'customer@example.com';
  const customerPhone = (params.customerPhone as string) || auth.phone || '9999999999';

  const RAZORPAY_KEY = process.env.EXPO_PUBLIC_RAZORPAY_KEY_ID || 'rzp_test_XXXXXXXXXXXXXXXX';
  const BASE_URL = API_BASE_URL;

  const authHeaders = {
    'Content-Type': 'application/json',
    ...(auth.token ? { Authorization: `Bearer ${auth.token}` } : {}),
  };

  // Amount in paise (Razorpay uses smallest currency unit)
  const amountInPaise = Math.round(advanceAmount * 100);

  // HTML page that embeds the Razorpay checkout.js
  const razorpayHTML = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, sans-serif;
      background: #f5f5f5;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 24px;
    }
    .card {
      background: white;
      border-radius: 16px;
      padding: 28px 24px;
      width: 100%;
      max-width: 420px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.08);
      text-align: center;
    }
    .rzp-logo { font-size: 22px; font-weight: 800; color: #3395FF; margin-bottom: 6px; }
    .merchant { font-size: 16px; font-weight: 700; color: #222; margin-bottom: 4px; }
    .amount { font-size: 32px; font-weight: 800; color: #1a1a2e; margin: 12px 0; }
    .desc { font-size: 13px; color: #888; margin-bottom: 24px; line-height: 1.5; }
    .pay-btn {
      width: 100%; padding: 16px; border-radius: 10px;
      background: #3395FF; color: white;
      font-size: 16px; font-weight: 700; border: none;
      cursor: pointer; letter-spacing: 0.3px;
    }
    .pay-btn:active { opacity: 0.85; }
    .secure { font-size: 12px; color: #aaa; margin-top: 14px; }
    .spinner {
      width: 40px; height: 40px; margin: 30px auto;
      border: 4px solid #eee; border-top: 4px solid #3395FF;
      border-radius: 50%; animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    #status { display: none; font-size: 14px; color: #555; margin-top: 16px; }
  </style>
</head>
<body>
  <div class="card" id="pay-card">
    <div class="rzp-logo">Razorpay</div>
    <div class="merchant">Data Udipi Catering</div>
    <div class="amount">&#8377;${advanceAmount.toLocaleString('en-IN')}</div>
    <div class="desc">
      Advance payment for catering order<br>
      <strong>${packageName}</strong>${eventName ? ' · ' + eventName : ''}
    </div>
    <button class="pay-btn" onclick="openRazorpay()">
      Pay &#8377;${advanceAmount.toLocaleString('en-IN')} Securely
    </button>
    <div class="secure">🔒 Secured by Razorpay</div>
    <div id="status"></div>
  </div>

  <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
  <script>
    function showStatus(msg) {
      document.getElementById('status').style.display = 'block';
      document.getElementById('status').innerText = msg;
    }

    function openRazorpay() {
      var options = {
        key: '${RAZORPAY_KEY}',
        amount: ${amountInPaise},
        currency: 'INR',
        name: 'Data Udipi Catering',
        description: 'Advance payment · ${packageName}',
        image: '',
        prefill: {
          name: '${customerName}',
          email: '${customerEmail}',
          contact: '${customerPhone}'
        },
        notes: {
          session_id: '${sessionId}',
          order_type: 'CATERING_ADVANCE'
        },
        theme: { color: '#ff4500' },
        modal: {
          ondismiss: function() {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'PAYMENT_CANCELLED' }));
          }
        },
        handler: function(response) {
          showStatus('Verifying payment...');
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'PAYMENT_SUCCESS',
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_order_id: response.razorpay_order_id || '',
            razorpay_signature: response.razorpay_signature || ''
          }));
        }
      };

      try {
        var rzp = new Razorpay(options);
        rzp.on('payment.failed', function(response) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'PAYMENT_FAILED',
            error: response.error.description || 'Payment failed'
          }));
        });
        rzp.open();
      } catch(e) {
        showStatus('Error loading Razorpay. Check your internet connection.');
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'PAYMENT_LOAD_ERROR', error: e.toString() }));
      }
    }

    // Auto-open after a short delay
    window.onload = function() { setTimeout(openRazorpay, 500); };
  </script>
</body>
</html>
  `;

  const handleWebViewMessage = async (event: any) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);

      if (msg.type === 'PAYMENT_CANCELLED') {
        router.back();
        return;
      }

      if (msg.type === 'PAYMENT_FAILED') {
        Alert.alert('Payment Failed', msg.error || 'Your payment was not completed.', [
          { text: 'Try Again', onPress: () => webViewRef.current?.reload() },
          { text: 'Cancel', onPress: () => router.back() },
        ]);
        return;
      }

      if (msg.type === 'PAYMENT_LOAD_ERROR') {
        Alert.alert('Error', 'Could not load Razorpay. Check your internet connection.');
        return;
      }

      if (msg.type === 'PAYMENT_SUCCESS') {
        setVerifying(true);
        try {
          // 1. Set session to PAYMENT_PENDING
          const startRes = await fetch(
            `${BASE_URL}/api/v1/public/catering/sessions/${sessionId}/payment`,
            { method: 'POST', headers: authHeaders }
          );
          if (!startRes.ok) {
            const err = await startRes.json().catch(() => ({}));
            throw new Error(err.detail || 'Failed to initiate payment');
          }

          // 2. Verify payment using the Razorpay payment_id as transaction_id
          const verifyRes = await fetch(
            `${BASE_URL}/api/v1/public/catering/sessions/${sessionId}/payment/verify`,
            {
              method: 'POST',
              headers: authHeaders,
              body: JSON.stringify({
                transaction_id: msg.razorpay_payment_id,
                amount: advanceAmount,
                payment_method: 'UPI',
              }),
            }
          );

          if (!verifyRes.ok) {
            const err = await verifyRes.json().catch(() => ({}));
            throw new Error(err.detail || 'Payment verification failed');
          }

          const orderData = await verifyRes.json();

          // 3. Navigate to success page
          router.replace({
            pathname: '/(main)/catering-order-success',
            params: {
              orderId: orderData.order_id?.toString() || '0',
              advanceAmount: advanceAmount.toString(),
              totalAmount: totalAmount.toString(),
              packageName,
              eventName,
            },
          });
        } catch (e: any) {
          setVerifying(false);
          Alert.alert(
            'Verification Failed',
            e.message || 'Payment received but verification failed. Contact support with payment ID: ' + msg.razorpay_payment_id
          );
        }
      }
    } catch {
      // ignore JSON parse errors from unrelated WebView messages
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Secure Payment</Text>
        <View style={styles.rzpBadge}>
          <Text style={styles.rzpBadgeText}>🔒 Razorpay</Text>
        </View>
      </View>

      {/* WebView */}
      <WebView
        ref={webViewRef}
        source={{ html: razorpayHTML }}
        style={styles.webView}
        onLoadStart={() => setLoading(true)}
        onLoadEnd={() => setLoading(false)}
        onMessage={handleWebViewMessage}
        javaScriptEnabled
        domStorageEnabled
        originWhitelist={['*']}
        mixedContentMode="always"
      />

      {/* Loading overlay */}
      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#3395FF" />
          <Text style={styles.loadingText}>Loading payment gateway...</Text>
        </View>
      )}

      {/* Verifying overlay */}
      {verifying && (
        <View style={styles.verifyingOverlay}>
          <View style={styles.verifyingCard}>
            <ActivityIndicator size="large" color="#ff4500" />
            <Text style={styles.verifyingTitle}>Verifying Payment</Text>
            <Text style={styles.verifyingSubtitle}>Please wait while we confirm your payment...</Text>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    elevation: 2,
  },
  backBtn: { marginRight: 12 },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: '#222' },
  rzpBadge: {
    backgroundColor: '#e8f1ff',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  rzpBadgeText: { fontSize: 12, fontWeight: '700', color: '#3395FF' },
  webView: { flex: 1 },
  loadingOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: { fontSize: 14, color: '#888', marginTop: 12 },
  verifyingOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifyingCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 36,
    alignItems: 'center',
    width: '80%',
    gap: 12,
  },
  verifyingTitle: { fontSize: 18, fontWeight: 'bold', color: '#222', marginTop: 12 },
  verifyingSubtitle: { fontSize: 13, color: '#888', textAlign: 'center', lineHeight: 18 },
});
