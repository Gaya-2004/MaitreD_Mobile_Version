import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDineInSessionStore } from '../store/useDineInSessionStore';
import { dineInSessionApi } from '../services/apiService';

interface DineInActiveBannerProps {
  bottomOffset?: number;
}

export default function DineInActiveBanner({ bottomOffset }: DineInActiveBannerProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    isActive,
    tableNumber,
    activeOrderId,
    activeDbOrderId,
    orderRounds,
    sessionUid,
    sessionDbId,
    completeDineInSession,
    syncSessionDetails,
  } = useDineInSessionStore();

  const [isSettleModalVisible, setIsSettleModalVisible] = useState(false);

  // ── Sync session state with backend to detect cancelled orders / completed sessions ──
  useEffect(() => {
    const sKey = sessionDbId || sessionUid;
    if (!isActive || !sKey) return;

    let isMounted = true;
    const syncStatus = async () => {
      try {
        const data = await dineInSessionApi.getSessionDetails(sKey);
        if (!isMounted || !data) return;

        const isCancelled = (data.status || '').toUpperCase() === 'CANCELLED';
        const isPaid = (data.paymentStatus || '').toLowerCase() === 'paid';
        const isCompleted = (data.status || '').toUpperCase() === 'COMPLETED';

        const backendActive = (data.orders || []).filter(
          (o: any) => (o.status || '').toUpperCase() !== 'CANCELLED'
        );

        if (isCancelled || isPaid || isCompleted || ((data.orders || []).length > 0 && backendActive.length === 0)) {
          // All orders in session have been cancelled or paid
          completeDineInSession();
          return;
        }

        syncSessionDetails({
          sessionId: data.sessionId,
          sessionUid: data.sessionUid,
          tableNumber: data.tableNumber,
          totalAmount: data.totalAmount,
          paymentStatus: data.paymentStatus,
          status: data.status,
          orders: data.orders || [],
          allItems: data.allItems || [],
        });
      } catch (err) {
        // Silently ignore background poll errors
      }
    };

    syncStatus();
    const timer = setInterval(syncStatus, 5000);
    return () => {
      isMounted = false;
      clearInterval(timer);
    };
  }, [isActive, sessionDbId, sessionUid]);

  // ── Derive active (non-cancelled) items and total from rounds ──────────────
  const activeRounds = (orderRounds || []).filter(
    (r: any) => (r.status || '').toUpperCase() !== 'CANCELLED'
  );

  // If session is not active or all rounds are cancelled, hide the banner completely
  if (!isActive || !activeOrderId || activeRounds.length === 0) {
    return null;
  }

  const activeItems: any[] = activeRounds.flatMap((r: any) =>
    (r.items || []).filter((item: any) => (item.status || '').toUpperCase() !== 'CANCELLED')
  );
  const activeTotalAmount = activeRounds.reduce(
    (sum: number, r: any) => sum + (Number(r.total_amount) || 0),
    0
  );

  // If active rounds have total <= 0, hide banner
  if (activeTotalAmount <= 0) {
    return null;
  }

  const displayItems = activeItems;
  const displayTotal = activeTotalAmount;
  const displayItemCount = displayItems.reduce((sum: number, i: any) => sum + (Number(i.quantity || i.qty || 1)), 0);

  const defaultBottom = (Platform.OS === 'android' ? 68 : 60) + insets.bottom + 10;
  const computedBottom = bottomOffset !== undefined ? bottomOffset : defaultBottom;

  const latestActiveRound = activeRounds[activeRounds.length - 1];
  const roundStatus = (latestActiveRound?.status || 'In Kitchen').replace(/_/g, ' ');
  const bannerOrderId = latestActiveRound?.orderId || activeOrderId;

  const handleOrderMore = () => {
    setIsSettleModalVisible(false);
    router.replace({
      pathname: '/menu',
      params: {
        orderType: 'Dine In',
        tableNumber: tableNumber || '',
      },
    });
  };

  const handleNavigateToPayment = () => {
    setIsSettleModalVisible(false);
    router.push({
      pathname: '/(checkout)/payment',
      params: {
        isDineInSettlement: 'true',
        orderId: activeOrderId,
        dbOrderId: activeDbOrderId ? String(activeDbOrderId) : '',
        tableNumber: tableNumber || 'T-01',
        totalAmount: String(displayTotal),
        cartItems: JSON.stringify(displayItems),
      },
    });
  };

  return (
    <>
      {/* Floating Active Dine-In Bar */}
      <View style={[styles.bannerContainer, { bottom: computedBottom }]}>
        <View style={styles.bannerCard}>
          <View style={styles.bannerLeft}>
            <View style={styles.tableBadge}>
              <Ionicons name="restaurant" size={14} color="#00a01d" />
              <Text style={styles.tableBadgeText}>{tableNumber || 'Table'}</Text>
            </View>
            <View style={styles.infoCol}>
              <Text style={styles.orderIdText}>{bannerOrderId} • {roundStatus}</Text>
              <Text style={styles.totalText}>
                {displayItemCount} item{displayItemCount !== 1 ? 's' : ''} • Rs.{' '}
                {displayTotal.toFixed(0)}
              </Text>
            </View>
          </View>

          <View style={styles.actionsRight}>
            <TouchableOpacity
              style={styles.orderMoreBtn}
              onPress={handleOrderMore}
              activeOpacity={0.8}
            >
              <Ionicons name="add-circle-outline" size={14} color="#ff3400" />
              <Text style={styles.orderMoreBtnText}>Order More</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.completeBtn}
              onPress={() => setIsSettleModalVisible(true)}
              activeOpacity={0.8}
            >
              <Text style={styles.completeBtnText}>Pay Bill</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Bill Settlement Modal */}
      <Modal
        visible={isSettleModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsSettleModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setIsSettleModalVisible(false)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.bottomSheet}>
            <View style={styles.dragHandle} />

            <View style={styles.sheetHeader}>
              <View>
                <Text style={styles.sheetTitle}>Complete Meal & Pay</Text>
                <Text style={styles.sheetSub}>
                  {tableNumber || 'Table'} • Order #{activeOrderId}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setIsSettleModalVisible(false)}
                style={styles.closeModalBtn}
              >
                <Ionicons name="close" size={20} color="#666" />
              </TouchableOpacity>
            </View>

            <Text style={styles.sectionHeading}>Items Ordered in this Session</Text>
            {displayItems.length === 0 ? (
              <View style={{ paddingVertical: 20, alignItems: 'center' }}>
                <Ionicons name="checkmark-circle-outline" size={36} color="#aaa" />
                <Text style={{ color: '#aaa', fontSize: 14, marginTop: 8, textAlign: 'center' }}>
                  All items have been cancelled.
                </Text>
              </View>
            ) : (
              <ScrollView
                style={styles.itemsScroll}
                contentContainerStyle={{ paddingBottom: 8 }}
                showsVerticalScrollIndicator={false}
              >
                {displayItems.map((item: any, index: number) => (
                  <View key={`${item.id}-${index}`} style={styles.billItemRow}>
                    <View style={styles.billItemLeft}>
                      <Text style={styles.billItemQty}>{item.quantity || item.qty || 1}x</Text>
                      <Text style={styles.billItemName} numberOfLines={1}>
                        {item.name || item.itemName || 'Item'}
                      </Text>
                    </View>
                    <Text style={styles.billItemPrice}>
                      Rs. {(Number(item.price || item.unit_price || 0) * (item.quantity || item.qty || 1)).toFixed(0)}
                    </Text>
                  </View>
                ))}
              </ScrollView>
            )}

            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Grand Total Due</Text>
              <Text style={[styles.totalValue, displayTotal === 0 && { color: '#00a01d' }]}>
                Rs. {displayTotal.toFixed(0)}
              </Text>
            </View>

            <View style={styles.sheetActions}>
              <TouchableOpacity
                style={styles.orderMoreSheetBtn}
                onPress={handleOrderMore}
                activeOpacity={0.8}
              >
                <Ionicons name="fast-food-outline" size={16} color="#ff3400" />
                <Text style={styles.orderMoreSheetBtnText}>Order More Food</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.payNowBtn, displayTotal === 0 && { opacity: 0.5 }]}
                onPress={handleNavigateToPayment}
                activeOpacity={0.85}
                disabled={displayTotal === 0}
              >
                <Ionicons name="arrow-forward-circle-outline" size={18} color="#fff" />
                <Text style={styles.payNowBtnText}>
                  Pay & Complete Meal (Rs. {displayTotal.toFixed(0)})
                </Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  bannerContainer: {
    position: 'absolute',
    left: 14,
    right: 14,
    zIndex: 98,
  },
  bannerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1e1e1e',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    borderWidth: 1,
    borderColor: '#333',
  },
  bannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  tableBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e8f5e9',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    gap: 4,
  },
  tableBadgeText: {
    color: '#00a01d',
    fontWeight: 'bold',
    fontSize: 12,
  },
  infoCol: {
    flex: 1,
  },
  orderIdText: {
    color: '#aaa',
    fontSize: 11,
    fontWeight: '600',
  },
  totalText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: 'bold',
    marginTop: 2,
  },
  actionsRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  orderMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#fff0eb',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 14,
  },
  orderMoreBtnText: {
    color: '#ff3400',
    fontSize: 11,
    fontWeight: '700',
  },
  completeBtn: {
    backgroundColor: '#00a01d',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 14,
  },
  completeBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },

  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  bottomSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '85%',
  },
  dragHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#e0e0e0',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 14,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111',
  },
  sheetSub: {
    fontSize: 12,
    color: '#777',
    marginTop: 2,
  },
  closeModalBtn: {
    padding: 6,
  },
  sectionHeading: {
    fontSize: 13,
    fontWeight: '700',
    color: '#555',
    marginBottom: 8,
    marginTop: 4,
  },
  itemsScroll: {
    maxHeight: 180,
    marginBottom: 12,
  },
  billItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#f7f7f7',
  },
  billItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  billItemQty: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#ff3400',
    width: 24,
  },
  billItemName: {
    fontSize: 13,
    color: '#222',
    flex: 1,
  },
  billItemPrice: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f9f9f9',
    padding: 12,
    borderRadius: 12,
    marginBottom: 14,
  },
  totalLabel: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#111',
  },
  totalValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#00a01d',
  },
  paymentMethodsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  paymentOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    backgroundColor: '#fff',
  },
  paymentOptionActive: {
    borderColor: '#00a01d',
    backgroundColor: '#e8f5e9',
  },
  paymentOptionText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#666',
  },
  paymentOptionTextActive: {
    color: '#00a01d',
    fontWeight: 'bold',
  },
  sheetActions: {
    gap: 10,
  },
  orderMoreSheetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#ff3400',
    backgroundColor: '#fff',
  },
  orderMoreSheetBtnText: {
    color: '#ff3400',
    fontSize: 14,
    fontWeight: 'bold',
  },
  payNowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#00a01d',
    borderRadius: 24,
    paddingVertical: 14,
  },
  payNowBtnDisabled: {
    opacity: 0.6,
  },
  payNowBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 'bold',
  },
});
