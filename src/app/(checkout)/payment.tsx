import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Platform, StatusBar, Alert, Modal } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../../constants/api';
import { orderApi, dineInSessionApi } from '../../services/apiService';
import {
  useAuthStore,
  useAddressStore,
  useCartStore,
  useOrderStore,
  useRestaurantStore,
  usePaymentMethodStore,
  usePaymentStore,
  useLiveOrderStore,
  useDineInSessionStore
} from '../../store';
import { resolveOutletLocation, getDistanceInKm, calculateDeliveryFee } from '../../utils/deliveryArea';

WebBrowser.maybeCompleteAuthSession();

type PaymentMethod = 'UPI' | 'Pay at Counter' | 'Cash' | 'Card' | 'Wallet';

export default function PaymentScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const tipAmount = params.tipAmount ? Number(params.tipAmount) : 0;

  const isDineInSettlement = params.isDineInSettlement === 'true';
  const settlementOrderId = (params.orderId as string) || '';
  const settlementDbOrderId = (params.dbOrderId as string) || '';
  const settlementTable = (params.tableNumber as string) || '';
  const settlementTotal = params.totalAmount ? Number(params.totalAmount) : 0;
  const settlementCartItems = React.useMemo(() => {
    if (params.cartItems) {
      try {
        return typeof params.cartItems === 'string' ? JSON.parse(params.cartItems) : params.cartItems;
      } catch (_) {}
    }
    return [];
  }, [params.cartItems]);

  const { items, orderType, tableNumber, getSubtotal, getGst, getServiceCharge, getGrandTotal, clearCart, getItemCount, getDiscountAmount, discountCode } = useCartStore();

  React.useEffect(() => {
    if (isDineInSettlement) return;
    if (getItemCount() === 0) {
      router.replace('/home');
    }
  }, [getItemCount, router, isDineInSettlement]);

  const effectiveTable = isDineInSettlement && settlementTable ? settlementTable : (tableNumber || 'T-01');
  const { selectedOutlet } = useRestaurantStore();
  const { phone } = useAuthStore();
  const { setPaymentMethod, setPaymentSuccess, setPaymentFailed } = usePaymentStore();
  const { setLiveOrder } = useLiveOrderStore();
  const { setCurrentOrder, addPastOrder } = useOrderStore();
  const { selectedDeliveryAddress, addresses, selectedAddressId } = useAddressStore();

  // Take Away and Delivery are digital-only (online payment only, no Cash on Delivery)
  const isDigitalOnly = orderType === 'Take Away' || orderType === 'Delivery';
  const [selectedMethodRaw, setSelectedMethod] = useState<PaymentMethod>(
    isDineInSettlement || orderType === 'Dine In' ? 'Pay at Counter' : 'UPI'
  );
  const selectedMethod: PaymentMethod = isDigitalOnly ? 'UPI' : selectedMethodRaw;
  const [loading, setLoading] = useState(false);
  const [isPollingCash, setIsPollingCash] = useState(false);
  const [paymentFailedReason, setPaymentFailedReason] = useState('');
  const pollIntervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const [currentDbOrderId, setCurrentDbOrderId] = useState<string | null>(null);

  const subtotal = getSubtotal();
  const discountAmount = getDiscountAmount();

  const gst = getGst();
  const serviceCharge = getServiceCharge();

  const passedDeliveryFee = params.deliveryFee ? parseFloat(params.deliveryFee as string) : null;
  const currentAddressObj = addresses.find(a => a.id == selectedAddressId) || addresses[0];
  const targetOutletLoc = resolveOutletLocation(selectedOutlet);
  const currentDistanceKm = (currentAddressObj?.latitude && currentAddressObj?.longitude)
    ? getDistanceInKm(currentAddressObj.latitude, currentAddressObj.longitude, targetOutletLoc)
    : null;
  const deliveryFee = (passedDeliveryFee != null && !isNaN(passedDeliveryFee))
    ? passedDeliveryFee
    : (orderType === 'Delivery' ? calculateDeliveryFee(currentDistanceKm) : 0);

  let totalVal = getGrandTotal();
  let baseDeliveryTotal = 0;
  if (orderType === 'Delivery') {
    const packagingCharges = 0;
    baseDeliveryTotal = subtotal + deliveryFee + packagingCharges + gst - discountAmount;
    totalVal = baseDeliveryTotal + tipAmount;
  }

  const effectiveTotalVal = isDineInSettlement && settlementTotal > 0 ? settlementTotal : totalVal;

  const userPhone = phone || '+919876543210';

  // Handle Razorpay return params
  const razorpayStatus = params.razorpay_status as string | undefined;
  const razorpayPaymentId = params.razorpay_payment_id as string | undefined;
  const razorpayReason = params.razorpay_reason as string | undefined;

  React.useEffect(() => {
    if (!razorpayStatus) return;

    const processRazorpayReturn = async () => {
      if (razorpayStatus === 'success' && razorpayPaymentId) {
        setLoading(true);
        let restId = 1;
        if (selectedOutlet?.restaurant_id) {
          restId = Number(selectedOutlet.restaurant_id);
        }
        const formattedCart = Object.values(items).map(item => ({
          id: Number(item.id || (item as any).menu_item_id),
          name: item.name, image: item.image,
          quantity: Number(item.quantity || 1), price: Number(item.price || 0),
          title: item.name, itemName: item.name, image_url: item.image,
          note: item.note || ''
        }));
        let backendOrderType = 'DINE_IN';
        if (orderType === 'Take Away') backendOrderType = 'TAKEAWAY';
        if (orderType === 'Delivery') backendOrderType = 'DELIVERY';

        const { selectedDeliveryAddress, selectedAddressId, addresses } = useAddressStore.getState();
        const selectedAddressObj = addresses.find(a => a.id == selectedAddressId) || addresses[0];
        const deliverySnapshot = selectedAddressObj ? {
          full_address: selectedDeliveryAddress || selectedAddressObj.full_address || selectedAddressObj.address,
          latitude: selectedAddressObj.latitude,
          longitude: selectedAddressObj.longitude,
          flat_house_no: selectedAddressObj.flat_house_no,
          landmark: selectedAddressObj.landmark,
          contact_name: selectedAddressObj.contact_name,
          contact_phone: selectedAddressObj.contact_phone || userPhone,
          delivery_instructions: selectedAddressObj.delivery_instructions || (params.instructions as string) || ''
        } : (selectedDeliveryAddress ? {
          full_address: selectedDeliveryAddress,
          contact_phone: userPhone,
        } : null);

        const orderData = {
          restaurant_id: restId,
          table_number: orderType === 'Dine In' ? (tableNumber || 'T-06') : null,
          order_type: backendOrderType,
          delivery_address: selectedDeliveryAddress || (selectedAddressObj ? selectedAddressObj.full_address : null),
          delivery_address_id: selectedAddressId ? Number(selectedAddressId) : (selectedAddressObj && !isNaN(Number(selectedAddressObj.id)) ? Number(selectedAddressObj.id) : null),
          delivery_address_snapshot: deliverySnapshot,
          customer_latitude: selectedAddressObj?.latitude,
          customer_longitude: selectedAddressObj?.longitude,
          delivery_instructions: (params.instructions as string) || selectedAddressObj?.delivery_instructions || null,
          delivery_fee: orderType === 'Delivery' ? deliveryFee : 0,
          packaging_fee: 0,
          tip_amount: tipAmount,
          payment_method: selectedMethod,
          phone: userPhone,
          cart: formattedCart,
          subtotal, gst, service_charge: serviceCharge,
          discount_amount: discountAmount,
          discount_code: discountCode || null,
          total_amount: totalVal
        };
        let generatedOrderId = `ORD-${Math.floor(100000 + Math.random() * 900000)}`;
        let dbOrderId = '';
        try {
          const resultData = await orderApi.createOrder(orderData);
          if (resultData.success && resultData.orderId) {
            generatedOrderId = resultData.orderId;
            if (resultData.dbOrderId) dbOrderId = resultData.dbOrderId.toString();
          }
        } catch (e) {
          console.error('Failed to post order after Razorpay success', e);
        }
        setLoading(false);
        setPaymentSuccess(razorpayPaymentId);
        const finalOrder = {
          orderId: generatedOrderId, dbOrderId, total: totalVal,
          paymentMethod: selectedMethod, phone: userPhone, tableNumber,
          itemCount: getItemCount().toString(),
          cart: JSON.stringify(formattedCart), orderType,
          subtotal, discountAmount, discountCode
        };
        setCurrentOrder(finalOrder);
        addPastOrder({ 
          orderId: generatedOrderId, 
          dbOrderId, 
          date: new Date().toISOString(), 
          total: totalVal, 
          itemsCount: getItemCount(), 
          status: 'Preparing',
          customer_phone: userPhone || '',
          order_type: orderType,
        });
        setLiveOrder(orderType, generatedOrderId, dbOrderId, 'Preparing');
        clearCart();
        if (orderType === 'Delivery') {
          router.push({ pathname: '/delivery-success', params: finalOrder });
        } else {
          router.push({ pathname: '/order-success', params: finalOrder });
        }
      } else if (razorpayStatus === 'failed') {
        setPaymentFailedReason(razorpayReason || 'Payment failed');
        setPaymentFailed();
        if (Platform.OS !== 'web') {
          Alert.alert('Payment Failed', razorpayReason || 'The payment transaction could not be processed.');
        } else {
          alert('Payment Failed: ' + (razorpayReason || 'The payment transaction could not be processed.'));
        }
      }
    };
    processRazorpayReturn();
  }, [razorpayStatus]);

  const handleConfirm = async () => {
    setLoading(true);
    setPaymentMethod(selectedMethod as any);

    let restId = 1;
    if (selectedOutlet?.restaurant_id) {
      restId = Number(selectedOutlet.restaurant_id);
    }

    const formattedCartItems = Object.values(items).map(item => ({
      id: item.id,
      name: item.name,
      image: item.image,
      quantity: item.quantity,
      price: item.price,
      title: item.name,
      itemName: item.name,
      image_url: item.image,
      note: item.note || ''
    }));

    // If digital payment is selected, navigate to Razorpay WebView screen
    if (selectedMethod === 'UPI' || selectedMethod === 'Card' || selectedMethod === 'Wallet') {
      if (Platform.OS === 'web') {
        const RAZORPAY_KEY = 'rzp_live_T4wysiHzIDwFA1';
        const amountInPaise = Math.round(totalVal * 100);
        const script = document.createElement('script');
        script.src = 'https://checkout.razorpay.com/v1/checkout.js';
        script.onload = () => {
          const { paymentMethods, selectedMethodId } = usePaymentMethodStore.getState();
          const selectedPaymentItem = paymentMethods.find(m => m.id === selectedMethodId);
          let prefillMethod = undefined;
          let prefillUpi = undefined;
          let prefillWallet = undefined;
          if (selectedPaymentItem) {
            if (selectedPaymentItem.category === 'upi') { prefillMethod = 'upi'; prefillUpi = { vpa: selectedPaymentItem.subtitle }; }
            else if (selectedPaymentItem.category === 'wallet') { prefillMethod = 'wallet'; prefillWallet = selectedPaymentItem.badgeType.toLowerCase(); }
            else if (selectedPaymentItem.category === 'card') { prefillMethod = 'card'; }
          }
          
          const options = {
            key: RAZORPAY_KEY,
            amount: amountInPaise,
            currency: 'INR',
            name: 'Udupi Restaurant',
            description: `${orderType || 'Food'} Order Payment`,
            prefill: {
              contact: userPhone || '+919876543210',
              ...(prefillMethod ? { method: prefillMethod } : {}),
              ...(prefillUpi ? { upi: prefillUpi } : {}),
              ...(prefillWallet ? { wallet: prefillWallet } : {})
            },
            theme: { color: '#ff3400' },
            handler: function (response: any) {
              // Direct success callback for Web
              router.replace({
                pathname: '/(checkout)/payment',
                params: {
                  razorpay_status: 'success',
                  razorpay_payment_id: response.razorpay_payment_id,
                }
              });
            },
            modal: {
              ondismiss: function () {
                setLoading(false);
              }
            }
          };
          try {
            const rzp = new (window as any).Razorpay(options);
            rzp.on('payment.failed', function (response: any) {
              setLoading(false);
              router.replace({
                pathname: '/(checkout)/payment',
                params: {
                  razorpay_status: 'failed',
                  razorpay_reason: response.error.description || 'Payment failed',
                }
              });
            });
            rzp.open();
          } catch (e: any) {
            setLoading(false);
            console.error('Razorpay initialization failed', e);
            alert('Failed to load Razorpay.');
          }
        };
        script.onerror = () => {
          setLoading(false);
          alert('Failed to load Razorpay script.');
        };
        document.body.appendChild(script);
        return;
      }

      setLoading(false);
      const { selectedMethodId, paymentMethods } = usePaymentMethodStore.getState();
      let methodIdToPass = selectedMethodId || '';
      if (!methodIdToPass) {
        const savedCard = paymentMethods.find(m => m.category === 'card');
        if (savedCard) methodIdToPass = savedCard.id;
      }
      router.push({
        pathname: '/(checkout)/razorpay-screen',
        params: {
          amount: effectiveTotalVal.toFixed(2),
          phone: userPhone,
          orderType: orderType || 'Dine In',
          paymentMethodId: methodIdToPass,
          isDineInSettlement: isDineInSettlement ? 'true' : 'false',
          orderId: settlementOrderId,
          dbOrderId: settlementDbOrderId,
        }
      });
      return;
    }

    // Pay at Counter / Cash Flow
    if (selectedMethod === 'Pay at Counter' || selectedMethod === 'Cash') {
      try {
        let finalOrderId = settlementOrderId;
        let finalDbId = settlementDbOrderId;
        let finalItems = settlementCartItems;
        let finalTable = effectiveTable;
        let finalAmount = effectiveTotalVal;

        if (isDineInSettlement) {
          const sessionStore = useDineInSessionStore.getState();
          if (sessionStore.orderRounds && sessionStore.orderRounds.length > 0) {
            const allRoundItems = sessionStore.orderRounds
              .filter((r: any) => (r.status || '').toUpperCase() !== 'CANCELLED')
              .flatMap((r: any) => r.items || []);
            if (allRoundItems.length > 0) {
              finalItems = allRoundItems;
            }
          }
          const targetSessionId = sessionStore.sessionDbId || sessionStore.sessionUid || (params.sessionId as string) || (params.sessionUid as string);
          const restId = selectedOutlet?.id || 1;

          if (targetSessionId) {
            try {
              const sessionRes = await dineInSessionApi.settleSession(targetSessionId, restId, {
                payment_method: 'Pay at Counter',
                amount_paid: effectiveTotalVal,
              });
              if (sessionRes && sessionRes.totalAmount) {
                finalAmount = sessionRes.totalAmount;
              }
            } catch (sessErr) {
              console.warn('Session settle error, falling back to order settle:', sessErr);
            }
          }

          const targetSettleId = settlementDbOrderId || 
            (settlementOrderId ? settlementOrderId.replace(/\D/g, '') : '') || 
            (sessionStore.activeDbOrderId ? String(sessionStore.activeDbOrderId) : '');

          if (targetSettleId) {
            try {
              const res = await orderApi.settleDineInPayment(targetSettleId, {
                payment_method: 'Pay at Counter',
                amount_paid: effectiveTotalVal,
              });
              if (res) {
                if (res.orderId) finalOrderId = res.orderId;
                if (res.dbOrderId) finalDbId = String(res.dbOrderId);
                if (res.items && res.items.length > 0) finalItems = res.items;
                if (res.totalAmount) finalAmount = res.totalAmount;
                if (res.tableNumber) finalTable = res.tableNumber;
              }
            } catch (settleErr) {
              console.warn('Backend settle call error:', settleErr);
            }
          }
          useDineInSessionStore.getState().completeDineInSession();
        } else {
          // New Dine In or Takeaway order placed with Pay at Counter
          let backendOrderType = 'DINE_IN';
          if (orderType === 'Take Away') backendOrderType = 'TAKEAWAY';
          if (orderType === 'Delivery') backendOrderType = 'DELIVERY';

          const { selectedDeliveryAddress, selectedAddressId, addresses } = useAddressStore.getState();
          const selectedAddressObj = addresses.find(a => a.id == selectedAddressId) || addresses[0];
          const deliverySnapshot = selectedAddressObj ? {
            full_address: selectedDeliveryAddress || selectedAddressObj.full_address || selectedAddressObj.address,
            latitude: selectedAddressObj.latitude,
            longitude: selectedAddressObj.longitude,
            flat_house_no: selectedAddressObj.flat_house_no,
            landmark: selectedAddressObj.landmark,
            contact_name: selectedAddressObj.contact_name,
            contact_phone: selectedAddressObj.contact_phone || userPhone,
            delivery_instructions: selectedAddressObj.delivery_instructions || (params.instructions as string) || ''
          } : (selectedDeliveryAddress ? {
            full_address: selectedDeliveryAddress,
            contact_phone: userPhone,
          } : null);

          const formattedCartItems = Object.values(items).map(item => ({
            id: Number(item.id || (item as any).menu_item_id),
            quantity: Number(item.quantity || 1),
            price: Number(item.price || 0),
            name: item.name,
            image: item.image,
          }));

          const orderData = {
            restaurant_id: restId,
            table_number: orderType === 'Dine In' ? (tableNumber || 'T-06') : null,
            order_type: backendOrderType,
            delivery_address: selectedDeliveryAddress || (selectedAddressObj ? selectedAddressObj.full_address : null),
            delivery_address_id: (() => {
              const raw = Number(selectedAddressId || selectedAddressObj?.id);
              return (!isNaN(raw) && raw > 0 && raw < 2147483647) ? Math.floor(raw) : null;
            })(),
            delivery_address_snapshot: deliverySnapshot,
            customer_latitude: selectedAddressObj?.latitude,
            customer_longitude: selectedAddressObj?.longitude,
            delivery_instructions: (params.instructions as string) || selectedAddressObj?.delivery_instructions || null,
            delivery_fee: orderType === 'Delivery' ? deliveryFee : 0,
            packaging_fee: 0,
            tip_amount: tipAmount,
            payment_method: selectedMethod || 'Cash',
            phone: userPhone,
            cart: formattedCartItems,
            subtotal: subtotal,
            gst: gst,
            service_charge: serviceCharge,
            discount_amount: discountAmount,
            discount_code: discountCode || null,
            total_amount: effectiveTotalVal,
          };

          const result = await orderApi.createOrder(orderData);
          if (result && result.orderId) {
            finalOrderId = result.orderId;
            if (result.dbOrderId) {
              finalDbId = String(result.dbOrderId);
            }
          }
          finalItems = formattedCartItems;
        }

        const isDineIn = (orderType || 'Dine In') === 'Dine In';

        // Record order in order history store
        useOrderStore.getState().addPastOrder({
          orderId: finalOrderId || `ORD-${String(finalDbId).padStart(6, '0')}`,
          dbOrderId: String(finalDbId || ''),
          date: new Date().toISOString(),
          total: Number(finalAmount),
          itemsCount: Array.isArray(finalItems) ? finalItems.length : 1,
          status: isDineIn ? 'SERVED' : 'Preparing',
          payment_status: isDineIn ? 'Paid' : (orderType === 'Delivery' && selectedMethod === 'Cash' ? 'Pending' : 'Paid'),
          table_number: isDineIn ? finalTable : (orderType === 'Delivery' ? 'Delivery' : 'Take Away'),
          order_type: orderType || 'Dine In',
          customer_phone: userPhone || '',
          items: finalItems,
        });

        clearCart();
        setLoading(false);

        if (isDineIn) {
          // Immediately navigate to thank you / order served screen with invoice download!
          router.replace({
            pathname: '/order-completed',
            params: {
              // eslint-disable-next-line react-hooks/purity
              orderId: finalOrderId || `ORD-${Math.floor(100000 + Math.random() * 900000)}`,
              dbOrderId: finalDbId || '',
              tableNumber: finalTable,
              totalAmount: String(finalAmount),
              paymentMethod: selectedMethod,
              cartItems: JSON.stringify(finalItems),
              orderType: 'Dine In',
              date: new Date().toISOString(),
            },
          });
        } else if (orderType === 'Delivery') {
          useLiveOrderStore.getState().setLiveOrder('Delivery', finalOrderId || '', String(finalDbId || ''), 'Preparing');
          const finalOrder = {
            orderId: finalOrderId,
            dbOrderId: finalDbId,
            total: finalAmount,
            paymentMethod: selectedMethod,
            phone: userPhone,
            itemCount: Array.isArray(finalItems) ? finalItems.length.toString() : '1',
            cart: JSON.stringify(finalItems),
            orderType: 'Delivery',
          };
          router.replace({ pathname: '/delivery-success', params: finalOrder });
        } else {
          // Take Away
          const finalOrder = {
            orderId: finalOrderId,
            dbOrderId: finalDbId,
            total: finalAmount,
            paymentMethod: selectedMethod,
            phone: userPhone,
            itemCount: Array.isArray(finalItems) ? finalItems.length.toString() : '1',
            cart: JSON.stringify(finalItems),
            orderType: 'Take Away',
          };
          router.replace({ pathname: '/order-success', params: finalOrder });
        }
        return;
      } catch (err: any) {
        setLoading(false);
        if (Platform.OS !== 'web') {
          Alert.alert('Payment Error', err.message || 'Could not complete payment. Please try again.');
        } else {
          alert('Payment Error: ' + (err.message || 'Could not complete payment.'));
        }
        return;
      }
    }
  };

  const handleCancelOrder = async () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    setIsPollingCash(false);
    setLoading(false);

    if (currentDbOrderId) {
      console.log("Order cancelled locally before payment confirmation");
      // The backend does not support customer-initiated cancellations via API.
      // Since it's unpaid, it will naturally remain as PENDING on the backend.
    }
  };

  if (orderType === 'Delivery') {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: '#f9f9f9' }]}>
        <StatusBar barStyle="dark-content" backgroundColor="#fff" />
        <View style={styles.delHeader}>
          <TouchableOpacity onPress={() => router.back()} style={(styles as any).backBtn}>
            <Ionicons name="chevron-back" size={24} color="#000" />
          </TouchableOpacity>
          <Text style={styles.delHeaderTitle}>Payment</Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView style={styles.container} contentContainerStyle={styles.delScrollContent} showsVerticalScrollIndicator={false}>
          {/* Delivery Info Card */}
          <View style={styles.delInfoCard}>
            <View style={styles.delInfoTop}>
              <Text style={styles.delInfoTitle}>Delivery to Home</Text>
              <Text style={styles.delInfoPrice}>Rs. {baseDeliveryTotal.toFixed(0)}</Text>
            </View>
            <Text style={styles.delInfoAddress} numberOfLines={1}>
              {selectedDeliveryAddress
                ? <Text style={(styles as any).delHeaderAddressText}>{selectedDeliveryAddress} • ETA: 35 mins</Text>
                : <Text style={(styles as any).delHeaderAddressText}>Flat 402, Green Glen Layout, Bellandur, Bengaluru • ETA: 35 mins</Text>
              }
            </Text>
            <View style={styles.delFeeRow}>
              <Ionicons name="bicycle" size={14} color="#ff3400" />
              <Text style={styles.delFeeText}>
                Delivery Fee: ₹{deliveryFee.toFixed(0)}
              </Text>
            </View>
          </View>

          {/* To Pay */}
          <View style={styles.delToPayBlock}>
            <View>
              <Text style={styles.delToPayLabel}>To Pay</Text>
              <Text style={styles.delToPayAmount}>Rs. {totalVal.toFixed(0)}</Text>
            </View>
            <View style={styles.delEtaPill}>
              <Text style={styles.delEtaPillText}>ETA: 35 MIN</Text>
            </View>
          </View>

          <Text style={styles.delMethodsTitle}>Select Payment Method</Text>

          <View style={styles.delMethodsList}>
            <TouchableOpacity style={[styles.delMethodItem, selectedMethod === 'UPI' && styles.delMethodItemActive]} onPress={() => setSelectedMethod('UPI')} activeOpacity={0.8}>
              <View style={styles.delMethodIcon}>
                <Ionicons name="phone-portrait-outline" size={24} color="#ff3400" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.delMethodName}>UPI / Online Payment</Text>
                <Text style={styles.delMethodDesc}>Google Pay, PhonePe, Paytm, Cards & Netbanking</Text>
              </View>
              <View style={[styles.radioCircle, selectedMethod === 'UPI' ? styles.radioSelected : styles.radioUnselected]}>
                {selectedMethod === 'UPI' && <Ionicons name="checkmark" size={14} color="#fff" />}
              </View>
            </TouchableOpacity>
          </View>
        </ScrollView>

        <View style={styles.delFooter}>
          <View style={styles.delSecureWrap}>
            <Ionicons name="shield-checkmark" size={14} color="#00a01d" />
            <Text style={styles.delSecureText}>100% Safe & Secure Order Processing</Text>
          </View>
          <TouchableOpacity style={[styles.delPayBtn, loading && styles.btnDisabled]} onPress={handleConfirm} disabled={loading}>
            <Text style={styles.delPayBtnText}>
              {loading
                ? 'Processing Order...'
                : `Pay Rs. ${totalVal.toFixed(0)} via UPI / Online`}
            </Text>
          </TouchableOpacity>
        </View>

      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header */}
      <View style={styles.header}>
        {orderType !== 'Take Away' && (
          <View style={styles.tableBadge}>
            <Text style={styles.tableText}>Table no : </Text>
            <View style={styles.tableCircle}>
              <Text style={styles.tableCircleText}>{tableNumber?.replace('T-', '') ?? '06'}</Text>
            </View>
          </View>
        )}

        <View style={styles.logoContainer}>
          <Image
            source={require('../../../assets/images/Dataudupi.png')}
            style={styles.logoImageFull}
            resizeMode="contain"
          />
        </View>

        {/* Spacer to keep logo centered */}
        <View style={{ width: 32 }} />
      </View>

      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.paymentSection}>
          <Text style={styles.title}>Payment</Text>
          <Text style={styles.subtitle}>Choose a payment method to complete your order.</Text>

          <View style={styles.methodsContainer}>

            {/* Pay at Counter Option - only for Dine In, removed for Take Away */}
            {orderType !== 'Take Away' && (
              <View>
                <TouchableOpacity
                  style={[styles.methodCard, selectedMethod === 'Pay at Counter' ? styles.methodSelected : styles.methodUnselected]}
                  onPress={() => setSelectedMethod('Pay at Counter')}
                  activeOpacity={0.8}
                >
                  <View style={[styles.methodIconWrap, selectedMethod === 'Pay at Counter' ? styles.iconBgOrange : styles.iconBgWhite]}>
                    <Ionicons name="cash-outline" size={20} color={selectedMethod === 'Pay at Counter' ? '#fff' : '#888'} />
                  </View>
                  <View style={styles.methodTextContainer}>
                    <Text style={styles.methodName}>Pay at Counter</Text>
                    <Text style={styles.methodDesc}>Pay cash or card at counter (marked as paid)</Text>
                  </View>
                  <View style={[styles.radioCircle, selectedMethod === 'Pay at Counter' ? styles.radioSelected : styles.radioUnselected]}>
                    {selectedMethod === 'Pay at Counter' && <Ionicons name="checkmark" size={14} color="#fff" />}
                  </View>
                </TouchableOpacity>

                {/* Info Box for Pay at Counter */}
                {selectedMethod === 'Pay at Counter' && (
                  <View style={styles.paymentInfoBox}>
                    <Ionicons name="checkmark-done-circle-outline" size={20} color="#00a01d" />
                    <Text style={styles.paymentInfoText}>
                      Order will be immediately marked as Paid at the counter. You can view and download your invoice on the next screen.
                    </Text>
                  </View>
                )}
              </View>
            )}

            {/* UPI Option */}
            <View>
              <TouchableOpacity
                style={[styles.methodCard, selectedMethod === 'UPI' ? styles.methodSelected : styles.methodUnselected]}
                onPress={() => setSelectedMethod('UPI')}
                activeOpacity={0.8}
              >
                <View style={[styles.methodIconWrap, selectedMethod === 'UPI' ? styles.iconBgOrange : styles.iconBgWhite]}>
                  <Ionicons name="phone-portrait-outline" size={20} color={selectedMethod === 'UPI' ? '#fff' : '#888'} />
                </View>
                <View style={styles.methodTextContainer}>
                  <Text style={styles.methodName}>UPI / Online Payment</Text>
                  <Text style={styles.methodDesc}>GPay, PhonePe, Paytm, Card & Netbanking</Text>
                </View>
                <View style={[styles.radioCircle, selectedMethod === 'UPI' ? styles.radioSelected : styles.radioUnselected]}>
                  {selectedMethod === 'UPI' && <Ionicons name="checkmark" size={14} color="#fff" />}
                </View>
              </TouchableOpacity>

              {/* Info Box rendered if UPI is selected */}
              {selectedMethod === 'UPI' && (
                <View style={styles.paymentInfoBox}>
                  <Ionicons name="information-circle-outline" size={20} color="#ff3400" />
                  <Text style={styles.paymentInfoText}>
                    You will be redirected securely to Razorpay checkout where you can choose GPay, PhonePe, Paytm, Cards, or Netbanking.
                  </Text>
                </View>
              )}
            </View>

          </View>
        </View>
      </ScrollView>

      {/* Bottom Fixed Section */}
      <View style={styles.bottomSection}>
        {/* Order Summary Card */}
        <View style={styles.orderSummaryCard}>
          <Text style={styles.summaryGreenText}>
            {isDineInSettlement
              ? `Bill Settlement for Table ${effectiveTable.replace('T-', '')} (#${settlementOrderId})`
              : orderType === 'Dine In'
              ? `Order for Table ${effectiveTable.replace('T-', '')}. Dine in`
              : 'Take Away Order'}
          </Text>

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Subtotal </Text>
            <Text style={[styles.summaryAmount, { color: '#333' }]}>
              Rs. {(isDineInSettlement && settlementTotal > 0 ? settlementTotal : subtotal).toFixed(2)}
            </Text>
          </View>

          {!isDineInSettlement && discountAmount > 0 && (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Discount ({discountCode}) </Text>
              <Text style={[styles.summaryAmount, { color: '#00a01d' }]}>- Rs. {discountAmount.toFixed(2)}</Text>
            </View>
          )}

          <View style={[styles.summaryRow, { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#e8e8e8' }]}>
            <Text style={[styles.summaryLabel, { fontWeight: 'bold' }]}>Total payable </Text>
            <Text style={styles.summaryAmount}>Rs. {effectiveTotalVal.toFixed(2)}</Text>
          </View>
        </View>

        {/* Secure Pay Button */}
        <TouchableOpacity
          style={[styles.payBtn, loading && styles.btnDisabled]}
          onPress={handleConfirm}
          disabled={loading}
        >
          <View style={styles.payBtnContent}>
            <Ionicons
              name={selectedMethod === 'Pay at Counter' ? "checkmark-circle" : "lock-closed"}
              size={16}
              color="#fff"
              style={styles.payBtnIcon}
            />
            <Text style={styles.payBtnText}>
              {loading
                ? 'Processing...'
                : selectedMethod === 'Pay at Counter'
                ? `Confirm Pay at Counter (Rs. ${effectiveTotalVal.toFixed(2)})`
                : `Pay Rs. ${effectiveTotalVal.toFixed(2)} securely`}
            </Text>
          </View>
        </TouchableOpacity>
      </View>



      {/* Cash Polling Modal */}
      <Modal
        visible={isPollingCash}
        transparent={true}
        animationType="fade"
      >
        <View style={styles.modalOverlay}>
          <View style={styles.paymentFailedModalContent}>
            <Text style={{ fontSize: 40, marginBottom: 10 }}>⏳</Text>
            <Text style={styles.failedTitle}>Waiting for Payment...</Text>
            <Text style={styles.failedDesc}>Please pay at the counter. The order will be placed once payment is confirmed.</Text>

            <View style={{ flexDirection: 'row', width: '100%', justifyContent: 'space-between', marginTop: 20 }}>
              <TouchableOpacity
                style={[styles.backHomeBtn, { flex: 1, backgroundColor: '#7a7a7a', marginRight: 8 }]}
                onPress={() => setIsPollingCash(false)}
              >
                <Ionicons name="arrow-back" size={18} color="#fff" style={{ marginRight: 6 }} />
                <Text style={styles.backHomeText}>Go Back</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.backHomeBtn, { flex: 1, backgroundColor: '#ff3400', marginLeft: 8 }]}
                onPress={handleCancelOrder}
              >
                <Ionicons name="close" size={18} color="#fff" style={{ marginRight: 6 }} />
                <Text style={styles.backHomeText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#222',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  logoContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoImageFull: {
    width: 130,
    height: 32,
  },
  tableBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingLeft: 10,
    paddingRight: 2,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: '#dfdfdf',
  },
  tableText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#000',
  },
  tableCircle: {
    backgroundColor: '#ff3400',
    borderRadius: 12,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
  tableCircleText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  globeIcon: {
    width: 32, height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 20,
  },
  paymentSection: {
    marginBottom: 10,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 13,
    color: '#555',
    marginBottom: 24,
    lineHeight: 18,
  },
  methodsContainer: {
    gap: 12,
  },
  methodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 16,
    marginBottom: 4,
  },
  methodUnselected: {
    backgroundColor: '#f9f9f9',
    borderWidth: 1,
    borderColor: '#f2f2f2',
  },
  methodSelected: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ff3400',
  },
  methodIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  iconBgWhite: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  iconBgOrange: {
    backgroundColor: '#ff3400',
  },
  methodTextContainer: {
    flex: 1,
  },
  methodName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 2,
  },
  methodDesc: {
    fontSize: 11,
    color: '#777',
  },
  radioCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  radioUnselected: {
    borderColor: '#ddd',
    backgroundColor: '#fff',
  },
  radioSelected: {
    borderColor: '#ff3400',
    backgroundColor: '#ff3400',
  },
  bottomSection: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 24,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  orderSummaryCard: {
    borderWidth: 1,
    borderColor: '#e8e8e8',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  summaryGreenText: {
    color: '#00a01d',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  summaryLabel: {
    fontSize: 12,
    color: '#333',
    fontWeight: '500',
  },
  summaryAmount: {
    fontSize: 12,
    color: '#ff3400',
    fontWeight: 'bold',
  },
  summarySuffix: {
    fontSize: 10,
    color: '#666',
  },
  payBtn: {
    backgroundColor: '#00a01d',
    borderRadius: 24,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnDisabled: {
    backgroundColor: '#6bcf80',
  },
  payBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  payBtnIcon: {
    marginRight: 6,
  },
  payBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 15,
  },
  paymentInfoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff5f2',
    borderColor: '#ffd5cc',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
    marginBottom: 8,
    gap: 8,
  },
  paymentInfoText: {
    flex: 1,
    fontSize: 12,
    color: '#333',
    lineHeight: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  paymentFailedModalContent: {
    width: '90%',
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 10,
  },
  failedIconWrap: {
    width: 70,
    height: 70,
    borderRadius: 35,
    borderColor: '#ff4040',
    borderWidth: 5,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  failedTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#ff4040',
    marginBottom: 8,
    textAlign: 'center',
  },
  failedDesc: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
  },
  failedDetailsContainer: {
    flexDirection: 'row',
    backgroundColor: '#fffdfc',
    borderRadius: 16,
    padding: 16,
    width: '100%',
    marginBottom: 24,
    borderColor: '#ffe8e0',
    borderWidth: 1,
  },
  failedDetailCol: {
    flex: 1,
    backgroundColor: '#fff',
    borderColor: '#ffe8e0',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginHorizontal: 4,
  },
  delHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  delHeaderTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000',
  },
  delScrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  delInfoCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  delInfoTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  delInfoTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#000',
  },
  delInfoPrice: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#ff3400',
  },
  delInfoAddress: {
    fontSize: 12,
    color: '#888',
  },
  delFeeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f2f2f2',
    gap: 6,
  },
  delFeeText: {
    fontSize: 12,
    color: '#666',
    flex: 1,
  },
  delToPayBlock: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  delToPayLabel: {
    fontSize: 12,
    color: '#888',
  },
  delToPayAmount: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000',
  },
  delEtaPill: {
    backgroundColor: '#e8f5e9',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  delEtaPillText: {
    color: '#00a01d',
    fontWeight: 'bold',
    fontSize: 12,
  },
  delMethodsTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 12,
  },
  delMethodsList: {
    gap: 12,
  },
  delMethodItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  delMethodItemActive: {
    borderColor: '#ff3400',
  },
  delMethodIcon: {
    marginRight: 12,
  },
  delMethodName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 2,
  },
  delMethodDesc: {
    fontSize: 11,
    color: '#888',
  },
  delFooter: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderColor: '#eee',
  },
  delSecureWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  delSecureText: {
    fontSize: 11,
    color: '#888',
    marginLeft: 6,
  },
  delPayBtn: {
    backgroundColor: '#00a01d',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  delPayBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  testBadge: {
    backgroundColor: '#e6f7f1',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginLeft: 8,
  },
  testBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#057a55',
  },
  failedDetailLabel: {
    fontSize: 12,
    color: '#888',
    marginBottom: 6,
  },
  failedDetailValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#ff4040',
  },
  failedInstruction: {
    fontSize: 13,
    color: '#555',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 18,
  },
  failedButtonsRow: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'space-between',
  },
  backHomeBtn: {
    flex: 1,
    backgroundColor: '#7a7a7a',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 25,
    marginRight: 8,
  },
  backHomeText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 15,
  },
  tryAgainBtn: {
    flex: 1,
    backgroundColor: '#ff3400',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 25,
    marginLeft: 8,
  },
  tryAgainText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 15,
  },
  btnIcon: {
    marginRight: 6,
  },
  btnEmoji: {
    marginRight: 6,
    fontSize: 16,
  },
});
