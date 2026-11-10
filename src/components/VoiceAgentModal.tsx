/**
 * VoiceAgentModal.tsx
 *
 * Full AI Voice Agent UI for MaitreD
 * Powered by Gemini API & Backend Conversational Engine
 *
 * Features:
 *   - Floating "Talk to Chef" pill FAB that opens the modal
 *   - Automatic greeting & start of voice conversation
 *   - Continuous voice interaction with real-time speech transcription
 *   - Live agent states: IDLE, LISTENING, PROCESSING, SPEAKING, EXECUTING_ACTION, WAITING_FOR_CONFIRMATION, ERROR
 *   - Interruption support ("Stop Speaking" button & instant speech halt)
 *   - Mute/unmute microphone toggle
 *   - Multilingual toggle: English / தமிழ் (Tamil)
 *   - Manual text input bar with Send button for typing food orders/commands
 *   - Suggested quick prompts
 */

import { FontAwesome5, Ionicons } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Image,
  Modal,
  PanResponder,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCartStore } from '../store/useCartStore';
import { useDineInSessionStore } from '../store/useDineInSessionStore';
import { useVoiceAgentStore } from '../store/useVoiceAgentStore';
import { useGeminiVoiceStore } from '../store/useGeminiVoiceStore';
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

  // Compute adaptive bottom clearance
  const baseBottom = Math.max(insets.bottom, Platform.OS === 'android' ? 24 : 16);
  let computedFabBottom = baseBottom + 20;

  if (hasViewCartBar && hasBottomNav) {
    computedFabBottom = baseBottom + 136;
  } else if (hasViewCartBar) {
    computedFabBottom = baseBottom + 84;
  } else if (hasBottomNav) {
    computedFabBottom = baseBottom + 84;
  } else if (isCheckoutScreen) {
    computedFabBottom = baseBottom + 78;
  }

  // ── Reflexive Content Mapping ──────────────────────────────────────────────
  const CHATBOT_QUICK_SUGGESTIONS = [
    'Show me the menu',
    'Add 2 idly to my cart',
    'Show vegetarian items',
    "What's my total?",
    'Proceed to checkout',
  ];

  const routeContext = React.useMemo(() => {
    if (isForYouScreen) {
      return {
        screenKey: 'for-you',
        badgeLabel: 'For You • AI Curated',
        badgeIcon: 'sparkles' as const,
        fabTitle: "Agent's Picks",
        fabSubtitle: '✨ For You',
        fabCompact: false,
        suggestions: CHATBOT_QUICK_SUGGESTIONS,
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
        suggestions: CHATBOT_QUICK_SUGGESTIONS,
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
        suggestions: CHATBOT_QUICK_SUGGESTIONS,
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
        suggestions: CHATBOT_QUICK_SUGGESTIONS,
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
        suggestions: CHATBOT_QUICK_SUGGESTIONS,
      };
    }
    return {
      screenKey: 'home',
      badgeLabel: 'MaitreD Dining Assistant',
      badgeIcon: 'restaurant' as const,
      fabTitle: 'Talk to Agent',
      fabSubtitle: 'Tap to speak',
      fabCompact: false,
      suggestions: CHATBOT_QUICK_SUGGESTIONS,
    };
  }, [pathname]);

  // Unified Gemini Voice Store
  const startCall = useGeminiVoiceStore((s) => s.startCall);
  const stopCall = useGeminiVoiceStore((s) => s.stopCall);
  const clearMessages = useGeminiVoiceStore((s) => s.clearMessages);
  const toggleMute = useGeminiVoiceStore((s) => s.toggleMute);
  const isConnected = useGeminiVoiceStore((s) => s.isConnected);
  const isConnecting = useGeminiVoiceStore((s) => s.isConnecting);
  const isMuted = useGeminiVoiceStore((s) => s.isMuted);
  const agentState = useGeminiVoiceStore((s) => s.agentState);
  const messages = useGeminiVoiceStore((s) => s.messages);
  const partialUserTranscript = useGeminiVoiceStore((s) => s.partialUserTranscript);
  const partialAgentTranscript = useGeminiVoiceStore((s) => s.partialAgentTranscript);
  const sendTextMessage = useGeminiVoiceStore((s) => s.sendTextMessage);
  const stopSpeaking = useGeminiVoiceStore((s) => s.stopSpeaking);
  const isTamilMode = useGeminiVoiceStore((s) => s.isTamilMode);
  const toggleLanguage = useGeminiVoiceStore((s) => s.toggleLanguage);
  const startListening = useGeminiVoiceStore((s) => s.startListening);
  const stopAndSendRecording = useGeminiVoiceStore((s) => s.stopAndSendRecording);

  const { isVisible, showAgent, hideAgent } = useVoiceAgentStore();
  const scrollViewRef = useRef<any>(null);
  const [inputText, setInputText] = useState('');

  // Pulse animation for speaking/listening
  const [pulseAnim] = useState(() => new Animated.Value(1));

  const isAgentSpeaking = agentState === 'SPEAKING' || (isConnected && !!partialAgentTranscript);
  const isListening = agentState === 'LISTENING';

  useEffect(() => {
    if (isAgentSpeaking || isListening) {
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
  }, [isAgentSpeaking, isListening, pulseAnim]);

  // Notify store when route changes
  useEffect(() => {
    if (isConnected && pathname) {
      useGeminiVoiceStore.getState().notifyRouteChanged(pathname);
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
      scrollViewRef.current?.scrollToEnd({ animated: true });
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
    if (!isConnected && !isConnecting) {
      startCall();
    }
    if (pathname && isConnected) {
      useGeminiVoiceStore.getState().notifyRouteChanged(pathname);
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
      useGeminiVoiceStore.setState({ isConnected: true, agentState: 'IDLE' });
    }
    sendTextMessage(sug);
  };

  const handleSendText = () => {
    if (!inputText.trim()) return;
    const txt = inputText.trim();
    setInputText('');
    setActiveRouter(router);
    if (!isConnected && !isConnecting) {
      useGeminiVoiceStore.setState({ isConnected: true, agentState: 'IDLE' });
    }
    sendTextMessage(txt);
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

  // Live status subtitle
  let statusText = 'Tap suggestion, speak, or type below';
  if (isConnecting) statusText = 'Connecting to Chef...';
  else if (agentState === 'LISTENING') statusText = '● Listening to you...';
  else if (agentState === 'PROCESSING') statusText = '● Thinking...';
  else if (agentState === 'SPEAKING') statusText = '● Speaking... (Tap Stop to interrupt)';
  else if (agentState === 'WAITING_FOR_CONFIRMATION') statusText = '● Awaiting confirmation (Say Yes/No)';
  else if (agentState === 'EXECUTING_ACTION') statusText = '● Updating order...';
  else if (isConnected) statusText = '● Live Voice Session';

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
                      <Ionicons name="sparkles" size={9} color="#DF9B34" />
                    </View>
                  )}
                </View>
                <View style={styles.fabPillSubtitleRow}>
                  <Ionicons
                    name={isConnected ? 'radio' : isForYouScreen ? 'sparkles-outline' : 'mic'}
                    size={11}
                    color={isConnected ? '#DF9B34' : '#888'}
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
                  <Text style={styles.headerTitle}>MaitreD Assistant</Text>
                  <View style={styles.contextBadge}>
                    <Ionicons name={routeContext.badgeIcon} size={11} color="#DF9B34" />
                    <Text style={styles.contextBadgeText}>{routeContext.badgeLabel}</Text>
                  </View>
                </View>
                <Text style={[styles.headerSubtitle, (isConnected || agentState !== 'IDLE') && styles.headerSubtitleLive]}>
                  {statusText}
                </Text>
              </View>

              {/* Language toggle pill */}
              <TouchableOpacity onPress={toggleLanguage} style={styles.langPill} activeOpacity={0.75}>
                <Ionicons name="globe-outline" size={13} color="#DF9B34" />
                <Text style={styles.langPillText}>{isTamilMode ? 'தமிழ்' : 'EN'}</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={closeModal} style={styles.closeButton}>
                <Ionicons name="close" size={22} color="#333" />
              </TouchableOpacity>
            </View>

            {/* Avatar Section */}
            <View style={styles.avatarContainer}>
              <Animated.View style={[styles.pulseRing, { transform: [{ scale: pulseAnim }] }]} />
              <Image
                source={require('../../assets/images/chatbot_chef_full.png')}
                style={styles.chefAvatar}
                resizeMode="contain"
              />
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
                    {isConnecting ? 'Connecting…' : isConnected ? 'Listening to you…' : "Hi! I'm your MaitreD Chef."}
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
                          <FontAwesome5 name="lightbulb" size={11} color="#DF9B34" />
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

                  {/* Partial Agent Bubble — shown in real-time, zero lag */}
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

            {/* Manual Text Input Bar */}
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.textInput}
                placeholder={isTamilMode ? "உணவு அல்லது கட்டளையை தட்டச்சு செய்க..." : "Type dish name or voice command..."}
                placeholderTextColor="#999"
                value={inputText}
                onChangeText={setInputText}
                onSubmitEditing={handleSendText}
                returnKeyType="send"
              />
              <TouchableOpacity
                style={[styles.sendButton, !inputText.trim() && styles.sendButtonDisabled]}
                onPress={handleSendText}
                disabled={!inputText.trim()}
              >
                <Ionicons name="send" size={16} color={inputText.trim() ? '#ffffff' : '#bbb'} />
              </TouchableOpacity>
            </View>

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
                      size={20}
                      color={isMuted ? 'white' : '#333'}
                    />
                    <Text style={[styles.muteLabel, isMuted && { color: 'white' }]}>
                      {isMuted ? 'Unmute' : 'Mute'}
                    </Text>
                  </TouchableOpacity>

                  {/* Stop Speaking / Interruption button */}
                  {agentState === 'SPEAKING' ? (
                    <TouchableOpacity
                      style={styles.stopSpeakingButton}
                      onPress={stopSpeaking}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="hand-right" size={18} color="white" style={{ marginRight: 6 }} />
                      <Text style={styles.stopSpeakingText}>Stop</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={[styles.micListenButton, agentState === 'LISTENING' && styles.micListenButtonActive]}
                      onPress={() => {
                        if (agentState === 'LISTENING') {
                          stopAndSendRecording();
                        } else {
                          startListening();
                        }
                      }}
                      activeOpacity={0.85}
                    >
                      <Ionicons
                        name={agentState === 'LISTENING' ? 'radio' : 'mic'}
                        size={18}
                        color="white"
                        style={{ marginRight: 6 }}
                      />
                      <Text style={styles.micListenText}>
                        {agentState === 'LISTENING' ? 'Tap when done' : 'Speak'}
                      </Text>
                    </TouchableOpacity>
                  )}

                  {/* End Session */}
                  <TouchableOpacity style={styles.stopButton} onPress={endCall} activeOpacity={0.85}>
                    <Ionicons name="close-circle" size={20} color="white" style={{ marginRight: 6 }} />
                    <Text style={styles.stopButtonText}>Close</Text>
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
    shadowColor: '#DF9B34',
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
    backgroundColor: '#FFF5E5',
    borderColor: '#DF9B34',
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
    backgroundColor: '#FFF5E5',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  fabAvatarBgCompact: {
    marginRight: 0,
  },
  fabChefMascot: {
    width: 36,
    height: 36,
  },
  fabChefMascotCompact: {
    width: 44,
    height: 44,
    transform: [{ scale: 1.15 }],
  },
  fabTextWrapper: {
    marginRight: 6,
    justifyContent: 'center',
  },
  fabTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  fabPillTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  fabAiMiniBadge: {
    marginLeft: 3,
  },
  fabPillSubtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  fabPillSubtitle: {
    fontSize: 10,
    color: '#666',
    fontWeight: '500',
  },
  fabPillSubtitleLive: {
    color: '#DF9B34',
    fontWeight: '700',
  },
  fabLiveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#DF9B34',
  },
  fabCompactLiveDot: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#22c55e',
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    height: SCREEN_HEIGHT * 0.88,
    backgroundColor: '#f8f9fa',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 14,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#eeeeee',
  },
  headerLeft: {
    flex: 1,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111111',
  },
  contextBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFF5E5',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ffeedd',
  },
  contextBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#DF9B34',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#888888',
    marginTop: 2,
    fontWeight: '500',
  },
  headerSubtitleLive: {
    color: '#DF9B34',
    fontWeight: '700',
  },
  langPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFF5E5',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#DF9B34',
    marginRight: 10,
  },
  langPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#DF9B34',
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 16,
    paddingBottom: 10,
    backgroundColor: '#ffffff',
  },
  pulseRing: {
    position: 'absolute',
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#FFF0D4',
  },
  chefAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  chatBody: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: 10,
  },
  greetingTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#222',
    textAlign: 'center',
  },
  greetingSubtitle: {
    fontSize: 13,
    color: '#777',
    marginTop: 4,
    marginBottom: 16,
    textAlign: 'center',
  },
  suggestionsContainer: {
    width: '100%',
    gap: 8,
  },
  suggestionsHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: '#999',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  suggestionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#eee',
    elevation: 1,
  },
  suggestionIconBg: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FFF5E5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  suggestionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
  },
  messageList: {
    gap: 12,
  },
  messageWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
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
    width: '100%',
    height: '100%',
    transform: [{ scale: 1.1 }],
  },
  smallAvatarUser: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#DF9B34',
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
    backgroundColor: '#FFF5E5',
    borderWidth: 1,
    borderColor: '#ffeedd',
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
    fontSize: 14,
    lineHeight: 21,
  },
  messageTextUser: {
    color: '#1a1a1a',
    fontWeight: '500',
  },
  messageTextAgent: {
    color: '#111',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    gap: 8,
  },
  textInput: {
    flex: 1,
    height: 42,
    backgroundColor: '#f5f5f5',
    borderRadius: 21,
    paddingHorizontal: 16,
    fontSize: 14,
    color: '#222',
  },
  sendButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#DF9B34',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#e0e0e0',
  },
  footer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#f8f9fa',
    borderTopWidth: 1,
    borderTopColor: '#eeeeee',
  },
  startButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#DF9B34',
    borderRadius: 28,
    paddingVertical: 14,
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
    gap: 8,
  },
  muteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#e8e8e8',
    gap: 6,
  },
  muteButtonActive: {
    backgroundColor: '#555',
  },
  muteLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
  },
  micListenButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1.2,
    height: 46,
    backgroundColor: '#DF9B34',
    borderRadius: 23,
  },
  micListenButtonActive: {
    backgroundColor: '#e67e22',
  },
  micListenText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '700',
  },
  stopSpeakingButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1.2,
    height: 46,
    backgroundColor: '#f59e0b',
    borderRadius: 23,
  },
  stopSpeakingText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '700',
  },
  stopButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    height: 46,
    backgroundColor: '#dc2626',
    borderRadius: 23,
  },
  stopButtonText: {
    color: 'white',
    fontSize: 13,
    fontWeight: '700',
  },
});
