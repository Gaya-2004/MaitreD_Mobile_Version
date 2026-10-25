import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useRestaurantStore } from '../../store';
import { restaurantApi } from '../../services/apiService';

const FALLBACK_OUTLETS = [
  {
    id: "1",
    restaurant_id: 1,
    name: "Data Udipi — Mugalivakkam",
    address: "Mount-Poonamallee Road, Mugalivakkam, Chennai 600125",
    lat: 13.0210,
    lng: 80.1614,
    open: true,
    comingSoon: false
  },
  {
    id: "2",
    restaurant_id: 2,
    name: "Data Udipi — MGR Nagar",
    address: "Anna Main Road, MGR Nagar, Chennai 600078",
    lat: 13.0350,
    lng: 80.1970,
    open: true,
    comingSoon: false
  },
  {
    id: "25",
    restaurant_id: 25,
    name: "Data Udipi- Banglore",
    address: "Ganga block 1st cross, Electronic City, Survey No.33, 12th Cross Rd, Bettadasanapura, Karnataka 560100",
    lat: 12.8399,
    lng: 77.6770,
    open: true,
    comingSoon: false
  }
];

export default function OutletSelectorScreen() {
  const router = useRouter();
  const { selectedOutlet, setSelectedOutlet } = useRestaurantStore();
  const [selectedId, setSelectedId] = useState<string | null>(
    selectedOutlet?.restaurant_id ? String(selectedOutlet.restaurant_id) : "1"
  );
  const [outlets, setOutlets] = useState<any[]>(FALLBACK_OUTLETS);

  useEffect(() => {
    const fetchOutlets = async () => {
      try {
        const data = await restaurantApi.getRestaurants();
        if (Array.isArray(data) && data.length > 0) {
          const apiOutlets = data.map((r: any) => {
            const fallback = FALLBACK_OUTLETS.find(f => 
              f.restaurant_id === r.id || 
              r.name.toLowerCase().includes(f.name.split(' — ')[1]?.toLowerCase() || f.name.split('- ')[1]?.toLowerCase() || 'unknown')
            );
            
            const rLat = r.latitude != null ? Number(r.latitude) : null;
            const rLng = r.longitude != null ? Number(r.longitude) : null;

            return {
              id: r.id.toString(),
              restaurant_id: r.id,
              name: r.name,
              address: r.address || '',
              lat: (rLat && !isNaN(rLat)) ? rLat : (fallback?.lat ?? 13.0210),
              lng: (rLng && !isNaN(rLng)) ? rLng : (fallback?.lng ?? 80.1614),
              open: fallback?.open ?? true,
              comingSoon: fallback?.comingSoon ?? false,
            };
          });
          setOutlets(apiOutlets);
        }
      } catch (error) {
        console.error('Failed to fetch restaurants:', error);
        setOutlets(FALLBACK_OUTLETS);
      }
    };
    fetchOutlets();
  }, []);

  const handleSelect = (id: string) => {
    const outlet = outlets.find(o => o.id === id);
    if (outlet?.comingSoon) {
      Alert.alert("Coming Soon", `${outlet.name} is not yet ready!`);
      return;
    }
    setSelectedId(id);
  };

  const handleConfirm = () => {
    if (!selectedId) return;
    const outlet = outlets.find(o => o.id === selectedId);
    if (outlet) {
      setSelectedOutlet(outlet);
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/home');
      }
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.topRow}>
          <TouchableOpacity 
            style={styles.backBtn} 
            onPress={() => router.canGoBack() ? router.back() : router.replace('/home')}
          >
            <Ionicons name="arrow-back" size={24} color="#1A1A1A" />
          </TouchableOpacity>
          <Text style={styles.headerBadge}>Branch Selection</Text>
        </View>
        <Text style={styles.eyebrow}>Choose your branch</Text>
        <Text style={styles.title}>Select an outlet</Text>
        <Text style={styles.subtitle}>{"We'll show menu & pricing for this branch"}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.list}>
        {outlets.map((o) => {
          const isSelected = o.id === selectedId;
          return (
            <TouchableOpacity 
              key={o.id} 
              style={[styles.card, isSelected && styles.cardSelected]}
              onPress={() => handleSelect(o.id)}
              activeOpacity={0.8}
            >
              <View style={[styles.pin, isSelected && styles.pinSelected]}>
                <Text style={styles.pinText}>DU</Text>
              </View>
              <View style={styles.cardBody}>
                <Text style={styles.outletName}>{o.name}</Text>
                <Text style={styles.outletAddr}>{o.address}</Text>
                <View style={styles.metaRow}>
                  <Text style={[styles.metaOpen, o.comingSoon && styles.metaComingSoon]}>
                    {o.comingSoon ? '● Coming Soon' : (o.open ? '● Open now' : '● Closed')}
                  </Text>
                </View>
              </View>
              <View style={[styles.radio, isSelected && styles.radioSelected]}>
                {isSelected && <View style={styles.radioDot} />}
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <TouchableOpacity 
        style={[styles.confirmBtn, !selectedId && styles.confirmBtnDisabled]}
        disabled={!selectedId}
        onPress={handleConfirm}
      >
        <Text style={styles.confirmBtnText}>
          {selectedId 
            ? `Continue with ${outlets.find(o => o.id === selectedId)?.name.replace('Data Udipi — ', '').replace('Data Udipi- ', '')}` 
            : 'Select a branch to continue'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F7F7',
  },
  header: {
    padding: 20,
    paddingTop: 50,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#ECECEC',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F2F2F2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBadge: {
    fontSize: 12,
    fontWeight: '700',
    color: '#8A8A8A',
    backgroundColor: '#F2F2F2',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    color: '#FF4B1F',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#1A1A1A',
  },
  subtitle: {
    fontSize: 14,
    color: '#8A8A8A',
    marginTop: 4,
  },
  list: {
    padding: 20,
    gap: 12,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#ECECEC',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    position: 'relative',
  },
  cardSelected: {
    borderColor: '#FF4B1F',
    backgroundColor: '#FFF6F3',
  },
  pin: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: '#FF4B1F',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  pinSelected: {
    backgroundColor: '#E03D14',
  },
  pinText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 16,
  },
  cardBody: {
    flex: 1,
  },
  outletName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1A1A1A',
    marginBottom: 4,
  },
  outletAddr: {
    fontSize: 13,
    color: '#8A8A8A',
    marginBottom: 8,
    lineHeight: 18,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 14,
  },
  metaOpen: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1DB854',
  },
  metaComingSoon: {
    color: '#E67E22',
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#ECECEC',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
    marginTop: 10,
  },
  radioSelected: {
    borderColor: '#FF4B1F',
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FF4B1F',
  },
  confirmBtn: {
    margin: 20,
    marginBottom: 40,
    padding: 16,
    backgroundColor: '#FF4B1F',
    borderRadius: 12,
    alignItems: 'center',
  },
  confirmBtnDisabled: {
    backgroundColor: '#F0C2B4',
  },
  confirmBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
});
