/**
 * useGeminiVoiceStore.ts
 *
 * Complete AI Voice Agent Store for MaitreD using Gemini API & backend TTS.
 * Completely replaces external Vapi dependency.
 *
 * Features:
 *  - Multilingual Speech-to-Text (English, Tamil, Tanglish)
 *  - Safe, universal audio playback (Web HTML5 Audio + graceful native fallbacks)
 *  - Zero crash risk even if native audio modules are not linked in the build
 *  - Real-time partial transcripts and conversation history
 *  - Clear agent states: IDLE, LISTENING, PROCESSING, SPEAKING, EXECUTING_ACTION, WAITING_FOR_CONFIRMATION, ERROR
 *  - Synchronized with active application context, cart, and router
 *  - Safe action execution through mobileAgentActionDispatcher
 */

import { create } from 'zustand';
import { Platform } from 'react-native';

import { mobileAgentApi, MobileAgentChatPayload } from '../services/mobileAgentService';
import { executeSingleAction, getActiveRouter, UIAction } from '../utils/mobileAgentActionDispatcher';
import { useCartStore } from './useCartStore';
import { useAuthStore } from './useAuthStore';
import { useRestaurantStore } from './useRestaurantStore';

export type AgentState =
  | 'IDLE'
  | 'LISTENING'
  | 'PROCESSING'
  | 'SPEAKING'
  | 'EXECUTING_ACTION'
  | 'WAITING_FOR_CONFIRMATION'
  | 'ERROR';

export interface ChatMessage {
  id: string;
  role: 'user' | 'agent';
  text: string;
  timestamp: number;
}

interface GeminiVoiceState {
  agentState: AgentState;
  isConnecting: boolean;
  isConnected: boolean;
  isMuted: boolean;
  messages: ChatMessage[];
  partialUserTranscript: string;
  partialAgentTranscript: string;
  isTamilMode: boolean;

  // Actions
  startCall: () => Promise<void>;
  stopCall: () => Promise<void>;
  toggleMute: () => void;
  toggleLanguage: () => void;
  stopSpeaking: () => Promise<void>;
  clearMessages: () => void;
  sendTextMessage: (text: string) => Promise<void>;
  sendVoiceAudio: (audioBase64: string) => Promise<void>;
  setupListeners: (routerInstance: any) => void;
  notifyRouteChanged: (route: string) => void;
  startListening: () => Promise<void>;
  stopListening: () => void;
}

// ─── Safe Universal Audio Drivers ─────────────────────────────────────────────
let webAudioInstance: any = null;
let webSpeechRecognizer: any = null;
let silenceTimer: any = null;

/**
 * Safely plays audio across Web, Android, and iOS.
 * Never throws "Cannot find native module 'ExponentAV'".
 */
async function safePlayAudio(audioBase64: string, onDone?: () => void): Promise<boolean> {
  // 1. Web browser: standard HTML5 Audio
  if (Platform.OS === 'web' && typeof window !== 'undefined' && (window as any).Audio) {
    try {
      if (webAudioInstance) {
        webAudioInstance.pause();
        webAudioInstance = null;
      }
      const audio = new (window as any).Audio(`data:audio/mp3;base64,${audioBase64}`);
      webAudioInstance = audio;
      audio.onended = () => {
        webAudioInstance = null;
        if (onDone) onDone();
      };
      audio.onerror = () => {
        webAudioInstance = null;
        if (onDone) onDone();
      };
      await audio.play();
      return true;
    } catch (e) {
      console.warn('[GeminiVoice] Web Audio error:', e);
    }
  }

  // 2. Mobile Bridge: Play audio through WebView HTML5 Audio pipeline
  if ((useGeminiVoiceStore as any).bridgePlayAudio) {
    try {
      (useGeminiVoiceStore as any).bridgePlayAudio(audioBase64);
      return true;
    } catch (e) {
      console.warn('[GeminiVoice] bridgePlayAudio failed:', e);
    }
  }

  // 3. React Native: try expo-av if linked in binary
  try {
    const ExpoAV = require('expo-av');
    if (ExpoAV && ExpoAV.Audio && ExpoAV.Audio.Sound) {
      const { sound } = await ExpoAV.Audio.Sound.createAsync(
        { uri: `data:audio/mp3;base64,${audioBase64}` },
        { shouldPlay: true }
      );
      sound.setOnPlaybackStatusUpdate((status: any) => {
        if (status.isLoaded && status.didJustFinish) {
          sound.unloadAsync();
          if (onDone) onDone();
        }
      });
      return true;
    }
  } catch {
    // expo-av native module not linked
  }

  return false;
}

