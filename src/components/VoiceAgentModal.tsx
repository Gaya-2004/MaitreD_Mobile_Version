/**
 * VoiceAgentModal.tsx
 *
 * PHASES 4, 13 — Complete Voice Agent UI
 *
 * Features:
 *   - Floating "Talk to Chef" pill FAB that opens the modal
 *   - Auto-starts the Vapi call when modal opens
 *   - Real-time partial transcript (zero lag)
 *   - Merged final transcript (no split bubbles)
 *   - Mute/unmute toggle
 *   - Stop agent button
 *   - Animated speaking indicator
 *   - Suggestion pills when empty
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  View,
  Modal,
  Image,
  ScrollView,
  Dimensions,
  Animated,
  Easing,
  PanResponder,
  Platform,
} from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVapiStore } from '../store/vapiStore';
import { Ionicons, FontAwesome5 } from '@expo/vector-icons';
import { useVoiceAgentStore } from '../store/useVoiceAgentStore';
import { useCartStore } from '../store/useCartStore';
import { useDineInSessionStore } from '../store/useDineInSessionStore';
import { setActiveRouter } from '../utils/mobileAgentActionDispatcher';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function VoiceAgentModal() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const cartItemCount = useCartStore((state) => (state.items ? Object.keys(state.items).length : 0));
  const isDineInActive = useDineInSessionStore((state) => state.isActive && !!state.activeOrderId);

  // ── Screen & Navigation Reflexive Detection ─────────────────────────────────
  const BOTTOM_NAV_SCREENS = [
    'home',
    'for-you',
    'orders',
    'order-details',
    'profile',
    'rewards',
    'my-addresses',
    'add-address',
    'payment-methods',
    'search',
  ];
  const hasBottomNav = !pathname || BOTTOM_NAV_SCREENS.some((s) => pathname.includes(s));

  const isCheckoutScreen = [
    'checkout',
    'payment',
    'delivery-checkout',
    'catering-advance-payment',
    'catering-balance-payment',
    'catering-razorpay-checkout',
  ].some((s) => pathname?.includes(s));

  const isHomeScreen = !pathname || pathname === '/' || pathname === '/(main)' || pathname.includes('home');
  const isForYouScreen = pathname?.includes('for-you');
  const isMenuScreen = pathname?.includes('menu');
  const isOrdersScreen = ['orders', 'order-details'].some((s) => pathname?.includes(s));
  const isRewardsScreen = pathname?.includes('rewards');
  const hasViewCartBar = (isHomeScreen || isForYouScreen || isMenuScreen) && cartItemCount > 0;

  // Compute adaptive bottom clearance so FAB sits right above ViewCartButton, BottomNav, or sticky footers
  const baseBottom = Math.max(insets.bottom, Platform.OS === 'android' ? 24 : 16);
  let computedFabBottom = baseBottom + 20;

  if (hasViewCartBar && hasBottomNav) {
    // Both BottomNavBar (~70px) and ViewCartButton (~48px) are present (e.g. on For You or Home)
    // ViewCartButton sits at baseBottom + 76, height ~48px (top is at baseBottom + 124).
    // Sits right above ViewCartButton with a 12px margin.
    computedFabBottom = baseBottom + 136;
  } else if (hasViewCartBar) {
    // Only ViewCartButton without BottomNav (e.g. Menu)
    // ViewCartButton sits at insets.bottom + 24, height ~48px (top is at baseBottom + 72).
    // Sits right above ViewCartButton with a 12px margin.
    computedFabBottom = baseBottom + 84;
  } else if (hasBottomNav) {
    // BottomNav present without ViewCartButton
    computedFabBottom = baseBottom + 84;
  } else if (isCheckoutScreen) {
    // Checkout screens with sticky footer
    computedFabBottom = baseBottom + 78;
  }

  // ── Reflexive Content Mapping ──────────────────────────────────────────────
  const routeContext = React.useMemo(() => {
    if (isForYouScreen) {
      return {
        screenKey: 'for-you',
        badgeLabel: 'For You • AI Curated',
        badgeIcon: 'sparkles' as const,
        fabTitle: "Agent's Picks",
        fabSubtitle: '✨ For You',
        fabCompact: false,
        suggestions: [
          'What dishes are recommended for me?',
          'Tell me about today\'s personalized combos',
          'Why was Curd Vadai recommended for me?',
          'Add recommended items to my cart',
        ],
      };
    }
    if (isCheckoutScreen) {
      return {
        screenKey: 'checkout',
        badgeLabel: 'Cart & Bill Assistance',
        badgeIcon: 'cart' as const,
        fabTitle: 'Agent Help',
        fabSubtitle: 'Bill & Order',
        fabCompact: true,
        suggestions: [
          'What is my final total bill amount?',
          'Can you apply the best discount code?',
          'Switch order to Pay Later Dine-In',
          'Review items currently in my cart',
        ],
      };
    }
    if (isMenuScreen) {
      return {
        screenKey: 'menu',
        badgeLabel: 'Menu & Specials',
        badgeIcon: 'restaurant' as const,
        fabTitle: 'Talk to Agent',
        fabSubtitle: 'Ask about dishes',
        fabCompact: false,
        suggestions: [
          'What are today\'s South Indian specials?',
          'Show pure vegetarian breakfast options',
          'Add 2 Masala Dosas to my cart',
          'Do you have authentic filter coffee?',
        ],
      };
    }
    if (isOrdersScreen) {
      return {
        screenKey: 'orders',
        badgeLabel: 'Live Order Tracker',
        badgeIcon: 'time' as const,
        fabTitle: 'Order Help',
        fabSubtitle: 'Track order',
        fabCompact: false,
        suggestions: [
          'Where is my active order right now?',
          'What is my estimated delivery time?',
          'Reorder my previous meal',
          'Help me contact restaurant support',
        ],
      };
    }
    if (isRewardsScreen) {
      return {
        screenKey: 'rewards',
        badgeLabel: 'Rewards & Offers',
        badgeIcon: 'gift' as const,
        fabTitle: 'Agent Rewards',
        fabSubtitle: 'Points & deals',
        fabCompact: false,
        suggestions: [
          'How many reward points do I have?',
          'How can I redeem my loyalty points?',
          'Show available discount vouchers',
          'How do I earn more Udipi points?',
        ],
      };
    }
    return {
      screenKey: 'home',
      badgeLabel: 'Udipi Dining Assistant',
      badgeIcon: 'restaurant' as const,
      fabTitle: 'Talk to Agent',
      fabSubtitle: 'Tap to speak',
      fabCompact: false,
      suggestions: [
        'What should I eat today?',
        'Show me today\'s special menu',
        'Add Masala Dosa to my cart',
        'Track my current order',
      ],
    };
  }, [pathname]);

  // Subscribe with granular selectors
  const setupListeners = useVapiStore((s) => s.setupListeners);
  const startCall = useVapiStore((s) => s.startCall);
  const stopCall = useVapiStore((s) => s.stopCall);
  const prewarm = useVapiStore((s) => s.prewarm);
  const clearMessages = useVapiStore((s) => s.clearMessages);
  const toggleMute = useVapiStore((s) => s.toggleMute);
  const isConnected = useVapiStore((s) => s.isConnected);
  const isConnecting = useVapiStore((s) => s.isConnecting);
  const isMuted = useVapiStore((s) => s.isMuted);
  const messages = useVapiStore((s) => s.messages);
  const partialUserTranscript = useVapiStore((s) => s.partialUserTranscript);
  const partialAgentTranscript = useVapiStore((s) => s.partialAgentTranscript);
  const sendTextMessage = useVapiStore((s) => s.sendTextMessage);

  const { isVisible, showAgent, hideAgent } = useVoiceAgentStore();
  const scrollViewRef = useRef<ScrollView>(null);

  // Pulse animation for speaking indicator
  const [pulseAnim] = useState(() => new Animated.Value(1));

  // Load native voice SDK ahead of the first tap
  useEffect(() => {
    prewarm();
  }, [prewarm]);

  // Start pulse when connected & speaking
  const isAgentSpeaking = isConnected && !!partialAgentTranscript;
  useEffect(() => {
    if (isAgentSpeaking) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.15, duration: 600, easing: Easing.ease, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1.0, duration: 600, easing: Easing.ease, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
    }
  }, [isAgentSpeaking, pulseAnim]);

  // Notify Vapi when route changes
  useEffect(() => {
    if (isConnected && pathname) {
      const vapiStore = useVapiStore.getState();
      if (vapiStore.notifyRouteChanged) {
        vapiStore.notifyRouteChanged(pathname);
      }
    }
  }, [pathname, isConnected]);

  // Frame-aligned auto-scroll
  const scrollFrameRef = useRef<number | null>(null);
  useEffect(() => {
    if (!isVisible) return;
    if (scrollFrameRef.current !== null) {
      cancelAnimationFrame(scrollFrameRef.current);
    }
    scrollFrameRef.current = requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      scrollViewRef.current?.scrollToEnd({ animated: false });
    });
    return () => {
      if (scrollFrameRef.current !== null) {
        cancelAnimationFrame(scrollFrameRef.current);
        scrollFrameRef.current = null;
      }
    };
  }, [messages, partialUserTranscript, partialAgentTranscript, isVisible]);

  useEffect(() => {
    setActiveRouter(router);
  }, [router]);

  const openModal = () => {
    setActiveRouter(router);
    showAgent();
    // Auto-start Vapi call when modal opens
    if (!isConnected && !isConnecting) {
      setupListeners(router);
      startCall();
    }
    if (pathname && isConnected) {
      useVapiStore.getState().notifyRouteChanged(pathname);
    }
  };

  const closeModal = () => {
    hideAgent();
  };

  const endCall = () => {
    stopCall();
    clearMessages();
    hideAgent();
  };

  const handleSuggestionPress = (sug: string) => {
    setActiveRouter(router);
    if (!isConnected && !isConnecting) {
      setupListeners(router);
      startCall();
    }
    if (sendTextMessage) {
      sendTextMessage(sug);
    }
  };

  const [pan] = useState(() => new Animated.ValueXY());
  const [isDragging, setIsDragging] = useState(false);

  const [panResponder] = useState(() =>
    PanResponder.create({
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        return Math.abs(gestureState.dx) > 5 || Math.abs(gestureState.dy) > 5;
      },
      onPanResponderGrant: () => {
        pan.extractOffset();
        setIsDragging(true);
      },
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false }),
      onPanResponderRelease: () => {
        pan.flattenOffset();
        setIsDragging(false);
      },
    })
  );

  const isHiddenScreen =
    !pathname ||
    pathname === '/' ||
    pathname === '/index' ||
    ['/login', '/signup', '/verify-otp', 'catering-order-success'].some((r) => pathname.includes(r));

  if (isHiddenScreen && !isVisible) {
    return null;
  }

  return (
    <>
      {/* Floating pill FAB */}
      {!isVisible && (
        <Animated.View
          {...panResponder.panHandlers}
          style={[
            styles.fabPill,
            routeContext.fabCompact ? styles.fabCompact : null,
            { bottom: computedFabBottom },
            isConnected ? styles.fabActive : null,
            { transform: pan.getTranslateTransform() },
            isDragging ? { borderRadius: 30, paddingHorizontal: 8 } : null,
          ]}
        >
          <TouchableOpacity
            onPress={openModal}
            activeOpacity={0.8}
            style={styles.fabTouchable}
            disabled={isDragging}
          >
            <View style={[styles.fabAvatarBg, routeContext.fabCompact && styles.fabAvatarBgCompact, isDragging && { marginRight: 0 }]}>
              <Image
                source={require('../../assets/images/agent_waiter.png')}
                style={routeContext.fabCompact ? styles.fabChefMascotCompact : styles.fabChefMascot}
                resizeMode="cover"
              />
              {isConnected && routeContext.fabCompact && <View style={styles.fabCompactLiveDot} />}
            </View>

            {!isDragging && !routeContext.fabCompact && (
              <View style={styles.fabTextWrapper}>
                <View style={styles.fabTitleRow}>
                  <Text style={styles.fabPillTitle}>{routeContext.fabTitle}</Text>
                  {isForYouScreen && (
                    <View style={styles.fabAiMiniBadge}>
                      <Ionicons name="sparkles" size={9} color="#ff4500" />
                    </View>
                  )}
                </View>
                <View style={styles.fabPillSubtitleRow}>
                  <Ionicons
                    name={isConnected ? 'radio' : isForYouScreen ? 'sparkles-outline' : 'mic'}
                    size={11}
                    color={isConnected ? '#0BA01E' : '#ff4500'}
                  />
                  <Text style={[styles.fabPillSubtitle, isConnected && styles.fabPillSubtitleLive]}>
                    {isConnected ? 'Live' : routeContext.fabSubtitle}
                  </Text>
                </View>
              </View>
            )}

            {isConnected && !isDragging && !routeContext.fabCompact && <View style={styles.fabLiveDot} />}
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* Rich UI Modal */}
      <Modal animationType="slide" transparent={true} visible={isVisible} onRequestClose={closeModal}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.headerLeft}>
                <View style={styles.headerTitleRow}>
                  <Text style={styles.headerTitle}>Data Udipi Assistant</Text>
                  <View style={styles.contextBadge}>
                    <Ionicons name={routeContext.badgeIcon} size={11} color="#ff4500" />
                    <Text style={styles.contextBadgeText}>{routeContext.badgeLabel}</Text>
                  </View>
                </View>
                <Text style={[styles.headerSubtitle, isConnected && styles.headerSubtitleLive]}>
                  {isConnecting
                    ? 'Connecting to Chef...'
                    : isConnected
                    ? '● Live Voice Session'
                    : 'Tap suggestion or start speaking below'}
                </Text>
              </View>
              <TouchableOpacity onPress={closeModal} style={styles.closeButton}>
                <Ionicons name="close" size={22} color="#333" />
              </TouchableOpacity>
            </View>

            {/* Avatar Section */}
            <View style={styles.avatarContainer}>
              <Animated.View style={[styles.pulseRing, { transform: [{ scale: pulseAnim }] }]} />
              <Image
                source={require('../../assets/images/agent_waiter.png')}
                style={styles.chefAvatar}
                resizeMode="contain"
              />
              <View style={[styles.statusBadge, isConnected ? styles.statusBadgeActive : null]}>
                <FontAwesome5 name={isConnected ? 'microphone' : 'user-tie'} size={11} color="white" />
              </View>
            </View>

            {/* Chat Body */}
            <ScrollView
              ref={scrollViewRef}
              style={styles.chatBody}
              contentContainerStyle={{ paddingBottom: 20 }}
              showsVerticalScrollIndicator={false}
            >
              {messages.length === 0 && !partialAgentTranscript && !partialUserTranscript ? (
                /* Empty State */
                <View style={styles.emptyState}>
                  <Text style={styles.greetingTitle}>
                    {isConnecting ? 'Connecting…' : isConnected ? 'Listening to you…' : "Hi! I'm your Udipi Chef."}
                  </Text>
                  <Text style={styles.greetingSubtitle}>How can I help you today?</Text>
                  <View style={styles.suggestionsContainer}>
                    <Text style={styles.suggestionsHeader}>Quick Suggestions</Text>
                    {routeContext.suggestions.map((sug, idx) => (
                      <TouchableOpacity
                        key={idx}
                        style={styles.suggestionPill}
                        onPress={() => handleSuggestionPress(sug)}
                        activeOpacity={0.75}
                      >
                        <View style={styles.suggestionIconBg}>
                          <FontAwesome5 name="lightbulb" size={11} color="#ff4500" />
                        </View>
                        <Text style={styles.suggestionText}>{sug}</Text>
                        <Ionicons name="arrow-forward" size={13} color="#bbb" style={{ marginLeft: 'auto' }} />
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              ) : (
                /* Message List */
                <View style={styles.messageList}>
                  {messages.map((msg, idx) => (
                    <View
                      key={idx}
                      style={[
                        styles.messageWrapper,
                        msg.role === 'user' ? styles.messageWrapperUser : styles.messageWrapperAgent,
                      ]}
                    >
                      {msg.role !== 'user' && (
                        <View style={styles.smallAvatar}>
                          <Image
                            source={require('../../assets/images/agent_waiter.png')}
                            style={styles.tinyChef}
                          />
                        </View>
                      )}
                      <View
                        style={[
                          styles.messageBubble,
                          msg.role === 'user' ? styles.messageBubbleUser : styles.messageBubbleAgent,
                        ]}
                      >
                        <Text
                          style={[
                            styles.messageText,
                            msg.role === 'user' ? styles.messageTextUser : styles.messageTextAgent,
                          ]}
                        >
                          {msg.text}
                        </Text>
                      </View>
                      {msg.role === 'user' && (
                        <View style={styles.smallAvatarUser}>
                          <FontAwesome5 name="user" size={14} color="white" />
                        </View>
                      )}
                    </View>
                  ))}

                  {/* Partial Agent Bubble — shown in real-time, no lag */}
                  {partialAgentTranscript ? (
                    <View style={[styles.messageWrapper, styles.messageWrapperAgent]}>
                      <View style={styles.smallAvatar}>
                        <Image
                          source={require('../../assets/images/agent_waiter.png')}
                          style={styles.tinyChef}
                        />
                      </View>
                      <View style={[styles.messageBubble, styles.messageBubbleAgent]}>
                        <Text style={[styles.messageText, styles.messageTextAgent, { opacity: 0.75 }]}>
                          {partialAgentTranscript}
                        </Text>
                      </View>
                    </View>
                  ) : null}

                  {/* Partial User Bubble — shown while user is speaking */}
                  {partialUserTranscript ? (
                    <View style={[styles.messageWrapper, styles.messageWrapperUser]}>
                      <View style={[styles.messageBubble, styles.messageBubbleUser]}>
                        <Text style={[styles.messageText, styles.messageTextUser, { opacity: 0.75 }]}>
                          {partialUserTranscript}
                        </Text>
                      </View>
                      <View style={styles.smallAvatarUser}>
                        <FontAwesome5 name="user" size={14} color="white" />
                      </View>
                    </View>
                  ) : null}
                </View>
              )}
            </ScrollView>

            {/* Footer Controls */}
            <View style={styles.footer}>
              {!isConnected ? (
                <TouchableOpacity
                  style={[styles.startButton, isConnecting && styles.startButtonConnecting]}
                  onPress={startCall}
                  disabled={isConnecting}
                  activeOpacity={0.85}
                >
                  <Ionicons name="mic" size={22} color="white" style={{ marginRight: 10 }} />
                  <Text style={styles.startButtonText}>
                    {isConnecting ? 'Connecting…' : 'Start Speaking'}
                  </Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.activeControlsContainer}>
                  {/* Mute / Unmute */}
                  <TouchableOpacity
                    style={[styles.muteButton, isMuted ? styles.muteButtonActive : null]}
                    onPress={toggleMute}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name={isMuted ? 'mic-off' : 'mic'}
                      size={22}
                      color={isMuted ? 'white' : '#333'}
                    />
                    <Text style={[styles.muteLabel, isMuted && { color: 'white' }]}>
                      {isMuted ? 'Unmute' : 'Mute'}
                    </Text>
                  </TouchableOpacity>

                  {/* Stop Agent */}
                  <TouchableOpacity style={styles.stopButton} onPress={endCall} activeOpacity={0.85}>
                    <Ionicons name="stop-circle" size={22} color="white" style={{ marginRight: 8 }} />
                    <Text style={styles.stopButtonText}>Stop Agent</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  fabPill: {
    position: 'absolute',
    right: 16,
    backgroundColor: '#ffffff',
    borderRadius: 30,
    paddingVertical: 7,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#ff4500',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 6,
    borderWidth: 1,
    borderColor: '#ffeedd',
    zIndex: 9999,
  },
  fabCompact: {
    paddingHorizontal: 0,
    paddingVertical: 0,
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    shadowOpacity: 0.12,
  },
  fabActive: {
    backgroundColor: '#fff5f0',
    borderColor: '#ff4500',
    borderWidth: 1.8,
  },
  fabTouchable: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabAvatarBg: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#fff5ee',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#ffd8be',
  },
  fabAvatarBgCompact: {
    width: 46,
    height: 46,
    borderRadius: 23,
    marginRight: 0,
  },
  fabChefMascot: {
    width: 36,
    height: 36,
  },
  fabChefMascotCompact: {
    width: 44,
    height: 44,
  },
  fabCompactLiveDot: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#0BA01E',
    borderWidth: 1.5,
    borderColor: '#ffffff',
  },
  fabTextWrapper: {
    justifyContent: 'center',
    paddingRight: 6,
  },
  fabTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  fabPillTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1c1c1e',
  },
  fabAiMiniBadge: {
    backgroundColor: '#fff3e0',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 6,
    marginLeft: 4,
  },
  fabPillSubtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  fabPillSubtitle: {
    fontSize: 11,
    color: '#666',
    marginLeft: 3,
    fontWeight: '500',
  },
  fabPillSubtitleLive: {
    color: '#0BA01E',
    fontWeight: '700',
  },
  fabLiveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#0BA01E',
    marginLeft: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fafafa',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    height: SCREEN_HEIGHT * 0.88,
    paddingTop: 18,
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  headerLeft: {
    flex: 1,
    marginRight: 10,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 3,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#1c1c1e',
  },
  contextBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff3e0',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ffe0b2',
    gap: 4,
  },
  contextBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#ff4500',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#8e8e93',
    fontWeight: '500',
  },
  headerSubtitleLive: {
    color: '#0BA01E',
    fontWeight: '600',
  },
  closeButton: {
    padding: 6,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
  },
  avatarContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
    marginBottom: 10,
    position: 'relative',
  },
  pulseRing: {
    position: 'absolute',
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: 'rgba(255, 69, 0, 0.08)',
  },
  chefAvatar: {
    width: 120,
    height: 120,
    zIndex: 2,
  },
  statusBadge: {
    backgroundColor: '#aaa',
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -12,
    zIndex: 3,
    borderWidth: 2,
    borderColor: '#fff',
  },
  statusBadgeActive: {
    backgroundColor: '#0BA01E',
  },
  chatBody: {
    flex: 1,
    paddingHorizontal: 18,
  },
  emptyState: {
    alignItems: 'center',
    marginTop: 6,
  },
  greetingTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1c1c1e',
    marginBottom: 4,
    textAlign: 'center',
  },
  greetingSubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20,
    textAlign: 'center',
  },
  suggestionsContainer: {
    width: '100%',
    alignItems: 'center',
  },
  suggestionsHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: '#8e8e93',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
    alignSelf: 'flex-start',
    marginLeft: '3%',
  },
  suggestionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 18,
    marginBottom: 10,
    width: '96%',
    borderWidth: 1,
    borderColor: '#f0e8e2',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  suggestionIconBg: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#fff3e0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  suggestionText: {
    fontSize: 13.5,
    color: '#1c1c1e',
    fontWeight: '600',
    flex: 1,
  },
  messageList: {
    paddingTop: 8,
  },
  messageWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 14,
    width: '100%',
  },
  messageWrapperUser: {
    justifyContent: 'flex-end',
  },
  messageWrapperAgent: {
    justifyContent: 'flex-start',
  },
  smallAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    overflow: 'hidden',
    elevation: 1,
  },
  tinyChef: {
    width: 26,
    height: 26,
  },
  smallAvatarUser: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#ff4500',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  messageBubble: {
    maxWidth: '76%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
  },
  messageBubbleUser: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#eee',
    borderBottomRightRadius: 4,
  },
  messageBubbleAgent: {
    backgroundColor: '#fff',
    borderBottomLeftRadius: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 22,
  },
  messageTextUser: {
    color: '#222',
  },
  messageTextAgent: {
    color: '#111',
  },
  footer: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#f8f9fa',
    borderTopWidth: 1,
    borderTopColor: '#eeeeee',
  },
  startButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ff4500',
    borderRadius: 28,
    paddingVertical: 15,
  },
  startButtonConnecting: {
    backgroundColor: '#ccc',
  },
  startButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
  },
  activeControlsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  muteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: 110,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#e8e8e8',
    gap: 6,
  },
  muteButtonActive: {
    backgroundColor: '#555',
  },
  muteLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  stopButton: {
    flex: 1,
    height: 52,
    backgroundColor: '#dc143c',
    borderRadius: 26,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
  },
});
