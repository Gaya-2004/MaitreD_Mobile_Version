import { API_BASE_URL } from '../../constants/api';
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  SafeAreaView, Platform, StatusBar, ActivityIndicator,
  Modal, Alert
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '../../store/useAuthStore';

interface PackageItem {
  id: number;
  name: string;
  group: string;
  is_swappable: boolean;
  is_removable: boolean;
}

interface PackageCategory {
  name: string;
  items: PackageItem[];
}

interface SwapOption {
  id: number;
  name: string;
  group: string;
  price_change_per_person: number;
}

interface Customization {
  id: number;
  action_type: 'ADD' | 'REMOVE' | 'REPLACE';
  original_item_id?: number;
  original_item_name?: string;
  new_item_id?: number;
  new_item_name?: string;
  price_adjustment_per_person: number;
}

export default function CustomiseMenu() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const auth = useAuthStore();

  const sessionId = params.sessionId as string;
  const packageCode = params.packageCode as string;
  const guestCount = parseInt(params.guestCount as string || '50', 10);
  const packagePrice = parseFloat(params.packagePrice as string || '0');
  const packageName = params.packageName as string;

  const [categories, setCategories] = useState<PackageCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [customizations, setCustomizations] = useState<Customization[]>([]);

  // Swap modal state
  const [swapModalVisible, setSwapModalVisible] = useState(false);
  const [swapTarget, setSwapTarget] = useState<PackageItem | null>(null);
  const [swapOptions, setSwapOptions] = useState<SwapOption[]>([]);
  const [loadingSwapOptions, setLoadingSwapOptions] = useState(false);
  const [savingSwap, setSavingSwap] = useState(false);
  
  // Add modal state
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [addOptions, setAddOptions] = useState<SwapOption[]>([]);

  const BASE_URL = API_BASE_URL;
  const authHeaders = {
    'Content-Type': 'application/json',
    ...(auth.token ? { 'Authorization': `Bearer ${auth.token}` } : {})
  };

  const fetchPackageItems = async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/v1/public/catering/packages/${encodeURIComponent(packageCode)}/items`);
      const data = await res.json();
      setCategories(data.categories || []);
    } catch (e) {
      Alert.alert('Error', 'Failed to load menu items.');
    } finally {
      setLoading(false);
    }
  };

  const fetchCustomizations = async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/v1/public/catering/sessions/${sessionId}/customizations`, { headers: authHeaders });
      if (res.ok) {
        const data = await res.json();
        setCustomizations(data || []);
      }
    } catch (e) {
      console.log(e);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchPackageItems();
    fetchCustomizations();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openSwapModal = async (item: PackageItem) => {
    setSwapTarget(item);
    setSwapOptions([]);
    setSwapModalVisible(true);
    setLoadingSwapOptions(true);
    try {
      const res = await fetch(`${BASE_URL}/api/v1/public/catering/items/${item.id}/swap-options`, { headers: authHeaders });
      const data = await res.json();
      const seen = new Set<string>();
      const unique = (data.options || []).filter((opt: SwapOption) => {
        if (seen.has(opt.name)) return false;
        seen.add(opt.name);
        return true;
      });
      setSwapOptions(unique);
    } catch (e) {
      setSwapOptions([]);
    } finally {
      setLoadingSwapOptions(false);
    }
  };

  const openAddModal = async () => {
    setAddModalVisible(true);
    setLoadingSwapOptions(true);
    try {
      const res = await fetch(`${BASE_URL}/api/v1/public/catering/items/add-options`, { headers: authHeaders });
      const data = await res.json();
      setAddOptions(data.options || []);
    } catch (e) {
      setAddOptions([]);
    } finally {
      setLoadingSwapOptions(false);
    }
  };

  const applySwap = async (option: SwapOption) => {
    if (!swapTarget) return;
    setSavingSwap(true);
    try {
      const existing = customizations.find(s => s.original_item_id === swapTarget.id);
      if (existing) {
        await fetch(`${BASE_URL}/api/v1/public/catering/sessions/${sessionId}/customizations/${existing.id}`, {
          method: 'DELETE',
          headers: authHeaders
        });
      }

      const res = await fetch(`${BASE_URL}/api/v1/public/catering/sessions/${sessionId}/customizations`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          action_type: 'REPLACE',
          original_item_id: swapTarget.id,
          new_item_id: option.id
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to save swap');
      }

      fetchCustomizations();
      setSwapModalVisible(false);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to apply swap');
    } finally {
      setSavingSwap(false);
    }
  };

  const applyAdd = async (option: SwapOption) => {
    setSavingSwap(true);
    try {
      const res = await fetch(`${BASE_URL}/api/v1/public/catering/sessions/${sessionId}/customizations`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          action_type: 'ADD',
          new_item_id: option.id
        })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to add item');
      }
      fetchCustomizations();
      setAddModalVisible(false);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to add item');
    } finally {
      setSavingSwap(false);
    }
  };

  const applyRemove = async (item: PackageItem) => {
    try {
      const existing = customizations.find(s => s.original_item_id === item.id);
      if (existing) {
        await fetch(`${BASE_URL}/api/v1/public/catering/sessions/${sessionId}/customizations/${existing.id}`, {
          method: 'DELETE',
          headers: authHeaders
        });
      }
      const res = await fetch(`${BASE_URL}/api/v1/public/catering/sessions/${sessionId}/customizations`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          action_type: 'REMOVE',
          original_item_id: item.id
        })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to remove item');
      }
      fetchCustomizations();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to remove item');
    }
  };

  const revertCustomization = async (customizationId: number) => {
    try {
      await fetch(`${BASE_URL}/api/v1/public/catering/sessions/${sessionId}/customizations/${customizationId}`, {
        method: 'DELETE',
        headers: authHeaders
      });
      fetchCustomizations();
    } catch (e) {
      Alert.alert('Error', 'Failed to undo');
    }
  };

  const getCustomizationForOriginal = (itemId: number) => customizations.find(s => s.original_item_id === itemId);
  const addedItems = customizations.filter(c => c.action_type === 'ADD');

  const totalPriceAdjustment = customizations.reduce((sum, s) => sum + s.price_adjustment_per_person * guestCount, 0);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#000" />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.stepText}>STEP 3 OF 6</Text>
          <Text style={styles.headerTitle}>Customise Menu</Text>
        </View>
        <MaterialCommunityIcons name="leaf" size={24} color="#8bc34a" />
      </View>

      {/* Progress */}
      <View style={styles.progressBar}>
        {[1, 2, 3, 4, 5, 6].map(i => (
          <View key={i} style={[styles.progressSeg, i <= 3 && styles.progressActive]} />
        ))}
      </View>

      {/* Package Summary */}
      <View style={styles.pkgSummary}>
        <View style={{ flex: 1 }}>
          <Text style={styles.pkgName}>{packageName}</Text>
          <Text style={styles.pkgMeta}>{guestCount} Guests • Rs. {packagePrice} / person</Text>
        </View>
        <Text style={styles.pkgTotal}>Rs. {((packagePrice * guestCount) + totalPriceAdjustment).toLocaleString()}</Text>
      </View>

      <View style={styles.swapHint}>
        <Text style={styles.swapHintText}>You can customize the package. ADD, REMOVE, or SWAP traditional items to match your preference.</Text>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#ff4500" style={{ marginTop: 50 }} />
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
          {categories.map(cat => (
            <View key={cat.name} style={styles.categoryBlock}>
              <Text style={styles.categoryTitle}>{cat.name.toUpperCase()}</Text>
              {cat.items.map(item => {
                const customization = getCustomizationForOriginal(item.id);
                return (
                  <View key={item.id} style={[styles.itemRow, customization && styles.itemRowSwapped]}>
                    <View style={styles.vegBox}>
                      <View style={styles.vegDot} />
                    </View>
                    <View style={{ flex: 1 }}>
                      {customization?.action_type === 'REPLACE' ? (
                        <View>
                          <Text style={styles.itemNameCrossed}>{item.name}</Text>
                          <View style={styles.swapArrowRow}>
                            <Ionicons name="arrow-forward" size={12} color="#ff4500" style={{ marginRight: 4 }} />
                            <Text style={styles.swappedNewName}>{customization.new_item_name}</Text>
                            {customization.price_adjustment_per_person !== 0 && (
                              <Text style={styles.swapPriceTag}>
                                {customization.price_adjustment_per_person > 0 ? '+' : ''}Rs. {customization.price_adjustment_per_person}/pp
                              </Text>
                            )}
                          </View>
                        </View>
                      ) : customization?.action_type === 'REMOVE' ? (
                        <View>
                           <Text style={styles.itemNameCrossed}>{item.name}</Text>
                           <View style={styles.swapArrowRow}>
                             <Text style={styles.swappedNewName}>Removed</Text>
                             <Text style={[styles.swapPriceTag, { backgroundColor: '#e0ffe0', color: '#4CAF50' }]}>
                                {customization.price_adjustment_per_person > 0 ? '+' : ''}Rs. {customization.price_adjustment_per_person}/pp
                              </Text>
                           </View>
                        </View>
                      ) : (
                        <Text style={styles.itemName}>{item.name}</Text>
                      )}
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      {!customization && item.is_swappable && (
                        <TouchableOpacity style={[styles.actionBtn, { borderColor: '#ff4500', marginRight: 8 }]} onPress={() => openSwapModal(item)}>
                          <Text style={[styles.actionBtnText, { color: '#ff4500' }]}>SWAP</Text>
                        </TouchableOpacity>
                      )}
                      {!customization && item.is_removable && (
                        <TouchableOpacity style={[styles.actionBtn, { borderColor: '#888' }]} onPress={() => applyRemove(item)}>
                          <Text style={[styles.actionBtnText, { color: '#888' }]}>REMOVE</Text>
                        </TouchableOpacity>
                      )}
                      {customization && (
                        <TouchableOpacity style={styles.revertBtn} onPress={() => revertCustomization(customization.id)}>
                          <Ionicons name="refresh" size={12} color="#666" />
                          <Text style={styles.revertBtnText}>Undo</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          ))}
          
          {/* Added items section */}
          {addedItems.length > 0 && (
             <View style={styles.categoryBlock}>
                <Text style={[styles.categoryTitle, { color: '#ff4500' }]}>EXTRA ADDED ITEMS</Text>
                {addedItems.map(addItem => (
                  <View key={addItem.id} style={styles.itemRow}>
                    <View style={styles.vegBox}>
                      <View style={styles.vegDot} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemName}>{addItem.new_item_name}</Text>
                      <View style={styles.swapArrowRow}>
                          <Text style={styles.swapPriceTag}>
                            {addItem.price_adjustment_per_person > 0 ? '+' : ''}Rs. {addItem.price_adjustment_per_person}/pp
                          </Text>
                      </View>
                    </View>
                    <TouchableOpacity style={styles.revertBtn} onPress={() => revertCustomization(addItem.id)}>
                      <Ionicons name="refresh" size={12} color="#666" />
                      <Text style={styles.revertBtnText}>Undo</Text>
                    </TouchableOpacity>
                  </View>
                ))}
             </View>
          )}

          <TouchableOpacity style={styles.addBtnContainer} onPress={openAddModal}>
            <Ionicons name="add-circle-outline" size={20} color="#ff4500" style={{ marginRight: 6 }} />
            <Text style={styles.addBtnText}>ADD ITEM</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* Bottom Proceed */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom > 0 ? insets.bottom + 10 : 20 }]}>
        <TouchableOpacity style={styles.proceedBtn} onPress={() => {
          router.push({
            pathname: '/(main)/catering-add-extras',
            params: {
              sessionId,
              restaurantId: (params.restaurantId as string) || '',
              restaurantName: (params.restaurantName as string) || '',
              packageName,
              guestCount: guestCount.toString(),
              packagePrice: packagePrice.toString(),
              eventName: params.eventName,
              date: params.date,
              time: params.time,
              serviceType: params.serviceType,
              address: params.address,
            }
          });
        }}>
          <Text style={styles.proceedBtnText}>Continue to Add Extras</Text>
        </TouchableOpacity>
      </View>

      {/* Swap Modal */}
      <Modal visible={swapModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Swap: {swapTarget?.name}</Text>
              <TouchableOpacity onPress={() => setSwapModalVisible(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSubtitle}>Choose an alternative item</Text>

            {loadingSwapOptions ? (
              <ActivityIndicator size="large" color="#ff4500" style={{ marginVertical: 30 }} />
            ) : swapOptions.length === 0 ? (
              <Text style={styles.noOptionsText}>No swap options available for this item.</Text>
            ) : (
              <ScrollView style={{ maxHeight: 320 }}>
                {swapOptions.map(opt => (
                  <TouchableOpacity key={opt.id} style={styles.swapOptionRow} onPress={() => applySwap(opt)} disabled={savingSwap}>
                    <View style={styles.vegBox}>
                      <View style={styles.vegDot} />
                    </View>
                    <Text style={styles.swapOptionName}>{opt.name}</Text>
                    {opt.price_change_per_person !== 0 && (
                      <Text style={[styles.priceChange, { color: opt.price_change_per_person > 0 ? '#ff4500' : '#4CAF50' }]}>
                        {opt.price_change_per_person > 0 ? '+' : ''}Rs. {opt.price_change_per_person}/person
                      </Text>
                    )}
                    {savingSwap ? <ActivityIndicator size="small" color="#ff4500" style={{ marginLeft: 8 }} /> : null}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Add Modal */}
      <Modal visible={addModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Extra Item</Text>
              <TouchableOpacity onPress={() => setAddModalVisible(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSubtitle}>Choose an item to add to your package</Text>

            {loadingSwapOptions ? (
              <ActivityIndicator size="large" color="#ff4500" style={{ marginVertical: 30 }} />
            ) : addOptions.length === 0 ? (
              <Text style={styles.noOptionsText}>No items available to add.</Text>
            ) : (
              <ScrollView style={{ maxHeight: 320 }}>
                {addOptions.map(opt => (
                  <TouchableOpacity key={opt.id} style={styles.swapOptionRow} onPress={() => applyAdd(opt)} disabled={savingSwap}>
                    <View style={styles.vegBox}>
                      <View style={styles.vegDot} />
                    </View>
                    <Text style={styles.swapOptionName}>{opt.name}</Text>
                    {opt.price_change_per_person !== 0 && (
                      <Text style={[styles.priceChange, { color: '#ff4500' }]}>
                        +Rs. {opt.price_change_per_person}/person
                      </Text>
                    )}
                    {savingSwap ? <ActivityIndicator size="small" color="#ff4500" style={{ marginLeft: 8 }} /> : null}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
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
  pkgSummary: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: '#fff', marginBottom: 4 },
  pkgName: { fontSize: 16, fontWeight: 'bold', color: '#222' },
  pkgMeta: { fontSize: 12, color: '#888', marginTop: 2 },
  pkgTotal: { fontSize: 18, fontWeight: 'bold', color: '#ff4500' },
  swapHint: { backgroundColor: '#fff7f4', paddingHorizontal: 20, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#ffe0d0' },
  swapHintText: { fontSize: 12, color: '#cc4400', lineHeight: 18 },
  categoryBlock: { marginTop: 16, paddingHorizontal: 20 },
  categoryTitle: { fontSize: 11, fontWeight: '800', color: '#888', letterSpacing: 1, marginBottom: 10 },
  itemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f5f5f5' },
  itemRowSwapped: { backgroundColor: '#fffaf8', borderRadius: 8, paddingHorizontal: 8, marginBottom: 2, borderBottomWidth: 0, borderWidth: 1, borderColor: '#ffe0cc' },
  vegBox: { width: 14, height: 14, borderWidth: 1, borderColor: '#4CAF50', alignItems: 'center', justifyContent: 'center', marginRight: 10, borderRadius: 2 },
  vegDot: { width: 6, height: 6, backgroundColor: '#4CAF50', borderRadius: 3 },
  itemName: { fontSize: 14, color: '#333', fontWeight: '500' },
  itemNameCrossed: { fontSize: 13, color: '#bbb', textDecorationLine: 'line-through', fontWeight: '400' },
  swapArrowRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  swappedNewName: { fontSize: 14, fontWeight: '700', color: '#ff4500' },
  swapPriceTag: { fontSize: 11, color: '#ff6633', marginLeft: 6, fontWeight: '600', backgroundColor: '#ffe8e0', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  actionBtn: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 6, borderWidth: 1 },
  actionBtnText: { fontSize: 11, fontWeight: 'bold' },
  revertBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, borderWidth: 1, borderColor: '#ccc', backgroundColor: '#f9f9f9' },
  revertBtnText: { fontSize: 12, fontWeight: '600', color: '#666', marginLeft: 3 },
  addBtnContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 24, padding: 14, borderWidth: 1, borderColor: '#ff4500', borderRadius: 12, borderStyle: 'dashed' },
  addBtnText: { fontSize: 14, fontWeight: 'bold', color: '#ff4500' },
  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#fff', padding: 20, borderTopWidth: 1, borderTopColor: '#eee', elevation: 8 },
  proceedBtn: { backgroundColor: '#ff4500', paddingVertical: 15, borderRadius: 12, alignItems: 'center' },
  proceedBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalBox: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  modalTitle: { fontSize: 17, fontWeight: 'bold', color: '#222', flex: 1 },
  modalSubtitle: { fontSize: 13, color: '#888', marginBottom: 16 },
  noOptionsText: { textAlign: 'center', color: '#aaa', padding: 30, fontSize: 14 },
  swapOptionRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  swapOptionName: { flex: 1, fontSize: 14, color: '#333', fontWeight: '500' },
  priceChange: { fontSize: 13, fontWeight: '700', marginLeft: 8 },
});

