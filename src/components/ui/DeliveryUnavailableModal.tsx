import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useRestaurantStore } from '../../store';

interface AlternateBranch {
  name: string;
  distanceKm: number;
  restaurant_id?: number;
  isEligible: boolean;
}

interface DeliveryUnavailableModalProps {
  visible: boolean;
  onClose: () => void;
  onTryAnotherAddress?: () => void;
  distanceKm?: number;
  maxRadiusKm?: number;
  restaurantName?: string;
  alternateBranch?: AlternateBranch | null;
  customMessage?: string;
}

export default function DeliveryUnavailableModal({
  visible,
  onClose,
  onTryAnotherAddress,
  distanceKm,
  maxRadiusKm = 5,
  restaurantName = 'Data Udipi',
  alternateBranch,
  customMessage,
}: DeliveryUnavailableModalProps) {
  const router = useRouter();
  const { setSelectedOutlet } = useRestaurantStore();

  const handleSwitchBranch = () => {
    if (alternateBranch?.restaurant_id) {
      setSelectedOutlet({
        restaurant_id: alternateBranch.restaurant_id,
        id: alternateBranch.restaurant_id,
        name: alternateBranch.name,
      });
    }
    onClose();
    router.push('/outlet-selector');
  };

  const handleAddressChange = () => {
    onClose();
    if (onTryAnotherAddress) {
      onTryAnotherAddress();
    } else {
      router.push('/add-address');
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          {/* Close button */}
          <TouchableOpacity style={styles.closeBtn} onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={20} color="#94a3b8" />
          </TouchableOpacity>

          {/* Icon Badge */}
          <View style={styles.iconContainer}>
            <View style={styles.iconCircle}>
              <Ionicons name="bicycle-outline" size={32} color="#ff3400" />
            </View>
            <View style={styles.warningBadge}>
              <Ionicons name="alert" size={14} color="#ffffff" />
            </View>
          </View>

          {/* Title */}
          <Text style={styles.title}>Restaurant Not Nearby</Text>
          <Text style={styles.subtitle}>You are out of our 5 km delivery range</Text>

          {/* Distance Pill */}
          {distanceKm != null && distanceKm > 0 && (
            <View style={styles.distancePill}>
              <Ionicons name="location" size={14} color="#e11d48" style={{ marginRight: 4 }} />
              <Text style={styles.distancePillText}>
                {distanceKm} km away from {restaurantName}
              </Text>
            </View>
          )}

          {/* Message */}
          <Text style={styles.message}>
            {customMessage ||
              `We currently deliver only within ${maxRadiusKm} km to ensure your food arrives hot, fresh, and on time. Please choose an address closer to this branch or select a nearby outlet.`}
          </Text>

          {/* Alternate branch recommendation if available */}
          {alternateBranch && alternateBranch.isEligible && (
            <View style={styles.alternateBox}>
              <View style={styles.alternateHeader}>
                <Ionicons name="sparkles" size={16} color="#059669" />
                <Text style={styles.alternateTitle}>Nearest Branch Available!</Text>
              </View>
              <Text style={styles.alternateText}>
                <Text style={{ fontWeight: '700' }}>{alternateBranch.name}</Text> is only{' '}
                <Text style={{ fontWeight: '700', color: '#059669' }}>{alternateBranch.distanceKm} km</Text> away and can deliver to your doorstep.
              </Text>
              <TouchableOpacity style={styles.switchBranchBtn} onPress={handleSwitchBranch}>
                <Text style={styles.switchBranchBtnText}>Switch to {alternateBranch.name.split('—')[1]?.trim() || 'This Branch'}</Text>
                <Ionicons name="arrow-forward" size={14} color="#ffffff" />
              </TouchableOpacity>
            </View>
          )}

          {/* Primary Action: Change Address */}
          <TouchableOpacity style={styles.primaryButton} onPress={handleAddressChange}>
            <Ionicons name="home-outline" size={18} color="#ffffff" style={{ marginRight: 6 }} />
            <Text style={styles.primaryButtonText}>Change Delivery Address</Text>
          </TouchableOpacity>

          {/* Secondary Action: Select Outlet or Dismiss */}
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => {
              onClose();
              router.push('/outlet-selector');
            }}
          >
            <Text style={styles.secondaryButtonText}>View All Restaurant Outlets</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  card: {
    width: Math.min(width - 40, 360),
    backgroundColor: '#ffffff',
    borderRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 22,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 12,
    position: 'relative',
  },
  closeBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainer: {
    position: 'relative',
    marginBottom: 16,
  },
  iconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#fff1ee',
    borderWidth: 2,
    borderColor: '#fed7aa',
    alignItems: 'center',
    justifyContent: 'center',
  },
  warningBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#e11d48',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0f172a',
    textAlign: 'center',
    marginBottom: 4,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 12,
  },
  distancePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff1f2',
    borderWidth: 1,
    borderColor: '#fecdd3',
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 9999,
    marginBottom: 14,
  },
  distancePillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#be123c',
  },
  message: {
    fontSize: 13.5,
    color: '#475569',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 18,
  },
  alternateBox: {
    width: '100%',
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#a7f3d0',
    borderRadius: 14,
    padding: 12,
    marginBottom: 18,
  },
  alternateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  alternateTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#065f46',
  },
  alternateText: {
    fontSize: 12,
    color: '#047857',
    lineHeight: 17,
    marginBottom: 10,
  },
  switchBranchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#059669',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 6,
  },
  switchBranchBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  primaryButton: {
    width: '100%',
    flexDirection: 'row',
    backgroundColor: '#ff3400',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#ff3400',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
    marginBottom: 10,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryButton: {
    width: '100%',
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: '#64748b',
    fontSize: 13,
    fontWeight: '600',
  },
});