/**
 * Safely speaks text via Web SpeechSynthesis or expo-speech.
 */
function safeSpeakText(text: string, isTamil: boolean, onDone?: () => void): boolean {
  // 1. Web SpeechSynthesis
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.speechSynthesis) {
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = isTamil ? 'ta-IN' : 'en-IN';
      utterance.rate = 1.0;
      utterance.onend = () => {
        if (onDone) onDone();
      };
      utterance.onerror = () => {
        if (onDone) onDone();
      };
      window.speechSynthesis.speak(utterance);
      return true;
    } catch {}
  }

  // 2. Expo Speech if linked
  if ((useGeminiVoiceStore as any).bridgeStopAudio) {
    try {
      (useGeminiVoiceStore as any).bridgeStopAudio();
    } catch {}
  }

  try {
    const ExpoSpeech = require('expo-speech');
    if (ExpoSpeech && ExpoSpeech.speak) {
      ExpoSpeech.speak(text, {
        language: isTamil ? 'ta-IN' : 'en-IN',
        rate: 0.95,
        onDone: onDone,
        onStopped: onDone,
        onError: onDone,
      });
      return true;
    }
  } catch {}

  return false;
}

/**
 * Safely halts all audio playback immediately.
 */
function safeStopAudio() {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    if (webAudioInstance) {
      try {
        webAudioInstance.pause();
        webAudioInstance = null;
      } catch {}
    }
    if (window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }
  }

  if ((useGeminiVoiceStore as any).bridgeStopAudio) {
    try {
      (useGeminiVoiceStore as any).bridgeStopAudio();
    } catch {}
  }

  try {
    const ExpoSpeech = require('expo-speech');
    if (ExpoSpeech && ExpoSpeech.stop) {
      ExpoSpeech.stop();
    }
  } catch {}
}

