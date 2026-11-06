import React, { ReactNode } from 'react';
import { View, StyleSheet, Platform, useWindowDimensions } from 'react-native';

interface ResponsiveContainerProps {
  children: ReactNode;
}

export default function ResponsiveContainer({ children }: ResponsiveContainerProps) {
  const { width } = useWindowDimensions();
  const isWideWeb = Platform.OS === 'web' && width > 500;

  if (!isWideWeb) {
    return <View style={styles.nativeRoot}>{children}</View>;
  }

  return (
    <View style={styles.webOuter}>
      <View style={styles.phoneFrame}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  nativeRoot: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  webOuter: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: '#0d0e12',
    alignItems: 'center',
    justifyContent: 'center',
  },
  phoneFrame: {
    flex: 1,
    width: '100%',
    maxWidth: 460,
    backgroundColor: '#fff',
    position: 'relative',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 25,
    elevation: 20,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
});
