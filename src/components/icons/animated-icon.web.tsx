import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, View, Text, ImageBackground, Image, Animated, Easing } from 'react-native';

const DURATION = 3500;

export function AnimatedSplashOverlay() {
  const [visible, setVisible] = useState(true);
  const [opacityAnim] = useState(() => new Animated.Value(1));
  const [logoScale] = useState(() => new Animated.Value(0.3));
  const [mascotTranslateY] = useState(() => new Animated.Value(80));

  useEffect(() => {
    Animated.parallel([
      Animated.spring(logoScale, {
        toValue: 1,
        friction: 3,
        tension: 40,
        useNativeDriver: true,
      }),
      Animated.spring(mascotTranslateY, {
        toValue: 0,
        friction: 4,
        tension: 45,
        useNativeDriver: true,
      }),
    ]).start();

    const timer = setTimeout(() => {
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }).start(() => setVisible(false));
    }, DURATION);

    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return (
    <Animated.View style={[styles.splashContainer, { opacity: opacityAnim }]}>
      <ImageBackground
        source={require('../../../assets/images/logo-glow.png')}
        style={styles.background}
        blurRadius={10}
      >
        <View style={styles.overlay}>
          <Animated.View style={{ transform: [{ scale: logoScale }], alignItems: 'center' }}>
            <Image
              source={require('../../../assets/images/Dataudupi-Title.jpg')}
              style={styles.logo}
              resizeMode="contain"
            />
          </Animated.View>

          <Text style={styles.subtitle}>
            40 YEARS OF EXCELLENCE IN SOUTH INDIAN VEGETARIAN CUISINE
          </Text>

          <Animated.View
            style={[
              styles.mascotContainer,
              { transform: [{ translateY: mascotTranslateY }] },
            ]}
          >
            <Image
              source={require('../../../assets/images/chef_mascot.png')}
              style={styles.mascot}
              resizeMode="contain"
            />
          </Animated.View>
        </View>
      </ImageBackground>
    </Animated.View>
  );
}

export function AnimatedIcon() {
  return null;
}

const styles = StyleSheet.create({
  splashContainer: {
    ...(StyleSheet.absoluteFill as any),
    zIndex: 9999,
  },
  background: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 30,
  },
  logo: {
    width: 260,
    height: 85,
    marginBottom: 20,
  },
  subtitle: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 2.2,
    lineHeight: 18,
    marginBottom: 50,
  },
  mascotContainer: {
    alignItems: 'center',
    marginTop: 10,
  },
  mascot: {
    width: 280,
    height: 200,
  },
});