export const useGeminiVoiceStore = create<GeminiVoiceState>((set, get) => ({
  agentState: 'IDLE',
  isConnecting: false,
  isConnected: false,
  isMuted: false,
  messages: [],
  partialUserTranscript: '',
  partialAgentTranscript: '',
  isTamilMode: false,

  setupListeners: (routerInstance: any) => {
    // Router reference is set dynamically
  },

  notifyRouteChanged: (route: string) => {
    console.log('[GeminiVoice] Active route updated:', route);
  },

  clearMessages: () => {
    set({ messages: [], partialUserTranscript: '', partialAgentTranscript: '' });
  },

  toggleMute: () => {
    const nextMuted = !get().isMuted;
    set({ isMuted: nextMuted });
    if (nextMuted) {
      get().stopListening();
    } else if (get().isConnected) {
      get().startListening();
    }
  },

  toggleLanguage: () => {
    set((s) => ({ isTamilMode: !s.isTamilMode }));
  },

  stopSpeaking: async () => {
    safeStopAudio();
    if (get().agentState === 'SPEAKING') {
      set({ agentState: 'IDLE', partialAgentTranscript: '' });
    }
  },

  startCall: async () => {
    const { isConnected, isConnecting } = get();
    if (isConnected || isConnecting) return;

    set({ isConnecting: true, agentState: 'PROCESSING' });

    try {
      // Safe audio setup without crashing if native module is absent
      if (Platform.OS !== 'web') {
        try {
          const ExpoAV = require('expo-av');
          if (ExpoAV?.Audio?.requestPermissionsAsync) {
            await ExpoAV.Audio.requestPermissionsAsync();
            await ExpoAV.Audio.setAudioModeAsync({
              allowsRecordingIOS: true,
              playsInSilentModeIOS: true,
              staysActiveInBackground: false,
              shouldDuckAndroid: true,
            });
          }
        } catch {
          // Native audio module not linked, continue safely
        }
      }

      set({ isConnected: true, isConnecting: false, agentState: 'IDLE' });

      // Greet customer on first open
      if (get().messages.length === 0) {
        await get().sendTextMessage('Hello');
      } else {
        await get().startListening();
      }
    } catch (err) {
      console.error('[GeminiVoice] startCall failed:', err);
      set({ isConnecting: false, isConnected: false, agentState: 'ERROR' });
    }
  },

  stopCall: async () => {
    get().stopListening();
    await get().stopSpeaking();
    set({
      isConnected: false,
      isConnecting: false,
      agentState: 'IDLE',
      partialUserTranscript: '',
      partialAgentTranscript: '',
    });
  },

  startListening: async () => {
    if (get().isMuted) return;

    await get().stopSpeaking();
    set({ agentState: 'LISTENING', partialUserTranscript: '' });

    const lang = get().isTamilMode ? 'ta-IN' : 'en-IN';

    // 1. Mobile Bridge for Android and iOS
    if (Platform.OS !== 'web' && (useGeminiVoiceStore as any).bridgeStartListening) {
      try {
        (useGeminiVoiceStore as any).bridgeStartListening(lang);
      } catch (e) {
        console.warn('[GeminiVoice] bridgeStartListening warning:', e);
      }
    }

    // 2. Web Speech API for real-time speech recognition
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

      if (SpeechRecognition) {
        try {
          if (webSpeechRecognizer) {
            webSpeechRecognizer.abort();
          }

          const recognizer = new SpeechRecognition();
          webSpeechRecognizer = recognizer;
          recognizer.continuous = true;
          recognizer.interimResults = true;
          recognizer.lang = get().isTamilMode ? 'ta-IN' : 'en-IN';

          recognizer.onresult = (event: any) => {
            let interimTranscript = '';
            let finalTranscript = '';

            for (let i = event.resultIndex; i < event.results.length; ++i) {
              const transcript = event.results[i][0].transcript;
              if (event.results[i].isFinal) {
                finalTranscript += transcript;
              } else {
                interimTranscript += transcript;
              }
            }

            const currentSpoken = (finalTranscript || interimTranscript).trim();
            if (currentSpoken) {
              set({ partialUserTranscript: currentSpoken });

              // Silence debounce timer for automatic sending
              if (silenceTimer) clearTimeout(silenceTimer);
              silenceTimer = setTimeout(() => {
                if (currentSpoken && get().agentState === 'LISTENING') {
                  recognizer.stop();
                  get().sendTextMessage(currentSpoken);
                }
              }, 1800);
            }
          };

          recognizer.onerror = (event: any) => {
            if (event.error !== 'no-speech') {
              console.warn('[WebSpeechRecognizer] error:', event.error);
            }
          };

          recognizer.onend = () => {
            if (get().agentState === 'LISTENING' && get().isConnected && !get().isMuted) {
              try {
                recognizer.start();
              } catch {}
            }
          };

          recognizer.start();
        } catch (e) {
          console.warn('[GeminiVoice] Web Speech Recognition start warning:', e);
        }
      }
    }
  },

  stopListening: () => {
    if (silenceTimer) {
      clearTimeout(silenceTimer);
      silenceTimer = null;
    }
    if (Platform.OS !== 'web' && (useGeminiVoiceStore as any).bridgeStopListening) {
      try {
        (useGeminiVoiceStore as any).bridgeStopListening();
      } catch {}
    }
    if (webSpeechRecognizer) {
      try {
        webSpeechRecognizer.abort();
      } catch {}
      webSpeechRecognizer = null;
    }
    if (get().agentState === 'LISTENING') {
      set({ agentState: 'IDLE' });
    }
  },

  sendTextMessage: async (text: string) => {
    const trimmed = (text || '').trim();
    if (!trimmed) return;

    get().stopListening();
    await get().stopSpeaking();

    // Append user message
    const userMsg: ChatMessage = {
      id: Math.random().toString(36).substring(7),
      role: 'user',
      text: trimmed,
      timestamp: Date.now(),
    };

    set((state) => ({
      messages: [...state.messages, userMsg],
      partialUserTranscript: '',
      agentState: 'PROCESSING',
    }));

    try {
      // Gather live context from application stores
      const cartItems = Object.values(useCartStore.getState().items || {}).map((item) => ({
        id: item.id,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        category: item.category,
        note: item.note || '',
      }));

      const auth = useAuthStore.getState();
      const outlet = useRestaurantStore.getState().selectedOutlet;

      const chatHistory = get().messages.slice(-8).map((m) => ({
        role: m.role,
        text: m.text,
      }));

      const payload: MobileAgentChatPayload = {
        message: trimmed,
        chat_history: chatHistory,
        customer_id: auth.customerId || undefined,
        phone: auth.phone || undefined,
        restaurant_id: outlet?.restaurant_id || outlet?.id,
        cart: cartItems,
        app_context: {
          auth: {
            isAuthenticated: auth.isAuthenticated,
            customerName: auth.customerName || null,
            phone: auth.phone || null,
          },
          orderType: useCartStore.getState().orderType,
        },
      };

      const response = await mobileAgentApi.chat(payload);

      const assistantText = response.assistant_text || "I'm here to help!";
      const uiActions = response.ui_actions || [];
      const requiresConfirmation = !!response.requires_confirmation;
      const audioBase64 = response.audio_base64;

      // Add agent message
      const agentMsg: ChatMessage = {
        id: Math.random().toString(36).substring(7),
        role: 'agent',
        text: assistantText,
        timestamp: Date.now(),
      };

      set((state) => ({
        messages: [...state.messages, agentMsg],
        partialAgentTranscript: assistantText,
        agentState: requiresConfirmation ? 'WAITING_FOR_CONFIRMATION' : 'EXECUTING_ACTION',
      }));

      // Execute returned UI actions
      if (uiActions.length > 0) {
        for (const action of uiActions) {
          try {
            await executeSingleAction(action as UIAction);
          } catch (actErr) {
            console.error('[GeminiVoice] UI Action execution failed:', actErr);
          }
        }
      }

      // Audio response playback (TTS)
      set({ agentState: 'SPEAKING' });

      const onPlaybackDone = () => {
        set({ partialAgentTranscript: '', agentState: 'IDLE' });
        if (get().isConnected && !get().isMuted) {
          setTimeout(() => {
            get().startListening();
          }, 300);
        }
      };

      let played = false;

      // 1. Try playing high quality audio returned by backend (MP3 base64)
      if (audioBase64) {
        played = await safePlayAudio(audioBase64, onPlaybackDone);
      }

      // 2. Fallback to speech synthesis
      if (!played) {
        const isTamil = /[\u0B80-\u0BFF]/.test(assistantText) || get().isTamilMode;
        const spoken = safeSpeakText(assistantText, isTamil, onPlaybackDone);
        if (!spoken) {
          // If no audio player is linked, transition back to IDLE after reading duration
          const readTime = Math.min(Math.max(assistantText.length * 60, 2000), 6000);
          setTimeout(onPlaybackDone, readTime);
        }
      }
    } catch (err) {
      console.error('[GeminiVoice] sendTextMessage failed:', err);
      const errorMsg: ChatMessage = {
        id: Math.random().toString(36).substring(7),
        role: 'agent',
        text: "I'm sorry, I couldn't process that right now. Please try again.",
        timestamp: Date.now(),
      };
      set((state) => ({
        messages: [...state.messages, errorMsg],
        agentState: 'ERROR',
        partialAgentTranscript: '',
      }));
    }
  },

  sendVoiceAudio: async (audioBase64: string) => {
    if (!audioBase64) return;

    get().stopListening();
    await get().stopSpeaking();

    set({ agentState: 'PROCESSING', partialUserTranscript: 'Listening…' });

    try {
      const cartItems = Object.values(useCartStore.getState().items || {}).map((item) => ({
        id: item.id,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        category: item.category,
        note: item.note || '',
      }));

      const auth = useAuthStore.getState();
      const outlet = useRestaurantStore.getState().selectedOutlet;

      const chatHistory = get().messages.slice(-8).map((m) => ({
        role: m.role,
        text: m.text,
      }));

      const payload: MobileAgentChatPayload = {
        message: '',
        audio_base64: audioBase64,
        chat_history: chatHistory,
        customer_id: auth.customerId || undefined,
        phone: auth.phone || undefined,
        restaurant_id: outlet?.restaurant_id || outlet?.id,
        cart: cartItems,
        app_context: {
          auth: {
            isAuthenticated: auth.isAuthenticated,
            customerName: auth.customerName || null,
            phone: auth.phone || null,
          },
          orderType: useCartStore.getState().orderType,
        },
      };

      const response = await mobileAgentApi.chat(payload);

      const transcribedText = response.transcribed_user_text || '';
      const assistantText = response.assistant_text || "I'm here to help!";
      const uiActions = response.ui_actions || [];
      const requiresConfirmation = !!response.requires_confirmation;
      const audioBase64Payload = response.audio_base64;

      const newMessages = [...get().messages];
      if (transcribedText) {
        newMessages.push({
          id: Math.random().toString(36).substring(7),
          role: 'user',
          text: transcribedText,
          timestamp: Date.now(),
        });
      }

      newMessages.push({
        id: Math.random().toString(36).substring(7),
        role: 'agent',
        text: assistantText,
        timestamp: Date.now(),
      });

      set({
        messages: newMessages,
        partialUserTranscript: '',
        partialAgentTranscript: assistantText,
        agentState: requiresConfirmation ? 'WAITING_FOR_CONFIRMATION' : 'EXECUTING_ACTION',
      });

      // Execute returned UI actions
      if (uiActions.length > 0) {
        for (const action of uiActions) {
          try {
            await executeSingleAction(action as UIAction);
          } catch (actErr) {
            console.error('[GeminiVoice] UI Action execution failed:', actErr);
          }
        }
      }

      // Audio response playback (TTS)
      set({ agentState: 'SPEAKING' });

      const onPlaybackDone = () => {
        set({ partialAgentTranscript: '', agentState: 'IDLE' });
        if (get().isConnected && !get().isMuted) {
          setTimeout(() => {
            get().startListening();
          }, 300);
        }
      };

      let played = false;
      if (audioBase64Payload) {
        played = await safePlayAudio(audioBase64Payload, onPlaybackDone);
      }

      if (!played) {
        const isTamil = /[\u0B80-\u0BFF]/.test(assistantText) || get().isTamilMode;
        const spoken = safeSpeakText(assistantText, isTamil, onPlaybackDone);
        if (!spoken) {
          const readTime = Math.min(Math.max(assistantText.length * 60, 2000), 6000);
          setTimeout(onPlaybackDone, readTime);
        }
      }
    } catch (err) {
      console.error('[GeminiVoice] sendVoiceAudio failed:', err);
      const errorMsg: ChatMessage = {
        id: Math.random().toString(36).substring(7),
        role: 'agent',
        text: "I couldn't hear that clearly. Could you please repeat or type it?",
        timestamp: Date.now(),
      };
      set((state) => ({
        messages: [...state.messages, errorMsg],
        agentState: 'IDLE',
        partialUserTranscript: '',
        partialAgentTranscript: '',
      }));
      // Resume listening
      if (get().isConnected && !get().isMuted) {
        setTimeout(() => {
          get().startListening();
        }, 800);
      }
    }
  },
}));
