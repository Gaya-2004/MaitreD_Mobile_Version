import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform, StatusBar, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useNavigation } from 'expo-router';
import { useAuthStore, useAddressStore } from '../../store';
import { customerApi } from '../../services/apiService';
import BottomNavBar from '../../components/layout/BottomNavBar';

export default function Profile() {
  const router = useRouter();
  const navigation = useNavigation();
  const { customerId } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { addresses, setAddresses } = useAddressStore();

  const onRefresh = async () => {
    setRefreshing(true);
    await loadAddresses();
    setRefreshing(false);
  };

  const loadAddresses = async () => {
    if (!customerId) {
      setLoading(false);
      return;
    }
    
    try {
      setLoading(true);
      const data = await customerApi.getAddresses(customerId);
      if (Array.isArray(data)) {
        const formattedAddresses = data.map((item: any) => ({
          id: item.id.toString(),
          type: item.address_type,
          address: item.full_address || [item.flat_house_no, item.building_apartment_name, item.landmark].filter(Boolean).join(', '),
          full_address: item.full_address || '',
          latitude: item.latitude != null ? Number(item.latitude) : undefined,
          longitude: item.longitude != null ? Number(item.longitude) : undefined,
          icon: item.address_type.toLowerCase() === 'home' ? 'home' : (item.address_type.toLowerCase() === 'work' ? 'briefcase' : 'location'),
          iconBg: item.address_type.toLowerCase() === 'home' ? '#ffe5e5' : (item.address_type.toLowerCase() === 'work' ? '#e6f2ff' : '#e6ffe6'),
          iconColor: item.address_type.toLowerCase() === 'home' ? '#ff4500' : (item.address_type.toLowerCase() === 'work' ? '#1e90ff' : '#00cc66'),
          isDefault: item.is_default
        }));
        setAddresses(formattedAddresses);
      }
    } catch (e) {
      console.error("Error loading addresses", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      loadAddresses();
    });
    return unsubscribe;
  }, [navigation]);

  const handleDeleteAddress = async (id: string | number) => {
    if (!customerId) return;
    const idStr = String(id);
    try {
      await customerApi.deleteAddress(customerId, Number(idStr));
      const updated = addresses.filter(item => String(item.id) !== idStr);
      setAddresses(updated);
    } catch (e) {
      console.error("Error deleting address", e);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle='dark-content' backgroundColor='#fff' />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.canGoBack() ? router.back() : router.replace('/profile')}>
          <Ionicons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Addresses</Text>
      </View>

      <ScrollView 
        contentContainerStyle={styles.scrollContent} 
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#ff4500']} />}
      >
        {loading ? (
          <View style={{ alignItems: 'center', marginTop: 40 }}>
            <ActivityIndicator size="large" color="#ff4500" />
            <Text style={{ color: '#888', marginTop: 10 }}>Loading addresses...</Text>
          </View>
        ) : addresses.length === 0 ? (
          <View style={{ alignItems: 'center', marginTop: 40 }}>
            <Ionicons name="location-outline" size={48} color="#ccc" />
            <Text style={{ color: '#888', marginTop: 10 }}>No addresses saved yet.</Text>
          </View>
        ) : (
          addresses.map((item) => (
            <View key={item.id} style={styles.addressCard}>
              <View style={styles.addressHeader}>
                <View style={[styles.iconContainer, { backgroundColor: item.iconBg }]}>
                  <Ionicons name={item.icon as any} size={20} color={item.iconColor} />
                </View>
                <View style={styles.titleRow}>
                  <Text style={styles.addressType}>{item.type}</Text>
                  {item.isDefault && (
                    <View style={styles.defaultBadge}>
                      <Text style={styles.defaultBadgeText}>Default</Text>
                    </View>
                  )}
                </View>
              </View>

              <Text style={styles.addressText}>{item.address}</Text>

              <View style={styles.actionRow}>
                <TouchableOpacity style={styles.actionBtn}>
                  <Ionicons name="create-outline" size={16} color="#555" />
                  <Text style={styles.actionText}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionBtn} onPress={() => handleDeleteAddress(item.id)}>
                  <Ionicons name="trash-outline" size={16} color="#ff4500" />
                  <Text style={[styles.actionText, { color: '#ff4500' }]}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}

        <TouchableOpacity style={styles.addNewBtn} onPress={() => router.push('/add-address')}>
          <Ionicons name="add" size={20} color="#fff" />
          <Text style={styles.addNewText}>Add New Address</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Bottom Navigation */}
      <BottomNavBar activeTab="profile" />
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
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
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
  addressCard: {
    backgroundColor: '#fff',
    borderRadius: 15,
    padding: 20,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  addressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  addressType: {
    fontSize: 16,
    fontWeight: 'bold',
    marginRight: 10,
  },
  defaultBadge: {
    backgroundColor: '#e6ffe6',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  defaultBadgeText: {
    color: '#00cc66',
    fontSize: 10,
    fontWeight: 'bold',
  },
  addressText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginBottom: 15,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  actionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#555',
  },
  footerContainer: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    backgroundColor: '#fafafa',
  },
  addNewBtn: {
    backgroundColor: '#ff4500',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
    borderRadius: 25,
    gap: 10,
    marginTop: 20,
    marginBottom: 20,
  },
  addNewText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  bottomNav: {
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
  }
});
