import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useRestaurantStore } from '../../store';
import { restaurantApi } from '../../services/apiService';

const FALLBACK_OUTLETS = [
  {
    id: "mugalivakkam",
    restaurant_id: 1,
    name: "Data Udipi — Mugalivakkam",
    address: "Mount-Poonamallee Road, Mugalivakkam, Chennai 600125",
    lat: 13.0210,
    lng: 80.1614,
    open: true,
    comingSoon: false
  },
  {
    id: "mgrnagar",
    restaurant_id: 2,
    name: "Data Udipi — MGR Nagar",
    address: "Anna Main Road, MGR Nagar, Chennai 600078",
    lat: 13.0350,
    lng: 80.1970,
    open: true,
    comingSoon: false
  },
  {
    id: "banglore",
    restaurant_id: 25,
    name: "Data Udipi- Banglore",
    address: "Ganga block 1st cross, Electronic City, Survey No.33, 12th Cross Rd, Bettadasanapura, Karnataka 560100",
    lat: 12.8399,
    lng: 77.6770,
    open: true,
    comingSoon: false
  }
];

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; // km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function OutletSelectorScreen() {
  const router = useRouter();
  const { setSelectedOutlet } = useRestaurantStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<{lat: number, lng: number} | null>(null);
  const [statusText, setStatusText] = useState('');
  const [isLocating, setIsLocating] = useState(false);
  const [outlets, setOutlets] = useState<any[]>([]);

  useEffect(() => {
    const fetchOutlets = async () => {
      try {
        const data = await restaurantApi.getRestaurants();
        const apiOutlets = data.map((r: any) => {
          // Attempt to match by ID or by name to get appropriate coordinates
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
        setOutlets(apiOutlets.map((o: any) => ({ ...o, dist: null })));
      } catch (error) {
        console.error('Failed to fetch restaurants:', error);
        setOutlets(FALLBACK_OUTLETS.map(o => ({ ...o, dist: null })));
      }
    };
    fetchOutlets();
  }, []);

  useEffect(() => {
    if (userLocation && outlets.length > 0) {
      // compute distances on current outlets
      const sorted = [...outlets].map(o => ({
        ...o,
        dist: o.lat && o.lng ? haversineDistance(userLocation.lat, userLocation.lng, o.lat, o.lng) : null
      })).sort((a, b) => (a.dist || 0) - (b.dist || 0));
      
      // only update if different to avoid loop
      if (sorted[0]?.id !== outlets[0]?.id || sorted[0]?.dist !== outlets[0]?.dist) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setOutlets(sorted);
      }
    }
  }, [userLocation]);

  const handleLocateMe = async () => {
    setIsLocating(true);
    setStatusText("Finding you…");
    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setStatusText("Permission denied — pick a branch manually.");
        setIsLocating(false);
        return;
      }
      let location = await Location.getCurrentPositionAsync({});
      setUserLocation({ lat: location.coords.latitude, lng: location.coords.longitude });
      setStatusText("Showing nearest branch first.");
    } catch (e) {
      setStatusText("Couldn't get location — pick a branch manually.");
    }
    setIsLocating(false);
  };

  const handleSelect = (id: string) => {
    const outlet = outlets.find(o => o.id === id);
    if (outlet?.comingSoon) {
      Alert.alert("Coming Soon", "MGR Nagar branch is not yet ready!");
      return;
    }
    setSelectedId(id);
  };

  const handleConfirm = async () => {
    if (!selectedId) return;
    const outlet = outlets.find(o => o.id === selectedId);
    if (outlet) {
      setStatusText(`Branch set to ${outlet.name}.`);
      setSelectedOutlet(outlet);
      router.replace({
        pathname: '/home',
        params: { autoPromptQR: 'true' }
      });
    }
  };

  const nearestId = userLocation && outlets.length > 0 ? outlets[0].id : null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Choose your branch</Text>
        <Text style={styles.title}>Select an outlet</Text>
        <Text style={styles.subtitle}>{"We'll show menu & pricing for this branch"}</Text>
        
        <TouchableOpacity style={styles.locateBtn} onPress={handleLocateMe} disabled={isLocating}>
          {isLocating ? <ActivityIndicator color="#fff" /> : <Ionicons name="location-outline" size={18} color="#fff" />}
          <Text style={styles.locateBtnText}>Use my current location</Text>
        </TouchableOpacity>
        <Text style={styles.statusText}>{statusText}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.list}>
        {outlets.map((o) => {
          const isSelected = o.id === selectedId;
          const isNearest = o.id === nearestId;
          return (
            <TouchableOpacity 
              key={o.id} 
              style={[styles.card, isSelected && styles.cardSelected]}
              onPress={() => handleSelect(o.id)}
              activeOpacity={0.8}
            >
              {isNearest && <Text style={styles.nearestBadge}>NEAREST</Text>}
              <View style={styles.pin}><Text style={styles.pinText}>DU</Text></View>
              <View style={styles.cardBody}>
                <Text style={styles.outletName}>{o.name}</Text>
                <Text style={styles.outletAddr}>{o.address}</Text>
                <View style={styles.metaRow}>
                  {o.dist !== null && <Text style={styles.metaDist}>📍 {o.dist.toFixed(1)} km away</Text>}
                  <Text style={styles.metaOpen}>{o.comingSoon ? '● Coming Soon' : (o.open ? '● Open now' : '● Closed')}</Text>
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
          {selectedId ? `Continue with ${outlets.find(o => o.id === selectedId)?.name.replace('Data Udipi — ', '')}` : 'Select a branch to continue'}
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
    paddingTop: 60,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#ECECEC',
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
  locateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    padding: 14,
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    gap: 8,
  },
  locateBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  statusText: {
    textAlign: 'center',
    fontSize: 12,
    color: '#8A8A8A',
    marginTop: 10,
    minHeight: 16,
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
  nearestBadge: {
    position: 'absolute',
    top: -10,
    right: 12,
    backgroundColor: '#1DB854',
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 10,
    overflow: 'hidden',
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
  metaDist: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FF4B1F',
    marginRight: 12,
  },
  metaOpen: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1DB854',
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
