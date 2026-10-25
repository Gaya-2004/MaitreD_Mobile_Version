import { API_BASE_URL } from '../../constants/api';
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  SafeAreaView, Platform, StatusBar, ActivityIndicator, Alert
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '../../store/useAuthStore';

// Hardcoded addon menu (these are standard catering add-ons defined by the restaurant)
const TIFFIN_PACKAGES = [
  {
    id: 'tiffin-1',
    name: 'Evening Tiffin 1',
    description: 'Sweet, Karam, Coffee',
    pricePerPerson: 135,
    addonType: 'TIFFIN',
    pricingType: 'PER_PERSON' as const,
  },
  {
    id: 'tiffin-2',
    name: 'Evening Tiffin 2',
    description: 'Sweet, Rava Khizaali, Chutney, Sambar, Coffee',
    pricePerPerson: 150,
    addonType: 'TIFFIN',
    pricingType: 'PER_PERSON' as const,
  },
  {
    id: 'tiffin-3',
    name: 'Evening Tiffin 3',
    description: 'Sweet, Rava Khizaali, Bonda, Chutney, Special Chutney, Sambar, Coffee',
    pricePerPerson: 160,
    addonType: 'TIFFIN',
    pricingType: 'PER_PERSON' as const,
  },
];

const SERVICE_ADDONS = [
  {
    id: 'spot-prep',
    name: 'Spot Preparation',
    description: 'Rs. 1,250',
    unitPrice: 1250,
    addonType: 'SERVICE',
    pricingType: 'FLAT' as const,
  },
  {
    id: 'full-service',
    name: 'Full Service Staffing',
    description: 'Quote pending',
    unitPrice: 0,
    addonType: 'SERVICE',
    pricingType: 'FLAT' as const,
    quoteOnly: true,
  },
  {
    id: 'mineral-water',
    name: 'Mineral Water (250ml bottles)',
    description: 'Rs. 10 / bottle',
    unitPrice: 10,
    addonType: 'SERVICE',
    pricingType: 'PER_UNIT' as const,
  },
  {
    id: 'table-roll',
    name: 'Disposable Table Roll & Paper Napkins',
    description: 'Rs. 450',
    unitPrice: 450,
    addonType: 'SERVICE',
    pricingType: 'FLAT' as const,
  },
];

