import React, { useEffect, useState, useCallback } from 'react';
import { View, Image, StyleSheet, Dimensions, StatusBar, TouchableOpacity, Animated, Easing, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuthStore, useRestaurantStore } from '../store';

const { width, height } = Dimensions.get('window');
const isSmallDevice = height < 750;

export default function SplashScreen() {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();
  const { selectedOutlet } = useRestaurantStore();

  const navigateToHome = useCallback(() => {
    if (isAuthenticated) {
      if (selectedOutlet) {
        router.replace('/home');
      } else {
        router.replace('/outlet-selector');
      }
    } else {
      router.replace('/login');
    }
  }, [isAuthenticated, selectedOutlet, router]);

  useEffect(() => {
    const timer = setTimeout(navigateToHome, 3500);
    return () => clearTimeout(timer);
  }, [navigateToHome]);

  // Animated values using React Native built-in Animated with stable useState lazy initializers
  const [bgScale] = useState(() => new Animated.Value(1.08));
  const [bgOpacity] = useState(() => new Animated.Value(0));
  const [topBoardTranslateY] = useState(() => new Animated.Value(-35));
  const [welcomeOpacity] = useState(() => new Animated.Value(0));
  const [welcomeTranslateY] = useState(() => new Animated.Value(-12));
  const [logoScale] = useState(() => new Animated.Value(0.8));
  const [logoOpacity] = useState(() => new Animated.Value(0));
  const [subOpacity] = useState(() => new Animated.Value(0));
  const [subTranslateY] = useState(() => new Animated.Value(12));
  const [mascotOpacity] = useState(() => new Animated.Value(0));
  const [mascotTranslateY] = useState(() => new Animated.Value(30));
  const [loaderOpacity] = useState(() => new Animated.Value(0));
  const [rotation] = useState(() => new Animated.Value(0));

  useEffect(() => {
    // 1. Background Image
    Animated.parallel([
      Animated.timing(bgOpacity, { toValue: 1, duration: 800, useNativeDriver: true }),
      Animated.timing(bgScale, { toValue: 1, duration: 1500, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start();

    // 2. Top Banner
    Animated.timing(topBoardTranslateY, {
      toValue: 0,
      duration: 750,
      easing: Easing.out(Easing.back(1.4)),
      useNativeDriver: true,
    }).start();

    // 3. "Welcome To" Text
    const timer1 = setTimeout(() => {
      Animated.parallel([
        Animated.timing(welcomeOpacity, { toValue: 1, duration: 650, useNativeDriver: true }),
        Animated.timing(welcomeTranslateY, { toValue: 0, duration: 650, easing: Easing.out(Easing.back(1.5)), useNativeDriver: true }),
      ]).start();
    }, 200);

    // 4. Main logo
    const timer2 = setTimeout(() => {
      Animated.parallel([
        Animated.timing(logoOpacity, { toValue: 1, duration: 650, useNativeDriver: true }),
        Animated.timing(logoScale, { toValue: 1, duration: 650, easing: Easing.out(Easing.back(1.5)), useNativeDriver: true }),
      ]).start();
    }, 450);

    // 5. Subtitle Text
    const timer3 = setTimeout(() => {
      Animated.parallel([
        Animated.timing(subOpacity, { toValue: 1, duration: 650, useNativeDriver: true }),
        Animated.timing(subTranslateY, { toValue: 0, duration: 650, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ]).start();
    }, 700);

    // 6. Chef Mascot
    const timer4 = setTimeout(() => {
      Animated.parallel([
        Animated.timing(mascotOpacity, { toValue: 1, duration: 750, useNativeDriver: true }),
        Animated.timing(mascotTranslateY, { toValue: 0, duration: 750, easing: Easing.out(Easing.back(1.4)), useNativeDriver: true }),
      ]).start();
    }, 950);

    // 7. Loader Spinner
    const timer5 = setTimeout(() => {
      Animated.timing(loaderOpacity, { toValue: 1, duration: 450, useNativeDriver: true }).start();
    }, 1200);

    // 8. Infinite spinner rotation
    Animated.loop(
      Animated.timing(rotation, {
        toValue: 1,
        duration: 1200,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
      clearTimeout(timer4);
      clearTimeout(timer5);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const spin = rotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000000" translucent />

      {/* Background Image with subtle zoom */}
      <Animated.Image
        source={require('../../assets/images/frontpage_bg.png')}
        style={[
          styles.backgroundImage,
          {
            opacity: bgOpacity,
            transform: [{ scale: bgScale }],
          },
        ]}
        resizeMode="cover"
      />

      {/* Dark Overlay for High Contrast */}
      <View style={styles.overlay} />

      {/* Interactive Container that leads directly into app */}
      <TouchableOpacity activeOpacity={1} style={styles.touchableWrapper} onPress={navigateToHome}>
        <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
          {/* Top Hanging Banner Section */}
          <View style={styles.topSection}>
            <Animated.View style={{ transform: [{ translateY: topBoardTranslateY }] }}>
              <Image
                source={require('../../assets/images/udupi-banner.png')}
                style={styles.topBannerImage}
                resizeMode="contain"
              />
            </Animated.View>
          </View>

          {/* Middle Section: Centered Brand Logo & Tagline */}
          <View style={styles.middleSection}>
            <Animated.Text
              style={[
                styles.welcomeText,
                {
                  opacity: welcomeOpacity,
                  transform: [{ translateY: welcomeTranslateY }],
                },
              ]}
            >
              Welcome To
            </Animated.Text>

            <Animated.Image
              source={require('../../assets/images/Dataudupi.png')}
              style={[
                styles.logo,
                {
                  opacity: logoOpacity,
                  transform: [{ scale: logoScale }],
                },
              ]}
              resizeMode="contain"
            />

            <Animated.Text
              style={[
                styles.subtitleText,
                {
                  opacity: subOpacity,
                  transform: [{ translateY: subTranslateY }],
                },
              ]}
            >
              {"40 YEARS OF EXCELLENCE IN SOUTH INDIAN\nVEGETARIAN CUISINE"}
            </Animated.Text>
          </View>

          {/* Bottom Section: Perfectly Aligned Mascot & Glowing Spinner */}
          <View style={styles.bottomSection}>
            <Animated.Image
              source={require('../../assets/images/chef_mascot.png')}
              style={[
                styles.mascot,
                {
                  opacity: mascotOpacity,
                  transform: [{ translateY: mascotTranslateY }],
                },
              ]}
              resizeMode="contain"
            />

            <Animated.View style={[styles.loadingContainer, { opacity: loaderOpacity }]}>
              <Animated.View style={[styles.spinnerRing, { transform: [{ rotate: spin }] }]}>
                <View style={styles.spinnerDot} />
              </Animated.View>
            </Animated.View>
          </View>
        </SafeAreaView>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  backgroundImage: {
    ...StyleSheet.absoluteFill,
    width: '100%',
    height: '100%',
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.78)',
  },
  touchableWrapper: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  safeArea: {
    flex: 1,
    width: '100%',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 8 : 4,
    paddingBottom: Platform.OS === 'ios' ? 24 : 16,
  },
  topSection: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  topBannerImage: {
    width: Math.min(width * 0.68, 240),
    height: isSmallDevice ? 56 : 68,
  },
  middleSection: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  welcomeText: {
    color: '#ffffff',
    fontSize: isSmallDevice ? 17 : 20,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    letterSpacing: 4,
    marginBottom: isSmallDevice ? 8 : 12,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  logo: {
    width: Math.min(width * 0.82, 300),
    height: isSmallDevice ? 72 : 88,
    marginBottom: isSmallDevice ? 10 : 14,
  },
  subtitleText: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: isSmallDevice ? 10.5 : 11.5,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    letterSpacing: 1.8,
    lineHeight: isSmallDevice ? 16 : 18,
    textAlign: 'center',
  },
  bottomSection: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  mascot: {
    width: isSmallDevice ? 140 : Math.min(width * 0.46, 175),
    height: isSmallDevice ? 140 : Math.min(width * 0.46, 175),
    marginBottom: 8,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 32,
  },
  spinnerRing: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2.5,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderTopColor: '#ff4500',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  spinnerDot: {
    width: 4.5,
    height: 4.5,
    borderRadius: 2.25,
    backgroundColor: '#ff4500',
    position: 'absolute',
    top: 1,
  },
});
