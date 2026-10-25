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

interface SelectTableModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectTable?: () => void;
  isInvalidTable?: boolean;
  tableNumber?: string | null;
}

export default function SelectTableModal({
  visible,
  onClose,
  onSelectTable,
  isInvalidTable = false,
  tableNumber,
}: SelectTableModalProps) {
  const router = useRouter();

  const handleSelectTable = () => {
    onClose();
    if (onSelectTable) {
      onSelectTable();
    } else {
      router.push({
        pathname: '/(main)/home',
        params: { openScanner: 'true', orderType: 'Dine In' },
      });
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
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={onClose}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="close" size={20} color="#94a3b8" />
          </TouchableOpacity>

          {/* Icon Badge */}
          <View style={styles.iconContainer}>
            <View style={styles.iconCircle}>
              <Ionicons name="restaurant-outline" size={32} color="#ff4500" />
            </View>
            <View style={styles.warningBadge}>
              <Ionicons name="alert" size={13} color="#ffffff" />
            </View>
          </View>

          {/* Title */}
          <Text style={styles.title}>
            {isInvalidTable ? 'Invalid Table Selected' : 'Select Your Table First'}
          </Text>

          {/* Subtitle */}
          <Text style={styles.subtitle}>
            {isInvalidTable
              ? `Table ${tableNumber || ''} is currently unavailable or inactive.`
              : 'Dine-In ordering requires an assigned table.'}
          </Text>

          {/* Message */}
          <Text style={styles.message}>
            {isInvalidTable
              ? 'Please select or scan an active dining table before adding items to your cart.'
              : 'Please select your dining table before adding items to your cart.'}
          </Text>

          {/* Primary Action: Select Table */}
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleSelectTable}
            activeOpacity={0.85}
          >
            <Ionicons name="qr-code-outline" size={18} color="#ffffff" style={{ marginRight: 6 }} />
            <Text style={styles.primaryButtonText}>Select Table</Text>
          </TouchableOpacity>

          {/* Secondary Action: Cancel */}
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={onClose}
            activeOpacity={0.7}
          >
            <Text style={styles.secondaryButtonText}>Cancel</Text>
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
    backgroundColor: '#ff4500',
    borderWidth: 2,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0f172a',
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 14,
  },
  message: {
    fontSize: 13,
    lineHeight: 19,
    color: '#475569',
    textAlign: 'center',
    marginBottom: 22,
    paddingHorizontal: 6,
  },
  primaryButton: {
    width: '100%',
    backgroundColor: '#00a01d',
    paddingVertical: 14,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    shadowColor: '#00a01d',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  secondaryButton: {
    width: '100%',
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  secondaryButtonText: {
    color: '#475569',
    fontSize: 14,
    fontWeight: '600',
  },
});
