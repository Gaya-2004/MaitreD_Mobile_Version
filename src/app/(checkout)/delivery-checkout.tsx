import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, StatusBar, Image, Alert } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCartStore } from '../../store/useCartStore';
import { useAddressStore } from '../../store/useAddressStore';
import { useAuthStore, useRestaurantStore } from '../../store';
import { getDistanceInKm, checkDeliveryCoverage, DeliveryCoverageResult, resolveOutletLocation, calculateDeliveryFee } from '../../utils/deliveryArea';
import DeliveryUnavailableModal from '../../components/ui/DeliveryUnavailableModal';
import { getFullImageUrl } from '../../constants/api';

export default function DeliveryCheckoutScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  
  const { items, getItemCount, getSubtotal, getGst, getDiscountAmount } = useCartStore();
  const { selectedDeliveryAddress, addresses, selectedAddressId } = useAddressStore();
  const { phone } = useAuthStore();
  const { selectedOutlet } = useRestaurantStore();

  const cartItems = Object.values(items).filter(item => item && item.quantity > 0);
  const itemCount = getItemCount();
  
  const [instruction, setInstruction] = useState('');
  const [selectedTip, setSelectedTip] = useState<number | null>(null);
  const [showCoverageModal, setShowCoverageModal] = useState(false);
  const [coverageResult, setCoverageResult] = useState<DeliveryCoverageResult | null>(null);
  
  const selectedAddressObj = addresses.find(a => a.id == selectedAddressId) || addresses[0];
  const deliveryAddressType = selectedAddressObj ? selectedAddressObj.type : 'Home';
  
  const subtotal = getSubtotal();
  const gst = getGst();
  const discountAmount = getDiscountAmount();
  const packagingCharges = 0;

  const targetOutlet = resolveOutletLocation(selectedOutlet);
  const distanceKm = (selectedAddressObj?.latitude && selectedAddressObj?.longitude)
    ? getDistanceInKm(selectedAddressObj.latitude, selectedAddressObj.longitude, targetOutlet)
    : null;
  const deliveryFee = calculateDeliveryFee(distanceKm);
  
  const baseTotal = subtotal + packagingCharges + gst - discountAmount + deliveryFee;
  const finalTotal = baseTotal + (selectedTip || 0);

  const tips = [10, 20, 30];

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Checkout</Text>
      </View>

      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* Delivery Address */}
        <Text style={styles.sectionTitle}>Delivery Address</Text>
        <View style={styles.card}>
          <View style={styles.addressRow}>
            <View style={styles.iconCircle}>
              <Ionicons name="home-outline" size={20} color="#ff3400" />
            </View>
            <View style={styles.addressInfo}>
              <Text style={styles.addressType}>{selectedDeliveryAddress ? deliveryAddressType : 'Home'}</Text>
              <Text style={styles.addressText} numberOfLines={1}>
                {selectedDeliveryAddress || 'Flat 402, Maple Heights, Karaman...'}
              </Text>
            </View>
            <TouchableOpacity onPress={() => router.push('/add-address')}>
              <Text style={styles.changeBtnText}>Change</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Delivery Instructions */}
        <Text style={styles.sectionTitle}>Delivery Instructions</Text>
        <View style={styles.instructionContainer}>
          <Ionicons name="chatbubble-ellipses-outline" size={20} color="#666" style={styles.instructionIcon} />
          <TextInput 
            style={styles.instructionInput}
            placeholder="e.g. Leave with security, Ring bell once..."
            placeholderTextColor="#999"
            value={instruction}
            onChangeText={setInstruction}
          />
        </View>

        {/* Contact Number */}
        <View style={styles.contactRow}>
          <View>
            <Text style={styles.sectionTitle}>Contact Number</Text>
            <Text style={styles.contactNumberText}>{phone || '+91 98765 43210'}</Text>
          </View>
          <TouchableOpacity>
            <Text style={styles.changeBtnText}>Change</Text>
          </TouchableOpacity>
        </View>

        {/* Tip Your Delivery Partner */}
        <View style={styles.tipSection}>
          <View style={styles.tipHeader}>
            <View style={styles.riderAvatar}>
               <Ionicons name="bicycle-outline" size={24} color="#ff3400" />
            </View>
            <View style={styles.tipInfo}>
              <Text style={styles.tipTitle}>Tip Your Delivery Partner</Text>
              <Text style={styles.tipSubtitle}>100% of the tip goes directly to your rider</Text>
            </View>
          </View>
          
          <View style={styles.tipButtonsContainer}>
            {tips.map((amount) => (
              <TouchableOpacity 
                key={amount} 
                style={[styles.tipBtn, selectedTip === amount && styles.tipBtnSelected]}
                onPress={() => setSelectedTip(selectedTip === amount ? null : amount)}
              >
                <Text style={[styles.tipBtnText, selectedTip === amount && styles.tipBtnTextSelected]}>Rs. {amount}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.tipBtn} onPress={() => {
              Alert.prompt
                ? Alert.prompt('Custom Tip', 'Enter tip amount (₹)', (val) => {
                    const n = parseInt(val, 10);
                    if (!isNaN(n) && n >= 0) setSelectedTip(n || null);
                  }, 'plain-text', '')
                : Alert.alert('Custom Tip', 'Enter a custom tip amount in the text field above.');
            }}>
              <Text style={styles.tipBtnText}>Custom</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Ordered Items Summary */}
        <Text style={styles.sectionTitle}>
          Items Ordered ({itemCount} {itemCount === 1 ? 'item' : 'items'})
        </Text>
        <View style={styles.card}>
          {cartItems.map((item, index) => {
            const itemTotal = (item.price || 0) * (item.quantity || 1);
            return (
              <View
                key={item.id}
                style={[
                  styles.orderItemRow,
                  index > 0 && styles.orderItemSeparator,
                ]}
              >
                <Image source={{ uri: getFullImageUrl(item.image, item.name) }} style={styles.orderItemImage} resizeMode="cover" />
                <View style={styles.orderItemDetails}>
                  <Text style={styles.orderItemName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.orderItemQtyPrice}>
                    Qty: {item.quantity} × Rs. {item.price}
                  </Text>
                </View>
                <Text style={styles.orderItemPriceTotal}>
                  Rs. {itemTotal.toFixed(2)}
                </Text>
              </View>
            );
          })}
        </View>

        {/* Bill Breakdown */}
        <Text style={styles.sectionTitle}>Bill Breakdown</Text>
        <View style={styles.card}>
          {cartItems.map((item) => {
            const itemTotal = (Number(item.price) || 0) * (Number(item.quantity) || 1);
            return (
              <View key={item.id} style={styles.billSplitRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 12 }}>
                  <Text style={[styles.billSplitLabel, { color: '#333', fontWeight: '500', flexShrink: 1 }]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={[styles.billSplitLabel, { fontWeight: '600', marginLeft: 6 }]}>
                    x {item.quantity}
                  </Text>
                </View>
                <Text style={styles.billSplitValue}>Rs. {itemTotal.toFixed(2)}</Text>
              </View>
            );
          })}
          {cartItems.length > 0 && <View style={styles.billSplitDivider} />}

          <View style={styles.billSplitRow}>
            <Text style={styles.billSplitLabel}>Item Subtotal</Text>
            <Text style={styles.billSplitValue}>Rs. {subtotal.toFixed(2)}</Text>
          </View>
          <View style={styles.billSplitRow}>
            <Text style={styles.billSplitLabel}>Delivery Fee</Text>
            <Text style={styles.billSplitValue}>Rs. {deliveryFee.toFixed(2)}</Text>
          </View>
          <View style={styles.billSplitRow}>
            <Text style={styles.billSplitLabel}>Packaging Charges</Text>
            <Text style={styles.billSplitValue}>Rs. {packagingCharges.toFixed(2)}</Text>
          </View>
          <View style={styles.billSplitRow}>
            <Text style={styles.billSplitLabel}>GST & Restaurant Taxes</Text>
            <Text style={styles.billSplitValue}>Rs. {gst.toFixed(2)}</Text>
          </View>
          {discountAmount > 0 && (
            <View style={styles.billSplitRow}>
              <Text style={[styles.billSplitLabel, { color: '#00a01d' }]}>Discount</Text>
              <Text style={[styles.billSplitValue, { color: '#00a01d' }]}>- Rs. {discountAmount.toFixed(2)}</Text>
            </View>
          )}
          {Boolean(selectedTip) && (
            <View style={styles.billSplitRow}>
              <Text style={styles.billSplitLabel}>Rider Tip</Text>
              <Text style={styles.billSplitValue}>Rs. {selectedTip!.toFixed(2)}</Text>
            </View>
          )}
          <View style={styles.billSplitDivider} />
          <View style={styles.billSplitRow}>
            <Text style={styles.billSplitTotalLabel}>To Pay</Text>
            <Text style={styles.billSplitTotalValue}>Rs. {Math.max(finalTotal, 0).toFixed(2)}</Text>
          </View>
        </View>

      </ScrollView>

      {/* Footer */}
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View style={styles.footerTopRow}>
          <View>
            <Text style={styles.totalLabel}>Total Amount</Text>
            <Text style={styles.totalValue}>Rs. {Math.max(finalTotal, 0).toFixed(0)}</Text>
          </View>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.viewDetailsBtn}>View Details</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity 
          style={styles.proceedBtn}
          onPress={() => {
            if (!selectedDeliveryAddress && !selectedAddressId) {
              Alert.alert("Address Required", "Please select or add a delivery address before proceeding.");
              return;
            }
            const coverage = checkDeliveryCoverage(
              selectedAddressObj?.latitude,
              selectedAddressObj?.longitude,
              selectedOutlet
            );
            if (!coverage.isEligible) {
              setCoverageResult(coverage);
              setShowCoverageModal(true);
              return;
            }
            router.push({
              pathname: '/payment',
              params: {
                tipAmount: selectedTip || 0,
                instructions: instruction,
                deliveryFee: deliveryFee.toString(),
              }
            });
          }}
        >
          <Text style={styles.proceedBtnText}>Continue to Payment</Text>
        </TouchableOpacity>
      </View>

      <DeliveryUnavailableModal
        visible={showCoverageModal}
        onClose={() => setShowCoverageModal(false)}
        distanceKm={coverageResult?.distanceKm}
        maxRadiusKm={coverageResult?.maxRadiusKm || 5}
        restaurantName={coverageResult?.outletName || selectedOutlet?.name || 'Data Udipi'}
        alternateBranch={coverageResult?.alternateBranch}
        customMessage={coverageResult?.message}
        onTryAnotherAddress={() => {
          setShowCoverageModal(false);
          router.push('/add-address');
        }}
      />
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
  },
  backBtn: {
    padding: 4,
    marginRight: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000',
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 40,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
    marginTop: 8,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#f0f0f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fff0e6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  addressInfo: {
    flex: 1,
    marginRight: 12,
  },
  addressType: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 4,
  },
  addressText: {
    fontSize: 12,
    color: '#888',
  },
  changeBtnText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#ff3400',
  },
  instructionContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#f0f0f0',
    borderRadius: 12,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 2,
    elevation: 1,
  },
  instructionIcon: {
    marginRight: 10,
  },
  instructionInput: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 13,
    color: '#333',
  },
  contactRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  contactNumberText: {
    fontSize: 13,
    color: '#888',
  },
  tipSection: {
    marginBottom: 24,
  },
  tipHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  riderAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fff0e6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  tipInfo: {
    flex: 1,
  },
  tipTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  tipSubtitle: {
    fontSize: 11,
    color: '#888',
  },
  tipButtonsContainer: {
    flexDirection: 'row',
    gap: 10,
  },
  tipBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#eee',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  tipBtnSelected: {
    backgroundColor: '#ff3400',
    borderColor: '#ff3400',
  },
  tipBtnText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
  },
  tipBtnTextSelected: {
    color: '#fff',
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  footerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  totalLabel: {
    fontSize: 12,
    color: '#888',
    marginBottom: 4,
  },
  totalValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ff3400',
  },
  viewDetailsBtn: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#ff3400',
  },
  proceedBtn: {
    backgroundColor: '#00a01d',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  proceedBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  billSplitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  billSplitLabel: {
    fontSize: 13,
    color: '#666',
  },
  billSplitValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
  },
  billSplitDivider: {
    height: 1,
    backgroundColor: '#eee',
    marginVertical: 8,
  },
  billSplitTotalLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#111',
  },
  billSplitTotalValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#ff3400',
  },
  orderItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  orderItemSeparator: {
    borderTopWidth: 1,
    borderTopColor: '#f2f2f2',
  },
  orderItemImage: {
    width: 44,
    height: 44,
    borderRadius: 8,
    marginRight: 12,
  },
  orderItemPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#fff0e6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  orderItemDetails: {
    flex: 1,
    marginRight: 8,
  },
  orderItemName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#222',
  },
  orderItemQtyPrice: {
    fontSize: 12,
    color: '#777',
    marginTop: 2,
  },
  orderItemPriceTotal: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
  },
});
