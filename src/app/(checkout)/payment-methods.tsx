import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform, StatusBar, Modal, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { usePaymentMethodStore, PaymentItem } from '../../store';
import BottomNavBar from '../../components/layout/BottomNavBar';

export default function PaymentMethodsScreen() {
  const router = useRouter();

  const { paymentMethods, selectedMethodId, setSelectedMethod, addPaymentMethod, removePaymentMethod } = usePaymentMethodStore();

  const [isSearchActive, setIsSearchActive] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isAddModalVisible, setIsAddModalVisible] = useState<boolean>(false);
  const [newMethodType, setNewMethodType] = useState<'card' | 'upi' | 'wallet'>('upi');
  const [newMethodTitle, setNewMethodTitle] = useState<string>('');
  const [newMethodSubtitle, setNewMethodSubtitle] = useState<string>('');

  const savedCards = paymentMethods.filter(
    (item) =>
      item.category === 'card' &&
      (item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.subtitle.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const upiAndWallets = paymentMethods.filter(
    (item) =>
      (item.category === 'upi' || item.category === 'wallet') &&
      (item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.subtitle.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const handleAddPaymentMethod = () => {
    if (!newMethodTitle.trim() || !newMethodSubtitle.trim()) {
      Alert.alert('Incomplete Info', 'Please enter both title and details.');
      return;
    }
    const newId = `${newMethodType}-${Date.now()}`;
    const badgeMap: Record<'card' | 'upi' | 'wallet', 'VISA' | 'UPI' | 'Paytm'> = {
      card: 'VISA',
      upi: 'UPI',
      wallet: 'Paytm',
    };

    const newItem: PaymentItem = {
      id: newId,
      category: newMethodType,
      badgeType: badgeMap[newMethodType] as any,
      title: newMethodTitle,
      subtitle: newMethodSubtitle,
    };

    addPaymentMethod(newItem);
    setNewMethodTitle('');
    setNewMethodSubtitle('');
    setIsAddModalVisible(false);
  };

  const handleLongPress = (id: string) => {
    Alert.alert(
      "Delete Payment Method",
      "Are you sure you want to remove this payment method?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => removePaymentMethod(id) }
      ]
    );
  };

  const renderBadge = (badgeType: PaymentItem['badgeType']) => {
    switch (badgeType) {
      case 'VISA':
        return (
          <View style={[styles.badgeContainer, styles.visaBadge]}>
            <Text style={styles.visaText}>VISA</Text>
          </View>
        );
      case 'UPI':
        return (
          <View style={[styles.badgeContainer, styles.upiBadge]}>
            <Text style={styles.upiText}>UPI</Text>
          </View>
        );
      case 'Paytm':
        return (
          <View style={[styles.badgeContainer, styles.paytmBadge]}>
            <Text style={styles.paytmText}>Paytm</Text>
          </View>
        );
      default:
        return (
          <View style={[styles.badgeContainer, styles.paytmBadge]}>
            <Text style={styles.paytmText}>{badgeType}</Text>
          </View>
        );
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => {
              if (router.canGoBack()) {
                router.back();
              } else {
                router.push('/profile');
              }
            }}
          >
            <Ionicons name="chevron-back" size={22} color="#111" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Payment Methods</Text>
        </View>

        <TouchableOpacity
          style={styles.searchBtn}
          onPress={() => setIsSearchActive(!isSearchActive)}
        >
          <Ionicons name="search" size={20} color="#111" />
        </TouchableOpacity>
      </View>

      {/* Optional Search Input */}
      {isSearchActive && (
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color="#888" style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search saved cards, UPI..."
            placeholderTextColor="#888"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoFocus
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={18} color="#888" />
            </TouchableOpacity>
          ) : null}
        </View>
      )}

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Saved Cards Section */}
        {savedCards.length > 0 && (
          <View style={styles.sectionContainer}>
            <Text style={styles.sectionTitle}>SAVED CARDS</Text>
            {savedCards.map((item) => {
              const isSelected = selectedMethodId === item.id;
              return (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.paymentCard, isSelected && styles.paymentCardSelected]}
                  activeOpacity={0.7}
                  onPress={() => setSelectedMethod(item.id)}
                  onLongPress={() => handleLongPress(item.id)}
                >
                  <View style={styles.cardLeft}>
                    {renderBadge(item.badgeType)}
                    <View style={styles.textColumn}>
                      <Text style={styles.itemTitle}>{item.title}</Text>
                      <Text style={styles.itemSubtitle}>{item.subtitle}</Text>
                    </View>
                  </View>

                  {isSelected && (
                    <View style={styles.selectedCheckCircle}>
                      <Ionicons name="checkmark" size={16} color="#fff" />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* UPI & Wallets Section */}
        {upiAndWallets.length > 0 && (
          <View style={styles.sectionContainer}>
            <Text style={styles.sectionTitle}>UPI & WALLETS</Text>
            {upiAndWallets.map((item) => {
              const isSelected = selectedMethodId === item.id;
              return (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.paymentCard, isSelected && styles.paymentCardSelected]}
                  activeOpacity={0.7}
                  onPress={() => setSelectedMethod(item.id)}
                  onLongPress={() => handleLongPress(item.id)}
                >
                  <View style={styles.cardLeft}>
                    {renderBadge(item.badgeType)}
                    <View style={styles.textColumn}>
                      <Text style={styles.itemTitle}>{item.title}</Text>
                      <Text style={styles.itemSubtitle}>{item.subtitle}</Text>
                    </View>
                  </View>

                  {isSelected && (
                    <View style={styles.selectedCheckCircle}>
                      <Ionicons name="checkmark" size={16} color="#fff" />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Add New Payment Method Button */}
      <View style={styles.footerContainer}>
        <TouchableOpacity
          style={styles.addBtn}
          activeOpacity={0.8}
          onPress={() => setIsAddModalVisible(true)}
        >
          <Text style={styles.addBtnText}>+ Add New Payment Method</Text>
        </TouchableOpacity>
      </View>

      {/* Bottom Navigation */}
      <BottomNavBar activeTab="profile" />

      {/* Modal for adding new payment method */}
      <Modal
        visible={isAddModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setIsAddModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Payment Method</Text>
              <TouchableOpacity onPress={() => setIsAddModalVisible(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>

            <View style={styles.typeSelector}>
              <TouchableOpacity
                style={[
                  styles.typeOption,
                  newMethodType === 'upi' && styles.typeOptionActive,
                ]}
                onPress={() => setNewMethodType('upi')}
              >
                <Text
                  style={[
                    styles.typeOptionText,
                    newMethodType === 'upi' && styles.typeOptionTextActive,
                  ]}
                >
                  UPI ID
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.typeOption,
                  newMethodType === 'card' && styles.typeOptionActive,
                ]}
                onPress={() => setNewMethodType('card')}
              >
                <Text
                  style={[
                    styles.typeOptionText,
                    newMethodType === 'card' && styles.typeOptionTextActive,
                  ]}
                >
                  Card
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.typeOption,
                  newMethodType === 'wallet' && styles.typeOptionActive,
                ]}
                onPress={() => setNewMethodType('wallet')}
              >
                <Text
                  style={[
                    styles.typeOptionText,
                    newMethodType === 'wallet' && styles.typeOptionTextActive,
                  ]}
                >
                  Wallet
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>
              {newMethodType === 'upi'
                ? 'UPI ID / VPA'
                : newMethodType === 'card'
                ? 'Card Name'
                : 'Wallet Name'}
            </Text>
            <TextInput
              style={styles.modalInput}
              placeholder={
                newMethodType === 'upi'
                  ? 'e.g. name@okaxis'
                  : newMethodType === 'card'
                  ? 'e.g. ICICI Bank Credit Card'
                  : 'e.g. PhonePe Wallet'
              }
              value={newMethodTitle}
              onChangeText={setNewMethodTitle}
            />

            <Text style={styles.inputLabel}>
              {newMethodType === 'upi'
                ? 'Linked Email / ID'
                : newMethodType === 'card'
                ? 'Card Number'
                : 'Balance / Phone Number'}
            </Text>
            <TextInput
              style={styles.modalInput}
              placeholder={
                newMethodType === 'upi'
                  ? 'e.g. shruti@okaxis'
                  : newMethodType === 'card'
                  ? 'e.g. 4111 2222 3333 4444 or •••• 1234'
                  : 'e.g. Balance: Rs. 500.00'
              }
              value={newMethodSubtitle}
              onChangeText={setNewMethodSubtitle}
            />

            <TouchableOpacity style={styles.saveBtn} onPress={handleAddPaymentMethod}>
              <Text style={styles.saveBtnText}>Save Payment Method</Text>
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
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: '#fff',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111',
  },
  searchBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 20,
    marginTop: 10,
    paddingHorizontal: 14,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#111',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 160,
  },
  sectionContainer: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#8e8e93',
    letterSpacing: 0.8,
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  paymentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 18,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  paymentCardSelected: {
    borderColor: '#f5f5f5',
  },
  cardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  badgeContainer: {
    width: 52,
    height: 38,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  visaBadge: {
    backgroundColor: '#1c1c1e',
  },
  visaText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 13,
    letterSpacing: 1,
  },
  upiBadge: {
    backgroundColor: '#ffe8e5',
  },
  upiText: {
    color: '#ff4500',
    fontWeight: '900',
    fontSize: 12,
  },
  paytmBadge: {
    backgroundColor: '#e5f3ff',
  },
  paytmText: {
    color: '#00bef2',
    fontWeight: '900',
    fontSize: 11,
  },
  textColumn: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1c1c1e',
    marginBottom: 4,
  },
  itemSubtitle: {
    fontSize: 13,
    color: '#8e8e93',
    fontWeight: '500',
  },
  selectedCheckCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#00c853',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 10,
  },
  footerContainer: {
    position: 'absolute',
    bottom: 74,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: 'transparent',
  },
  addBtn: {
    width: '100%',
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#ff4500',
    borderRadius: 28,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#ff4500',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  addBtnText: {
    color: '#ff4500',
    fontSize: 15,
    fontWeight: '700',
  },
  bottomNav: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  navItem: {
    alignItems: 'center',
  },
  navText: {
    fontSize: 11,
    marginTop: 4,
    color: '#888',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111',
  },
  typeSelector: {
    flexDirection: 'row',
    marginBottom: 20,
    gap: 10,
  },
  typeOption: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    alignItems: 'center',
  },
  typeOptionActive: {
    backgroundColor: '#ff4500',
    borderColor: '#ff4500',
  },
  typeOptionText: {
    fontSize: 14,
    color: '#555',
    fontWeight: '600',
  },
  typeOptionTextActive: {
    color: '#fff',
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#555',
    marginBottom: 6,
  },
  modalInput: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#111',
    marginBottom: 16,
  },
  saveBtn: {
    backgroundColor: '#ff4500',
    borderRadius: 24,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  saveBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
