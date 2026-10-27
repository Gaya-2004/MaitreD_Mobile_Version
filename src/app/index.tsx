import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Animated,
  Easing,
  Platform,
  ScrollView,
  Modal,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons, MaterialCommunityIcons, Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useCartStore } from '../store/useCartStore';
import { useVoiceAgentStore } from '../store/useVoiceAgentStore';
import { useDineInSessionStore } from '../store/useDineInSessionStore';

const { width, height } = Dimensions.get('window');
const isSmallDevice = height < 750;

const LANGUAGES = [
  { code: 'en', label: 'English', native: 'English' },
  { code: 'ta', label: 'Tamil', native: 'தமிழ்' },
  { code: 'hi', label: 'Hindi', native: 'हिन्दी' },
  { code: 'kn', label: 'Kannada', native: 'ಕನ್ನಡ' },
  { code: 'te', label: 'Telugu', native: 'తెలుగు' },
];

export default function FrontLandingPage() {
  const router = useRouter();
  const setOrderType = useCartStore((s) => s.setOrderType);
  const setTableNumberCart = useCartStore((s) => s.setTableNumber);
  const showVoiceAgent = useVoiceAgentStore((s) => s.showAgent);
  const storeTableNumber = useDineInSessionStore((s) => s.tableNumber);

  const [tableNo, setTableNo] = useState(storeTableNumber || '06');
  const [selectedLanguage, setSelectedLanguage] = useState('English');
  const [isLangModalVisible, setIsLangModalVisible] = useState(false);
  const [isTableModalVisible, setIsTableModalVisible] = useState(false);
  const [tempTableInput, setTempTableInput] = useState(tableNo);

  // Animation values
  const bgOpacity = useRef(new Animated.Value(0)).current;
  const contentFade = useRef(new Animated.Value(0)).current;
  const chefScale = useRef(new Animated.Value(0.85)).current;
  const chefTranslateY = useRef(new Animated.Value(20)).current;
  const buttonsTranslateY = useRef(new Animated.Value(25)).current;
  const buttonsOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Smooth cinematic entrance
    Animated.parallel([
      Animated.timing(bgOpacity, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.timing(contentFade, {
        toValue: 1,
        duration: 900,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(chefScale, {
        toValue: 1,
        duration: 800,
        easing: Easing.out(Easing.back(1.4)),
        useNativeDriver: true,
      }),
      Animated.timing(chefTranslateY, {
        toValue: 0,
        duration: 800,
        easing: Easing.out(Easing.back(1.4)),
        useNativeDriver: true,
      }),
    ]).start();

    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(buttonsOpacity, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(buttonsTranslateY, {
          toValue: 0,
          duration: 600,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start();
    }, 300);

    return () => clearTimeout(timer);
  }, [bgOpacity, contentFade, chefScale, chefTranslateY, buttonsOpacity, buttonsTranslateY]);

  const handleTalkToAgent = () => {
    try {
      showVoiceAgent();
    } catch {
      router.push('/home');
    }
  };

  const handleDineIn = () => {
    setOrderType('Dine In');
    if (tableNo) {
      setTableNumberCart(tableNo);
    }
    router.push('/home');
  };

  const handleTakeAway = () => {
    setOrderType('Take Away');
    router.push('/home');
  };

  const handleSaveTableNumber = () => {
    const trimmed = tempTableInput.trim() || '06';
    setTableNo(trimmed);
    setTableNumberCart(trimmed);
    setIsTableModalVisible(false);
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Blurred South Indian Food Background (Reference Image 3) */}
      <Animated.Image
        source={require('../../assets/images/landing_food_bg.jpg')}
        style={[styles.backgroundImage, { opacity: bgOpacity }]}
        resizeMode="cover"
        blurRadius={Platform.OS === 'ios' ? 14 : 9}
      />

      {/* Dark Vignette Overlay for rich contrast */}
      <LinearGradient
        colors={[
          'rgba(12, 12, 12, 0.65)',
          'rgba(15, 15, 15, 0.76)',
          'rgba(8, 8, 8, 0.90)',
        ]}
        style={StyleSheet.absoluteFill}
      />

      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {/* Top Bar: Table Number & Language Switcher */}
          <View style={styles.topBar}>
            <TouchableOpacity
              style={styles.tableInfoContainer}
              activeOpacity={0.8}
              onPress={() => {
                setTempTableInput(tableNo);
                setIsTableModalVisible(true);
              }}
            >
              <Text style={styles.tableLabel}>Table no :</Text>
              <View style={styles.tableBadge}>
                <Text style={styles.tableBadgeText}>{tableNo}</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.languageButton}
              activeOpacity={0.8}
              onPress={() => setIsLangModalVisible(true)}
            >
              <Ionicons name="caret-up" size={10} color="#FFFFFF" style={styles.langCaret} />
              <Text style={styles.languageButtonText}>Languages</Text>
            </TouchableOpacity>
          </View>

          {/* Center Content: Chef Mascot, Welcome, Logo, Tagline */}
          <Animated.View
            style={[
              styles.centerContent,
              {
                opacity: contentFade,
              },
            ]}
          >
            {/* Chef Character Mascot */}
            <Animated.View
              style={[
                styles.chefWrapper,
                {
                  transform: [
                    { scale: chefScale },
                    { translateY: chefTranslateY },
                  ],
                },
              ]}
            >
              <Image
                source={require('../../assets/images/maitred_chef.png')}
                style={styles.chefImage}
                resizeMode="cover"
              />
            </Animated.View>

            {/* Welcome To Header */}
            <Text style={styles.welcomeTitle}>Welcome To</Text>

            {/* MaitreD Brand Logo */}
            <View style={styles.logoContainer}>
              <Image
                source={require('../../assets/images/maitred_logo.png')}
                style={styles.logoImage}
                resizeMode="contain"
              />
            </View>

            {/* Subtitle / Tagline */}
            <Text style={styles.tagline}>FRESH FLAVOURS · VEG & NON VEG</Text>
          </Animated.View>

          {/* Interactive Order Action Buttons */}
          <Animated.View
            style={[
              styles.actionsContainer,
              {
                opacity: buttonsOpacity,
                transform: [{ translateY: buttonsTranslateY }],
              },
            ]}
          >
            {/* Order Here Label */}
            <Text style={styles.orderHereTitle}>Order Here :</Text>

            {/* Primary Action: Talk to Agent */}
            <TouchableOpacity
              style={styles.primaryAgentButton}
              activeOpacity={0.86}
              onPress={handleTalkToAgent}
            >
              <Text style={styles.primaryAgentText}>Talk to Agent</Text>
              <View style={styles.soundDotsContainer}>
                <View style={styles.soundDot} />
                <View style={[styles.soundDot, { height: 9 }]} />
              </View>
            </TouchableOpacity>

            {/* Secondary Actions: Dine In & Take Away */}
            <View style={styles.dualButtonsRow}>
              <TouchableOpacity
                style={styles.secondaryButton}
                activeOpacity={0.86}
                onPress={handleDineIn}
              >
                <Text style={styles.secondaryButtonText}>Dine In</Text>
                <MaterialCommunityIcons
                  name="silverware-fork-knife"
                  size={16}
                  color="#1A1208"
                  style={styles.buttonIcon}
                />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.secondaryButton}
                activeOpacity={0.86}
                onPress={handleTakeAway}
              >
                <Text style={styles.secondaryButtonText}>Take Away</Text>
                <Feather
                  name="shopping-bag"
                  size={16}
                  color="#1A1208"
                  style={styles.buttonIcon}
                />
              </TouchableOpacity>
            </View>

            {/* Bottom Tagline */}
            <Text style={styles.footerHighlight}>Veg & Non-Veg Favourites</Text>
          </Animated.View>
        </ScrollView>
      </SafeAreaView>

      {/* Language Selection Modal */}
      <Modal
        visible={isLangModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsLangModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setIsLangModalVisible(false)}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Choose Language</Text>
              <TouchableOpacity
                onPress={() => setIsLangModalVisible(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={22} color="#D1D5DB" />
              </TouchableOpacity>
            </View>

            <View style={styles.langList}>
              {LANGUAGES.map((lang) => {
                const isSelected = selectedLanguage === lang.label;
                return (
                  <TouchableOpacity
                    key={lang.code}
                    style={[
                      styles.langOption,
                      isSelected && styles.langOptionSelected,
                    ]}
                    activeOpacity={0.7}
                    onPress={() => {
                      setSelectedLanguage(lang.label);
                      setIsLangModalVisible(false);
                    }}
                  >
                    <View>
                      <Text
                        style={[
                          styles.langOptionText,
                          isSelected && styles.langOptionTextSelected,
                        ]}
                      >
                        {lang.label}
                      </Text>
                      <Text style={styles.langOptionNative}>{lang.native}</Text>
                    </View>
                    {isSelected && (
                      <Ionicons name="checkmark-circle" size={20} color="#DF9B34" />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Table Number Edit Modal */}
      <Modal
        visible={isTableModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsTableModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setIsTableModalVisible(false)}
        >
          <View style={styles.tableModalCard}>
            <Text style={styles.modalTitle}>Enter Table Number</Text>
            <Text style={styles.modalSubtitle}>
              Please verify or change your current restaurant table number
            </Text>

            <TextInput
              style={styles.tableInput}
              value={tempTableInput}
              onChangeText={setTempTableInput}
              keyboardType="number-pad"
              maxLength={4}
              placeholder="06"
              placeholderTextColor="#6B7280"
              autoFocus
            />

            <View style={styles.modalButtonsRow}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setIsTableModalVisible(false)}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmBtn}
                onPress={handleSaveTableNumber}
              >
                <Text style={styles.confirmBtnText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0c0c0c',
  },
  backgroundImage: {
    ...StyleSheet.absoluteFill,
    width: '100%',
    height: '100%',
  },
  safeArea: {
    flex: 1,
    zIndex: 10,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    paddingTop: Platform.OS === 'android' ? 12 : 6,
    paddingBottom: Platform.OS === 'ios' ? 24 : 18,
  },

  /* Top Bar */
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingTop: 4,
  },
  tableInfoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tableLabel: {
    fontSize: isSmallDevice ? 14 : 15,
    fontWeight: '600',
    color: '#E5E7EB',
    letterSpacing: 0.2,
  },
  tableBadge: {
    width: isSmallDevice ? 36 : 40,
    height: isSmallDevice ? 36 : 40,
    borderRadius: 20,
    backgroundColor: '#DF9B34',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 4,
  },
  tableBadgeText: {
    color: '#18181B',
    fontSize: isSmallDevice ? 15 : 17,
    fontWeight: '900',
    includeFontPadding: false,
  },
  languageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(55, 55, 55, 0.85)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.22)',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 2,
  },
  langCaret: {
    marginRight: 6,
  },
  languageButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },

  /* Center Mascot & Branding */
  centerContent: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: isSmallDevice ? 6 : 14,
  },
  chefWrapper: {
    width: isSmallDevice ? 130 : 150,
    height: isSmallDevice ? 140 : 162,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'flex-start',
    marginBottom: isSmallDevice ? 4 : 8,
  },
  chefImage: {
    width: isSmallDevice ? 145 : 170,
    height: isSmallDevice ? 250 : 285,
    position: 'absolute',
    top: 0,
  },
  welcomeTitle: {
    fontSize: isSmallDevice ? 24 : 28,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.4,
    textAlign: 'center',
    marginBottom: 4,
  },
  logoContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: isSmallDevice ? 2 : 4,
  },
  logoImage: {
    width: Math.min(width * 0.84, 310),
    height: isSmallDevice ? 72 : 86,
  },
  tagline: {
    color: 'rgba(255, 255, 255, 0.92)',
    fontSize: isSmallDevice ? 10.5 : 11.5,
    fontWeight: '700',
    letterSpacing: 1.4,
    textAlign: 'center',
    marginTop: 6,
  },

  /* Actions Section */
  actionsContainer: {
    width: '100%',
    alignItems: 'center',
    marginTop: isSmallDevice ? 16 : 24,
  },
  orderHereTitle: {
    fontSize: isSmallDevice ? 16 : 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: isSmallDevice ? 12 : 16,
    textAlign: 'center',
  },
  primaryAgentButton: {
    backgroundColor: '#DF9B34',
    height: isSmallDevice ? 48 : 52,
    borderRadius: 26,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#DF9B34',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 4,
  },
  primaryAgentText: {
    color: '#1C160B',
    fontSize: isSmallDevice ? 15 : 16,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  soundDotsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  soundDot: {
    width: 3.5,
    height: 6,
    backgroundColor: '#1C160B',
    borderRadius: 1.5,
  },
  dualButtonsRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
    marginTop: 12,
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: '#DF9B34',
    height: isSmallDevice ? 46 : 50,
    borderRadius: 25,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#DF9B34',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 5,
    elevation: 3,
  },
  secondaryButtonText: {
    color: '#1C160B',
    fontSize: isSmallDevice ? 14 : 15,
    fontWeight: '800',
  },
  buttonIcon: {
    marginLeft: 7,
  },
  footerHighlight: {
    fontSize: isSmallDevice ? 16 : 18,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    marginTop: isSmallDevice ? 20 : 28,
    marginBottom: isSmallDevice ? 6 : 12,
    letterSpacing: 0.3,
  },

  /* Modals */
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: '#1E1E20',
    borderRadius: 18,
    width: '100%',
    maxWidth: 340,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#9CA3AF',
    marginTop: 4,
    marginBottom: 16,
  },
  langList: {
    gap: 8,
  },
  langOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  langOptionSelected: {
    backgroundColor: 'rgba(223, 155, 52, 0.15)',
    borderWidth: 1,
    borderColor: '#DF9B34',
  },
  langOptionText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#E5E7EB',
  },
  langOptionTextSelected: {
    color: '#DF9B34',
    fontWeight: '700',
  },
  langOptionNative: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 2,
  },
  tableModalCard: {
    backgroundColor: '#1E1E20',
    borderRadius: 18,
    width: '100%',
    maxWidth: 320,
    padding: 22,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
  },
  tableInput: {
    backgroundColor: '#2A2A2D',
    borderWidth: 1,
    borderColor: '#DF9B34',
    borderRadius: 12,
    width: 110,
    height: 54,
    fontSize: 26,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 20,
  },
  modalButtonsRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  cancelBtnText: {
    color: '#D1D5DB',
    fontWeight: '600',
    fontSize: 14,
  },
  confirmBtn: {
    flex: 1,
    backgroundColor: '#DF9B34',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  confirmBtnText: {
    color: '#18181B',
    fontWeight: '700',
    fontSize: 14,
  },
});