export default function AddExtras() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const auth = useAuthStore();

  const sessionId = params.sessionId as string;
  const guestCount = parseInt(params.guestCount as string || '50', 10);

  const [selectedTiffin, setSelectedTiffin] = useState<string | null>(null);
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const BASE_URL = API_BASE_URL;
  const authHeaders = {
    'Content-Type': 'application/json',
    ...(auth.token ? { 'Authorization': `Bearer ${auth.token}` } : {})
  };

  const toggleService = (id: string) => {
    setSelectedServices(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    );
  };

  const handleReviewPlan = async () => {
    setSaving(true);
    try {
      const addonsToPost = [];

      // Add tiffin if selected
      if (selectedTiffin) {
        const tiffin = TIFFIN_PACKAGES.find(t => t.id === selectedTiffin);
        if (tiffin) {
          addonsToPost.push({
            addon_type: tiffin.addonType,
            addon_name: tiffin.name,
            quantity: guestCount,
            unit_price: tiffin.pricePerPerson,
            pricing_type: tiffin.pricingType
          });
        }
      }

      // Add services if selected
      for (const svcId of selectedServices) {
        const svc = SERVICE_ADDONS.find(s => s.id === svcId);
        if (svc && !svc.quoteOnly) {
          addonsToPost.push({
            addon_type: svc.addonType,
            addon_name: svc.name,
            quantity: svc.pricingType === 'PER_UNIT' ? guestCount : 1,
            unit_price: svc.unitPrice,
            pricing_type: svc.pricingType
          });
        }
      }

      // Post all selected addons
      for (const addon of addonsToPost) {
        const res = await fetch(`${BASE_URL}/api/v1/public/catering/sessions/${sessionId}/addons`, {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify(addon)
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          console.warn('Addon error:', err.detail);
        }
      }

      // Generate quote
      const quoteRes = await fetch(`${BASE_URL}/api/v1/public/catering/sessions/${sessionId}/quote`, {
        method: 'POST',
        headers: authHeaders
      });

      if (!quoteRes.ok) {
        const err = await quoteRes.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to generate quote');
      }

      const quoteData = await quoteRes.json();

      router.push({
        pathname: '/(main)/catering-review-quote',
        params: {
          sessionId,
          restaurantId: (params.restaurantId as string) || '',
          restaurantName: (params.restaurantName as string) || '',
          packageName: params.packageName,
          guestCount: guestCount.toString(),
          eventName: params.eventName,
          date: params.date,
          time: params.time,
          serviceType: params.serviceType,
          address: params.address,
          // Quote data
          baseAmount: quoteData.base_amount?.toString(),
          customizationAmount: quoteData.customization_amount?.toString(),
          addonAmount: quoteData.addon_amount?.toString(),
          transportCharge: quoteData.transport_charge?.toString(),
          serviceCharge: quoteData.service_charge?.toString(),
          cgstAmount: quoteData.cgst_amount?.toString(),
          sgstAmount: quoteData.sgst_amount?.toString(),
          totalAmount: quoteData.total_amount?.toString(),
          advanceAmount: quoteData.advance_amount?.toString(),
          balanceAmount: quoteData.balance_amount?.toString(),
          advancePercentage: quoteData.advance_percentage?.toString(),
        }
      });

    } catch (e: any) {
      Alert.alert('Error', e.message || 'Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#000" />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.stepText}>STEP 4 OF 6</Text>
          <Text style={styles.headerTitle}>Add Tiffin & Extras</Text>
        </View>
        <MaterialCommunityIcons name="leaf" size={24} color="#8bc34a" />
      </View>

      {/* Progress */}
      <View style={styles.progressBar}>
        {[1, 2, 3, 4, 5, 6].map(i => (
          <View key={i} style={[styles.progressSeg, i <= 4 && styles.progressActive]} />
        ))}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        {/* Tiffin Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Evening Tiffin Packages (Optional)</Text>
          <Text style={styles.sectionSub}>Adds to your overall serving plan</Text>

          {TIFFIN_PACKAGES.map(tiffin => {
            const isSelected = selectedTiffin === tiffin.id;
            return (
              <View key={tiffin.id} style={[styles.card, isSelected && styles.cardSelected]}>
                <View style={styles.cardTopRow}>
                  <Text style={styles.cardName}>{tiffin.name}</Text>
                  <Text style={styles.cardPrice}>Rs. {tiffin.pricePerPerson}<Text style={styles.perPerson}> / person</Text></Text>
                </View>
                <Text style={styles.cardDesc}>{tiffin.description}</Text>
                <Text style={styles.minOrder}>Minimum 50 guests required</Text>
                <TouchableOpacity
                  style={[styles.addOptionBtn, isSelected && styles.addOptionBtnSelected]}
                  onPress={() => setSelectedTiffin(isSelected ? null : tiffin.id)}
                >
                  <Text style={[styles.addOptionBtnText, isSelected && styles.addOptionBtnTextSelected]}>
                    {isSelected ? 'Remove' : 'Add Option'}
                  </Text>
                </TouchableOpacity>
              </View>
            );
          })}
        </View>

        {/* Service Add-ons */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Catering Service Add-ons</Text>

          {SERVICE_ADDONS.map(svc => {
            const isSelected = selectedServices.includes(svc.id);
            return (
              <TouchableOpacity key={svc.id} style={styles.checkRow} onPress={() => toggleService(svc.id)}>
                <View style={[styles.checkbox, isSelected && styles.checkboxChecked]}>
                  {isSelected && <Ionicons name="checkmark" size={14} color="#fff" />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.checkLabel}>{svc.name}</Text>
                  <Text style={styles.checkSub}>{svc.description}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      {/* Bottom Button */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom > 0 ? insets.bottom + 10 : 20 }]}>
        <TouchableOpacity style={styles.reviewBtn} onPress={handleReviewPlan} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.reviewBtnText}>Review Plan</Text>}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fafafa', paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 15, backgroundColor: '#fff' },
  backBtn: { marginRight: 15 },
  headerText: { flex: 1 },
  stepText: { fontSize: 10, fontWeight: '700', color: '#ff4500', letterSpacing: 1 },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#333', marginTop: 2 },
  progressBar: { flexDirection: 'row', paddingHorizontal: 20, paddingBottom: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  progressSeg: { flex: 1, height: 4, backgroundColor: '#f0f0f0', borderRadius: 2, marginHorizontal: 2 },
  progressActive: { backgroundColor: '#ff4500' },
  section: { paddingHorizontal: 20, marginTop: 24 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#222', marginBottom: 4 },
  sectionSub: { fontSize: 12, color: '#888', marginBottom: 16 },
  card: {
    backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: '#eee', elevation: 1,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4,
  },
  cardSelected: { borderColor: '#ff4500', borderWidth: 1.5 },
  cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  cardName: { fontSize: 15, fontWeight: 'bold', color: '#222' },
  cardPrice: { fontSize: 16, fontWeight: 'bold', color: '#ff4500' },
  perPerson: { fontSize: 12, fontWeight: 'normal', color: '#888' },
  cardDesc: { fontSize: 13, color: '#666', lineHeight: 18, marginBottom: 8 },
  minOrder: { fontSize: 11, color: '#aaa', marginBottom: 12 },
  addOptionBtn: {
    alignSelf: 'flex-end', paddingHorizontal: 20, paddingVertical: 7,
    borderRadius: 20, borderWidth: 1, borderColor: '#ff4500', backgroundColor: '#fff',
  },
  addOptionBtnSelected: { backgroundColor: '#ff4500' },
  addOptionBtnText: { fontSize: 13, fontWeight: 'bold', color: '#ff4500' },
  addOptionBtnTextSelected: { color: '#fff' },
  checkRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f0f0f0'
  },
  checkbox: {
    width: 22, height: 22, borderRadius: 4, borderWidth: 1.5, borderColor: '#ccc',
    marginRight: 14, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
    marginTop: 2,
  },
  checkboxChecked: { backgroundColor: '#ff4500', borderColor: '#ff4500' },
  checkLabel: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 2 },
  checkSub: { fontSize: 12, color: '#888' },
  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#fff', padding: 20, borderTopWidth: 1, borderTopColor: '#eee', elevation: 8
  },
  reviewBtn: { backgroundColor: '#2d2d2d', paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  reviewBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});

