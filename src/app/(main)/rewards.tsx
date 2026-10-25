import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform, StatusBar, Image, ActivityIndicator, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../store';
import { customerApi } from '../../services/apiService';
import BottomNavBar from '../../components/layout/BottomNavBar';
import { formatDateOnly } from '../../utils/dateUtils';

export default function Rewards() {
  const router = useRouter();
  const { customerId } = useAuthStore();
  const [loyaltyPoints, setLoyaltyPoints] = useState(0);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showHowItWorks, setShowHowItWorks] = useState(false);

  const fetchLoyalty = async () => {
    if (!customerId) return;
    try {
      setLoading(true);
      const res = await customerApi.getLoyalty(customerId);
      if (res) {
        setLoyaltyPoints(res.balance || 0);
        setTransactions(res.transactions || []);
      }
    } catch (e) {
      console.error("Failed to fetch loyalty data", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchLoyalty();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle='dark-content' backgroundColor='#fff' />

      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backBtn} 
          onPress={() => router.canGoBack() ? router.back() : router.replace('/home')}
        >
          <Ionicons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Rewards & Loyalty</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* Loyalty Balance Card */}
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>LOYALTY BALANCE</Text>
          {loading ? (
            <ActivityIndicator size="large" color="#fff" style={{ marginVertical: 10 }} />
          ) : (
            <Text style={styles.balanceValue}>{loyaltyPoints} Points</Text>
          )}

          <View style={styles.balanceFooter}>
            <Text style={styles.balanceWorth}>Worth Rs. {(loyaltyPoints * 0.1).toFixed(2)}</Text>
            <TouchableOpacity
              style={styles.howItWorksBtn}
              onPress={() => setShowHowItWorks(true)}
            >
              <Text style={styles.howItWorksText}>How it works</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Transaction History */}
        <Text style={styles.sectionTitle}>Recent History</Text>

        {transactions.length === 0 ? (
          <Text style={{ color: '#666', textAlign: 'center', marginTop: 20 }}>No transactions yet.</Text>
        ) : (
          transactions.map(tx => (
            <View key={tx.id} style={styles.transactionCard}>
              <View style={styles.txIconContainer}>
                <Ionicons name={tx.type === 'ORDER_CREDIT' ? 'restaurant-outline' : 'gift-outline'} size={20} color="#00cc66" />
              </View>
              <View style={styles.txInfo}>
                <Text style={styles.txTitle}>{tx.description}</Text>
                <Text style={styles.txDate}>{formatDateOnly(tx.date)}</Text>
              </View>
              <Text style={styles.txPoints}>+{tx.points} pts</Text>
            </View>
          ))
        )}

      </ScrollView>

      {/* Bottom Navigation */}
      <BottomNavBar activeTab="profile" />
      {/* How it works Modal */}
      <Modal
        visible={showHowItWorks}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowHowItWorks(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Ionicons name="information-circle" size={28} color="#ff4500" />
              <Text style={styles.modalTitle}>How It Works</Text>
            </View>
            <Text style={styles.modalText}>
              • Earn 1 loyalty point for every Rs.10 spent on food.{"\n\n"}
              • Points are automatically credited when your order is delivered or served.{"\n\n"}
              • Redeem your accumulated points for exclusive discounts!
            </Text>
            <TouchableOpacity
              style={styles.modalCloseBtn}
              onPress={() => setShowHowItWorks(false)}
            >
              <Text style={styles.modalCloseBtnText}>Got it</Text>
            </TouchableOpacity>
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
    
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: '#fff',
  },
  backBtn: {
    marginRight: 15,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 100,
  },
  balanceCard: {
    backgroundColor: '#ff4500',
    borderRadius: 15,
    padding: 20,
    marginBottom: 25,
  },
  balanceLabel: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  balanceValue: {
    color: '#fff',
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  balanceFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  balanceWorth: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  howItWorksBtn: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  howItWorksText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 15,
    color: '#333',
  },
  transactionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 15,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  txIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#e6ffe6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },
  txInfo: {
    flex: 1,
  },
  txTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 4,
    color: '#333',
  },
  txDate: {
    fontSize: 12,
    color: '#888',
  },
  txPoints: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#00cc66',
  },
  bottomNav: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 15,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  navItem: {
    alignItems: 'center',
  },
  navText: {
    fontSize: 10,
    marginTop: 5,
    color: '#888',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '85%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginLeft: 10,
  },
  modalText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 22,
    marginBottom: 24,
  },
  modalCloseBtn: {
    backgroundColor: '#ff4500',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalCloseBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  }
});
