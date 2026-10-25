import { API_BASE_URL } from '../../constants/api';
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, Platform, StatusBar, ActivityIndicator, Alert, Modal } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '../../store/useAuthStore';
import { useRestaurantStore } from '../../store/useRestaurantStore';
import { useCateringSessionStore } from '../../store/useCateringSessionStore';

interface CateringPackage {
  name: string;
  code: string;
  price: number;
  minimum_order_quantity: number;
  is_available: boolean;
  items_summary: string | null;
  items?: string[];
}

export default function ChoosePackage() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const auth = useAuthStore();
  
  const TABS = ['All', 'Breakfast', 'Lunch', 'Dinner', 'Evening Tiffin'];
  const TAB_KEYWORDS: Record<string, string[]> = {
    'All': [],
    'Breakfast': ['breakfast', 'idly', 'idli', 'dosa', 'vada', 'upma', 'pongal', 'poori'],
    'Lunch': ['lunch', 'rice', 'variety'],
    'Dinner': ['dinner', 'feast', 'grand', 'special'],
    'Evening Tiffin': ['tiffin', 'evening', 'snack', 'tea'],
  };

  const [activeTab, setActiveTab] = useState('All');
  const [packages, setPackages] = useState<CateringPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPackage, setSelectedPackage] = useState<string | null>(null);
  const [creatingSession, setCreatingSession] = useState(false);

  // Show more / Items modal states
  const [expandedPackages, setExpandedPackages] = useState<Record<string, boolean>>({});
  const [modalPackage, setModalPackage] = useState<CateringPackage | null>(null);
  const [modalCategories, setModalCategories] = useState<{ name: string; items: { id: number; name: string }[] }[]>([]);
  const [loadingModalItems, setLoadingModalItems] = useState(false);
  const [packageItemsCache, setPackageItemsCache] = useState<Record<string, { name: string; items: { id: number; name: string }[] }[]>>({});

  const toggleExpand = async (pkg: CateringPackage) => {
    const nextState = !expandedPackages[pkg.code];
    setExpandedPackages(prev => ({
      ...prev,
      [pkg.code]: nextState
    }));

    if ((!pkg.items || pkg.items.length === 0) && !packageItemsCache[pkg.code]) {
      try {
        const res = await fetch(`${API_BASE_URL}/api/v1/public/catering/packages/${encodeURIComponent(pkg.code)}/items`);
        if (res.ok) {
          const data = await res.json();
          setPackageItemsCache(prev => ({
            ...prev,
            [pkg.code]: data.categories || []
          }));
        }
      } catch (err) {
        console.error('Error fetching package items:', err);
      }
    }
  };

  const openPackageModal = async (pkg: CateringPackage) => {
    setModalPackage(pkg);
    if (packageItemsCache[pkg.code]) {
      setModalCategories(packageItemsCache[pkg.code]);
      return;
    }

    setLoadingModalItems(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/public/catering/packages/${encodeURIComponent(pkg.code)}/items`);
      if (res.ok) {
        const data = await res.json();
        const cats = data.categories || [];
        setModalCategories(cats);
        setPackageItemsCache(prev => ({
          ...prev,
          [pkg.code]: cats
        }));
      } else {
        setModalCategories([]);
      }
    } catch (err) {
      console.error('Error fetching package categories:', err);
      setModalCategories([]);
    } finally {
      setLoadingModalItems(false);
    }
  };

  const getPackageItems = (pkg: CateringPackage): string[] => {
    if (pkg.items && pkg.items.length > 0) {
      return pkg.items;
    }
    if (packageItemsCache[pkg.code] && packageItemsCache[pkg.code].length > 0) {
      return packageItemsCache[pkg.code].flatMap(cat => cat.items.map(i => i.name));
    }
    if (pkg.items_summary) {
      return pkg.items_summary.split(',').map(s => s.trim().replace(/^&\s*\d+\s*more$/i, '')).filter(Boolean);
    }
    return [];
  };

  const filteredPackages = activeTab === 'All'
    ? packages
    : packages.filter(pkg => {
        const keywords = TAB_KEYWORDS[activeTab] || [];
        const nameLower = pkg.name.toLowerCase();
        return keywords.some(kw => nameLower.includes(kw));
      });

  const fetchPackages = async () => {
    try {
      const baseUrl = API_BASE_URL;
      const response = await fetch(`${baseUrl}/api/v1/public/catering/packages`);
      const data = await response.json();
      setPackages(data);
    } catch (error) {
      console.error("Error fetching packages:", error);
      Alert.alert("Error", "Failed to load packages. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchPackages();
   
  }, []);

  const handleProceed = async () => {
    if (!selectedPackage) return;
    
    setCreatingSession(true);
    try {
      const baseUrl = API_BASE_URL;
      const headers = {
        'Content-Type': 'application/json',
        ...(auth.token ? { 'Authorization': `Bearer ${auth.token}` } : {})
      };

      // 1. Resolve and include restaurant_id
      const { selectedOutlet } = useRestaurantStore.getState();
      const cateringStore = useCateringSessionStore.getState();
      const effectiveRestaurantId = Number(params.restaurantId) ||
        Number(cateringStore.restaurantId) ||
        Number(selectedOutlet?.restaurant_id) ||
        Number(selectedOutlet?.id) ||
        1;

      // 1. Create Session
      const sessionBody = {
        customer_id: auth.customerId || 1,
        restaurant_id: effectiveRestaurantId,
        package_code: selectedPackage,
        guest_count: parseInt(params.guestCount as string || '50', 10)
      };
      
      const createResponse = await fetch(`${baseUrl}/api/v1/public/catering/sessions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(sessionBody)
      });
      
      if (!createResponse.ok) {
        const err = await createResponse.json().catch(() => ({}));
        throw new Error(err.detail || "Failed to create session");
      }
      
      const sessionData = await createResponse.json();
      const sessionId = sessionData.id || sessionData.session_id;

      // 2. Patch Event Details
      const eventBody: any = {
        restaurant_id: effectiveRestaurantId,
        event_name: params.eventName,
        serving_time: params.time,
        occasion: params.occasion,
        service_type: params.serviceType,
      };
      // Convert date like "21 September 2026" => "2026-09-21"
      if (params.date) {
        const dateStr = params.date as string;
        const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        const parts = dateStr.split(" ");
        if (parts.length === 3) {
          const day = parts[0].padStart(2, '0');
          const monthIndex = months.indexOf(parts[1]);
          if (monthIndex !== -1) {
            const month = (monthIndex + 1).toString().padStart(2, '0');
            const year = parts[2];
            eventBody.event_date = `${year}-${month}-${day}`;
          }
        } else {
          // Fallback if it's already a standard format or another format
          try {
            const parsed = new Date(dateStr);
            if (!isNaN(parsed.getTime())) {
              eventBody.event_date = parsed.toISOString().split('T')[0];
            }
          } catch {}
        }
      }
      
      await fetch(`${baseUrl}/api/v1/public/catering/sessions/${sessionId}/event`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(eventBody)
      });
      
      // Navigate to Step 3 - Customise Menu
      router.push({
        pathname: '/(main)/catering-customise-menu',
        params: {
          sessionId: sessionId.toString(),
          restaurantId: effectiveRestaurantId.toString(),
          restaurantName: (params.restaurantName as string) || selectedOutlet?.name || 'Data Udipi',
          packageCode: selectedPackage,
          guestCount: params.guestCount,
          packagePrice: packages.find(p => p.code === selectedPackage)?.price?.toString() || '0',
          packageName: packages.find(p => p.code === selectedPackage)?.name || '',
          eventName: params.eventName,
          date: params.date,
          time: params.time,
          serviceType: params.serviceType,
          address: params.address,
        }
      });

    } catch (error: any) {
      console.error("Error creating session:", error);
      Alert.alert("Error", error.message || "Failed to start session. Please try again.");
    } finally {
      setCreatingSession(false);
    }
  };


  const renderTabs = () => (
    <View style={styles.tabContainer}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabScroll}>
        {TABS.map(tab => (
          <TouchableOpacity 
            key={tab} 
            style={[styles.tabBtn, activeTab === tab && styles.tabBtnActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>{tab}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color="#000" />
        </TouchableOpacity>
        <View style={styles.headerTextContainer}>
          <Text style={styles.stepText}>STEP 2 OF 6</Text>
          <Text style={styles.headerTitle}>Choose a Package</Text>
        </View>
        <MaterialCommunityIcons name="leaf" size={24} color="#8bc34a" style={styles.leafIcon} />
      </View>

      {/* Progress Bar */}
      <View style={styles.progressContainer}>
        <View style={[styles.progressSegment, styles.progressActive]} />
        <View style={[styles.progressSegment, styles.progressActive]} />
        <View style={styles.progressSegment} />
        <View style={styles.progressSegment} />
        <View style={styles.progressSegment} />
        <View style={styles.progressSegment} />
      </View>

      {renderTabs()}

      <View style={styles.minOrderContainer}>
        <Text style={styles.minOrderText}>Minimum order: 50 guests</Text>
      </View>

      {loading ? (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color="#ff4500" />
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          {filteredPackages.length === 0 ? (
            <View style={{ alignItems: 'center', paddingTop: 60 }}>
              <MaterialCommunityIcons name="food-off" size={48} color="#ddd" />
              <Text style={{ color: '#aaa', marginTop: 12, fontSize: 14 }}>No packages available for {activeTab}</Text>
            </View>
          ) : filteredPackages.map((pkg) => {
            const isSelected = selectedPackage === pkg.code;
            const isExpanded = !!expandedPackages[pkg.code];
            const allItems = getPackageItems(pkg);

            return (
              <View 
                key={pkg.code} 
                style={[styles.card, isSelected && styles.cardSelected]}
              >
                <TouchableOpacity 
                  style={styles.cardHeader}
                  activeOpacity={0.8}
                  onPress={() => setSelectedPackage(isSelected ? null : pkg.code)}
                >
                  <View style={styles.vegIcon}>
                    <View style={styles.vegDot} />
                  </View>
                  <Text style={styles.pkgTitle}>{pkg.name}</Text>
                  {isSelected && <Ionicons name="checkmark-circle" size={20} color="#ff4500" style={{ marginLeft: 6 }} />}
                </TouchableOpacity>
                
                {!isExpanded ? (
                  <View style={styles.summaryContainer}>
                    <Text style={styles.pkgItems}>{pkg.items_summary || 'Variety of items'}</Text>
                    
                    <View style={styles.actionLinksRow}>
                      <TouchableOpacity 
                        style={styles.showMoreBtn}
                        onPress={() => toggleExpand(pkg)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.showMoreText}>Show more</Text>
                        <Ionicons name="chevron-down" size={14} color="#ff4500" style={{ marginLeft: 3 }} />
                      </TouchableOpacity>

                      <TouchableOpacity 
                        style={styles.viewAllBtn}
                        onPress={() => openPackageModal(pkg)}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="eye-outline" size={13} color="#666" style={{ marginRight: 4 }} />
                        <Text style={styles.viewAllText}>View all items</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <View style={styles.expandedContainer}>
                    <View style={styles.expandedTitleRow}>
                      <View style={styles.allCountBadge}>
                        <Ionicons name="restaurant-outline" size={13} color="#ff4500" style={{ marginRight: 4 }} />
                        <Text style={styles.allCountBadgeText}>
                          All Items ({allItems.length > 0 ? allItems.length : 'Menu'})
                        </Text>
                      </View>
                      
                      <TouchableOpacity 
                        style={styles.showMoreBtn}
                        onPress={() => toggleExpand(pkg)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.showMoreText}>Show less</Text>
                        <Ionicons name="chevron-up" size={14} color="#ff4500" style={{ marginLeft: 3 }} />
                      </TouchableOpacity>
                    </View>

                    <View style={styles.itemChipsContainer}>
                      {allItems.length > 0 ? (
                        allItems.map((item, idx) => (
                          <View key={`${item}-${idx}`} style={styles.itemChip}>
                            <View style={styles.itemChipDot} />
                            <Text style={styles.itemChipText}>{item}</Text>
                          </View>
                        ))
                      ) : (
                        <Text style={styles.pkgItems}>{pkg.items_summary || 'No items listed'}</Text>
                      )}
                    </View>

                    <TouchableOpacity 
                      style={styles.viewDetailsModalLink}
                      onPress={() => openPackageModal(pkg)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="layers-outline" size={13} color="#ff4500" style={{ marginRight: 5 }} />
                      <Text style={styles.viewDetailsModalLinkText}>View full category breakdown</Text>
                      <Ionicons name="arrow-forward" size={11} color="#ff4500" style={{ marginLeft: 3 }} />
                    </TouchableOpacity>
                  </View>
                )}
                
                <View style={styles.cardFooter}>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => setSelectedPackage(isSelected ? null : pkg.code)}
                  >
                    <Text style={styles.priceText}>
                      Rs. {pkg.price} <Text style={styles.perPerson}>/ person</Text>
                    </Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity 
                    style={[styles.selectBtn, isSelected && styles.selectBtnActive]}
                    onPress={() => setSelectedPackage(isSelected ? null : pkg.code)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.selectBtnText, isSelected && styles.selectBtnTextActive]}>
                      {isSelected ? 'Selected ✓' : 'Select'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}

      {selectedPackage && (
        <View style={[styles.bottomContainer, { paddingBottom: insets.bottom > 0 ? insets.bottom + 10 : 20 }]}>
          <TouchableOpacity style={styles.proceedBtn} onPress={handleProceed} disabled={creatingSession}>
            {creatingSession ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.proceedBtnText}>Proceed</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Package Items Detail Modal */}
      <Modal
        visible={!!modalPackage}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalPackage(null)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity 
            style={styles.modalBackdrop} 
            activeOpacity={1} 
            onPress={() => setModalPackage(null)} 
          />
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom > 0 ? insets.bottom + 15 : 25 }]}>
            <View style={styles.modalHandle} />

            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={styles.vegIcon}>
                    <View style={styles.vegDot} />
                  </View>
                  <Text style={styles.modalTitle}>{modalPackage?.name}</Text>
                </View>
                <Text style={styles.modalSubtitle}>
                  Rs. {modalPackage?.price} / person • Min. {modalPackage?.minimum_order_quantity || 50} guests
                </Text>
              </View>
              <TouchableOpacity 
                style={styles.modalCloseBtn}
                onPress={() => setModalPackage(null)}
              >
                <Ionicons name="close" size={22} color="#555" />
              </TouchableOpacity>
            </View>

            {loadingModalItems ? (
              <View style={styles.modalLoader}>
                <ActivityIndicator size="small" color="#ff4500" />
                <Text style={styles.modalLoaderText}>Loading menu items...</Text>
              </View>
            ) : (
              <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
                {modalCategories.length > 0 ? (
                  modalCategories.map((cat, idx) => (
                    <View key={`${cat.name}-${idx}`} style={styles.categorySection}>
                      <Text style={styles.categoryTitle}>{cat.name}</Text>
                      <View style={styles.categoryItemsList}>
                        {cat.items.map((item, itemIdx) => (
                          <View key={`${item.id || itemIdx}`} style={styles.modalItemRow}>
                            <Ionicons name="checkmark-circle" size={16} color="#4CAF50" style={{ marginRight: 8 }} />
                            <Text style={styles.modalItemName}>{item.name}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  ))
                ) : (
                  <View style={styles.categorySection}>
                    <Text style={styles.categoryTitle}>Included Items</Text>
                    <View style={styles.categoryItemsList}>
                      {(modalPackage ? getPackageItems(modalPackage) : []).map((item, idx) => (
                        <View key={`${item}-${idx}`} style={styles.modalItemRow}>
                          <Ionicons name="checkmark-circle" size={16} color="#4CAF50" style={{ marginRight: 8 }} />
                          <Text style={styles.modalItemName}>{item}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}
              </ScrollView>
            )}

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[
                  styles.modalSelectBtn,
                  selectedPackage === modalPackage?.code && styles.modalSelectBtnActive
                ]}
                onPress={() => {
                  if (modalPackage) {
                    setSelectedPackage(modalPackage.code);
                    setModalPackage(null);
                  }
                }}
              >
                <Text style={[
                  styles.modalSelectBtnText,
                  selectedPackage === modalPackage?.code && styles.modalSelectBtnTextActive
                ]}>
                  {selectedPackage === modalPackage?.code ? 'Selected Package ✓' : 'Select This Package'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fafafa',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: '#fff',
  },
  backButton: {
    marginRight: 15,
  },
  headerTextContainer: {
    flex: 1,
  },
  stepText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#ff4500',
    letterSpacing: 1,
    marginBottom: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  leafIcon: {
    marginLeft: 10,
  },
  progressContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingBottom: 15,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  progressSegment: {
    flex: 1,
    height: 4,
    backgroundColor: '#f0f0f0',
    borderRadius: 2,
    marginHorizontal: 2,
  },
  progressActive: {
    backgroundColor: '#ff4500',
  },
  tabContainer: {
    backgroundColor: '#fff',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  tabScroll: {
    paddingHorizontal: 15,
  },
  tabBtn: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    marginHorizontal: 5,
    backgroundColor: '#fff',
  },
  tabBtnActive: {
    backgroundColor: '#ff4500',
    borderColor: '#ff4500',
  },
  tabText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#fff',
  },
  minOrderContainer: {
    paddingHorizontal: 20,
    paddingVertical: 15,
  },
  minOrderText: {
    fontSize: 14,
    color: '#777',
    fontWeight: '600',
  },
  loaderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 100,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#eee',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  cardSelected: {
    borderColor: '#ff4500',
    borderWidth: 1.5,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  vegIcon: {
    width: 14,
    height: 14,
    borderWidth: 1,
    borderColor: '#4CAF50',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    borderRadius: 2,
  },
  vegDot: {
    width: 6,
    height: 6,
    backgroundColor: '#4CAF50',
    borderRadius: 3,
  },
  pkgTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#222',
  },
  pkgItems: {
    fontSize: 13,
    color: '#777',
    lineHeight: 18,
  },
  summaryContainer: {
    marginBottom: 12,
  },
  actionLinksRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  showMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingRight: 8,
  },
  showMoreText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ff4500',
  },
  viewAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: '#f5f5f5',
    borderRadius: 6,
  },
  viewAllText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#555',
  },
  expandedContainer: {
    backgroundColor: '#fff9f5',
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#ffe6d5',
  },
  expandedTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  allCountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  allCountBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ff4500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  itemChipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -3,
    marginBottom: 8,
  },
  itemChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ffd5b5',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    margin: 3,
  },
  itemChipDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#4CAF50',
    marginRight: 6,
  },
  itemChipText: {
    fontSize: 12,
    color: '#333',
    fontWeight: '500',
  },
  viewDetailsModalLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#ffe6d5',
    marginTop: 4,
  },
  viewDetailsModalLinkText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ff4500',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    flex: 1,
  },
  modalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  modalHandle: {
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#ddd',
    alignSelf: 'center',
    marginBottom: 15,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#222',
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#777',
    marginTop: 4,
  },
  modalCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalScroll: {
    maxHeight: 380,
    marginVertical: 15,
  },
  modalLoader: {
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalLoaderText: {
    marginTop: 10,
    fontSize: 13,
    color: '#777',
  },
  categorySection: {
    marginBottom: 16,
  },
  categoryTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#444',
    marginBottom: 8,
    paddingLeft: 4,
  },
  categoryItemsList: {
    backgroundColor: '#fafafa',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#eee',
  },
  modalItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
  },
  modalItemName: {
    fontSize: 13,
    color: '#333',
    fontWeight: '500',
  },
  modalFooter: {
    paddingTop: 10,
  },
  modalSelectBtn: {
    backgroundColor: '#ff4500',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalSelectBtnActive: {
    backgroundColor: '#4CAF50',
  },
  modalSelectBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 'bold',
  },
  modalSelectBtnTextActive: {
    color: '#fff',
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  priceText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ff4500',
  },
  perPerson: {
    fontSize: 14,
    fontWeight: 'normal',
    color: '#888',
  },
  selectBtn: {
    paddingHorizontal: 20,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#ff4500',
    backgroundColor: '#fff',
  },
  selectBtnActive: {
    backgroundColor: '#ff4500',
  },
  selectBtnText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#ff4500',
  },
  selectBtnTextActive: {
    color: '#fff',
  },
  bottomContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  proceedBtn: {
    backgroundColor: '#ff4500',
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: 'center',
  },
  proceedBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  }
});

