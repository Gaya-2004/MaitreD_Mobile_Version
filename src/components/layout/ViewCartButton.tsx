import React from 'react';
import { Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCartStore } from '../../store/useCartStore';

export default function ViewCartButton() {
  const router = useRouter();
  const itemCount = useCartStore((state) => state.getItemCount());

  if (itemCount === 0) return null;

  return (
    <TouchableOpacity style={styles.button} onPress={() => router.push('/checkout')} activeOpacity={0.85}>
      <Ionicons name="cart-outline" size={18} color="#fff" />
      <Text style={styles.text}>View Cart</Text>
      <Text style={styles.badge}>{itemCount}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0BA01E',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 6,
    gap: 8,
  },
  text: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  badge: {
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    paddingHorizontal: 5,
    textAlign: 'center',
    textAlignVertical: 'center',
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
});
