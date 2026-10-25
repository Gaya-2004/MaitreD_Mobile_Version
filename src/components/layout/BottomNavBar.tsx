import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

export type BottomNavTab = 'home' | 'search' | 'orders' | 'profile';

interface BottomNavBarProps {
  activeTab?: BottomNavTab;
  onSearchPress?: () => void;
}

export default function BottomNavBar({ activeTab, onSearchPress }: BottomNavBarProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // Ensure plenty of space so the icons sit completely above any device navigation bar (3-button or gesture bar)
  const bottomPadding = Math.max(insets.bottom, Platform.OS === 'android' ? 24 : 12) + 8;

  const handleSearch = () => {
    if (onSearchPress) {
      onSearchPress();
    } else {
      router.replace('/menu' as any);
    }
  };

  return (
    <View style={[styles.bottomNav, { paddingBottom: bottomPadding }]}>
      <TouchableOpacity
        style={styles.navItem}
        onPress={() => activeTab !== 'home' && router.replace('/home')}
        activeOpacity={0.7}
      >
        <Ionicons
          name={activeTab === 'home' ? 'home' : 'home-outline'}
          size={24}
          color={activeTab === 'home' ? '#ff4500' : '#888'}
        />
        <Text style={[styles.navText, activeTab === 'home' && styles.navTextActive]}>
          Home
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.navItem}
        onPress={handleSearch}
        activeOpacity={0.7}
      >
        <Ionicons
          name={activeTab === 'search' ? 'search' : 'search-outline'}
          size={24}
          color={activeTab === 'search' ? '#ff4500' : '#888'}
        />
        <Text style={[styles.navText, activeTab === 'search' && styles.navTextActive]}>
          Search
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.navItem}
        onPress={() => activeTab !== 'orders' && router.replace('/orders' as any)}
        activeOpacity={0.7}
      >
        <Ionicons
          name={activeTab === 'orders' ? 'receipt' : 'receipt-outline'}
          size={24}
          color={activeTab === 'orders' ? '#ff4500' : '#888'}
        />
        <Text style={[styles.navText, activeTab === 'orders' && styles.navTextActive]}>
          Orders
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.navItem}
        onPress={() => activeTab !== 'profile' && router.replace('/profile')}
        activeOpacity={0.7}
      >
        <Ionicons
          name={activeTab === 'profile' ? 'person' : 'person-outline'}
          size={24}
          color={activeTab === 'profile' ? '#ff4500' : '#888'}
        />
        <Text style={[styles.navText, activeTab === 'profile' && styles.navTextActive]}>
          Profile
        </Text>
      </TouchableOpacity>

    </View>
  );
}

const styles = StyleSheet.create({
  bottomNav: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    elevation: 10,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: -3 },
    shadowRadius: 6,
  },
  navItem: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 60,
  },
  navText: {
    fontSize: 11,
    marginTop: 4,
    color: '#888',
    fontWeight: '500',
  },
  navTextActive: {
    color: '#ff4500',
    fontWeight: '700',
  },
});
