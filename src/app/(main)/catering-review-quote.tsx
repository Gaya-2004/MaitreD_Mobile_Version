import React from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  SafeAreaView, Platform, StatusBar
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function ReviewQuote() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();

  const sessionId = params.sessionId as string;
  const packageName = params.packageName as string;
  const guestCount = parseInt(params.guestCount as string || '0', 10);
  const eventName = params.eventName as string;
  const date = params.date as string;
  const time = params.time as string;
  const serviceType = params.serviceType as string;
  const address = params.address as string;

  const baseAmount = parseFloat(params.baseAmount as string || '0');
  const customizationAmount = parseFloat(params.customizationAmount as string || '0');
  const addonAmount = parseFloat(params.addonAmount as string || '0');
  const transportCharge = parseFloat(params.transportCharge as string || '0');
  const serviceCharge = parseFloat(params.serviceCharge as string || '0');
  const cgstAmount = parseFloat(params.cgstAmount as string || '0');
  const sgstAmount = parseFloat(params.sgstAmount as string || '0');
  const totalAmount = parseFloat(params.totalAmount as string || '0');
  const advanceAmount = parseFloat(params.advanceAmount as string || '0');
  const balanceAmount = parseFloat(params.balanceAmount as string || '0');
  const advancePct = parseFloat(params.advancePercentage as string || '50');

  const menuSubtotal = baseAmount + customizationAmount;
  const estimatedGst = cgstAmount + sgstAmount;
  const transportAndLogistics = transportCharge + serviceCharge;

  const fmt = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#000" />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.stepText}>STEP 5 OF 6</Text>
          <Text style={styles.headerTitle}>Review & Quote</Text>
        </View>
        <MaterialCommunityIcons name="leaf" size={24} color="#8bc34a" />
      </View>

      {/* Progress */}
      <View style={styles.progressBar}>
        {[1, 2, 3, 4, 5, 6].map(i => (
          <View key={i} style={[styles.progressSeg, i <= 5 && styles.progressActive]} />
        ))}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>

        {/* Event Summary */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>Event Summary</Text>
            <TouchableOpacity onPress={() => router.back()}>
              <Text style={styles.editLink}>EDIT</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.eventName}>{eventName || '—'}</Text>
          <Text style={styles.eventMeta}>{date && time ? `${date} • ${time}` : '—'}</Text>
          <Text style={styles.eventMeta}>{guestCount} Guests • {serviceType || '—'}</Text>
          {address ? <Text style={styles.eventAddress}>{address}</Text> : null}
        </View>

        {/* Package Summary */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.pkgTitle}>{packageName}</Text>
            <Text style={styles.pkgPrice}>Rs. {fmt(baseAmount)}</Text>
          </View>
          {/* Items summary will be shown if available */}
        </View>

        {/* Bill Details */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Est. Bill Details</Text>

          <View style={styles.billRow}>
            <Text style={styles.billLabel}>Menu Subtotal</Text>
            <Text style={styles.billValue}>Rs. {fmt(menuSubtotal)}</Text>
          </View>
          {addonAmount > 0 && (
            <View style={styles.billRow}>
              <Text style={styles.billLabel}>Add-ons & Extras</Text>
              <Text style={styles.billValue}>Rs. {fmt(addonAmount)}</Text>
            </View>
          )}
          <View style={styles.billRow}>
            <Text style={styles.billLabel}>Transport & Logistics</Text>
            <Text style={styles.billValue}>Rs. {fmt(transportAndLogistics)}</Text>
          </View>
          <View style={styles.billRow}>
            <Text style={styles.billLabel}>Estimated CGST & SGST (5%)</Text>
            <Text style={styles.billValue}>Rs. {fmt(estimatedGst)}</Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.billRow}>
            <Text style={styles.totalLabel}>Estimated Total</Text>
            <Text style={styles.totalValue}>Rs. {fmt(totalAmount)}</Text>
          </View>
          <View style={styles.billRow}>
            <Text style={[styles.totalLabel, { color: '#ff4500' }]}>Advance Required ({advancePct}%)</Text>
            <Text style={[styles.totalValue, { color: '#ff4500' }]}>Rs. {fmt(advanceAmount)}</Text>
          </View>
        </View>

        <View style={styles.noteCard}>
          <Ionicons name="information-circle-outline" size={16} color="#888" style={{ marginRight: 6 }} />
          <Text style={styles.noteText}>Menu changes or cancellation must be made at least 48 hours before service.</Text>
        </View>
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom > 0 ? insets.bottom + 10 : 20 }]}>
        <TouchableOpacity style={styles.advanceBtn} onPress={() => {
          router.push({
            pathname: '/(main)/catering-advance-payment',
            params: {
              sessionId,
              restaurantId: (params.restaurantId as string) || '',
              restaurantName: (params.restaurantName as string) || '',
              packageName,
              guestCount: guestCount.toString(),
              eventName,
              date,
              time,
              totalAmount: totalAmount.toString(),
              advanceAmount: advanceAmount.toString(),
              balanceAmount: balanceAmount.toString(),
            }
          });
        }}>
          <Text style={styles.advanceBtnText}>Continue to Advance</Text>
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
  card: {
    backgroundColor: '#fff', marginHorizontal: 16, marginTop: 16, borderRadius: 12,
    padding: 18, elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4,
  },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  cardTitle: { fontSize: 15, fontWeight: 'bold', color: '#222' },
  editLink: { fontSize: 12, fontWeight: 'bold', color: '#ff4500', letterSpacing: 0.5 },
  eventName: { fontSize: 17, fontWeight: 'bold', color: '#222', marginBottom: 6 },
  eventMeta: { fontSize: 13, color: '#666', marginBottom: 3 },
  eventAddress: { fontSize: 13, color: '#666', marginTop: 4, lineHeight: 18 },
  pkgTitle: { fontSize: 15, fontWeight: 'bold', color: '#222', flex: 1 },
  pkgPrice: { fontSize: 16, fontWeight: 'bold', color: '#222' },
  billRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  billLabel: { fontSize: 13, color: '#666' },
  billValue: { fontSize: 13, color: '#333', fontWeight: '500' },
  divider: { height: 1, backgroundColor: '#f0f0f0', marginVertical: 8 },
  totalLabel: { fontSize: 14, fontWeight: 'bold', color: '#222' },
  totalValue: { fontSize: 16, fontWeight: 'bold', color: '#222' },
  noteCard: {
    flexDirection: 'row', alignItems: 'flex-start', marginHorizontal: 16, marginTop: 14,
    padding: 14, backgroundColor: '#fffbf0', borderRadius: 10, borderWidth: 1, borderColor: '#ffe5a0'
  },
  noteText: { fontSize: 12, color: '#666', flex: 1, lineHeight: 17 },
  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#fff',
    padding: 20, borderTopWidth: 1, borderTopColor: '#eee', elevation: 8
  },
  advanceBtn: { backgroundColor: '#ff4500', paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  advanceBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});
