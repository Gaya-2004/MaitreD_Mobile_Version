import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function CartBottomSheet() {
  return (
    <View style={styles.container}>
      <Text>Cart Bottom Sheet placeholder</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderColor: '#eee',
  },
});
