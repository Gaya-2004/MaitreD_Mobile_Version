/**
 * useGeminiVoiceStore.ts
 *
 * Complete AI Voice Agent Store for MaitreD using Gemini API & backend TTS.
 * Completely replaces external Vapi dependency.
 *
 * Voice recording is done via expo-av Audio.Recording (native, reliable on Android).
 * Push-to-talk pattern: tap to start → tap again to stop & send.
 *
 * Features:
 *  - Native expo-av microphone recording (not WebView)
 *  - Backend Whisper STT for transcription
 *  - Backend Gemini NLU for intent extraction
 *  - Backend gTTS for audio response
 *  - expo-av / expo-speech for audio playback
 *  - Multilingual: English, Tamil, Tanglish
 *  - Push-to-talk and auto-silence-detect modes
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
  stopAndSendRecording: () => Promise<void>;
}

// ─── Audio State ───────────────────────────────────────────────────────────────
let webAudioInstance: any = null;
let webSpeechRecognizer: any = null;
let silenceTimer: any = null;

// ─── Stop all audio helpers ────────────────────────────────────────────────────
function stopWebAudio() {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    if (webAudioInstance) {
      try { webAudioInstance.pause(); } catch {}
      webAudioInstance = null;
    }
    if (window.speechSynthesis) {
      try { window.speechSynthesis.cancel(); } catch {}
    }
  }
}

function stopExpoSpeech() {
  try {
    const ExpoSpeech = require('expo-speech');
    if (ExpoSpeech?.stop) ExpoSpeech.stop();
  } catch {}
}

async function safeStopAllAudio() {
  stopWebAudio();
  stopExpoSpeech();
  const bridge = useGeminiVoiceStore as any;
  if (bridge?.bridgeStopAudio) {
    try { bridge.bridgeStopAudio(); } catch {}
  }
}

// ─── Play audio (backend MP3 base64) ──────────────────────────────────────────
async function safePlayAudio(audioBase64: string, onDone?: () => void): Promise<boolean> {
  // 1. Web
  if (Platform.OS === 'web' && typeof window !== 'undefined' && (window as any).Audio) {
    try {
      if (webAudioInstance) {
        try { webAudioInstance.pause(); } catch {}
        webAudioInstance = null;
      }
      const audio = new (window as any).Audio(`data:audio/mp3;base64,${audioBase64}`);
      webAudioInstance = audio;
      audio.onended = () => { webAudioInstance = null; onDone?.(); };
      audio.onerror = () => { webAudioInstance = null; onDone?.(); };
      await audio.play();
      return true;
    } catch (e) {
      console.warn('[GeminiVoice] Web Audio error:', e);
    }
  }

  // 2. Mobile WebView Bridge HTML5 Audio pipeline (zero native module dependency)
  const bridge = useGeminiVoiceStore as any;
  if (bridge?.bridgePlayAudio) {
    try {
      bridge.bridgePlayAudio(audioBase64);
      if (onDone) {
        const estDurationMs = Math.min(Math.max((audioBase64.length * 0.75 / 6000) * 1000, 1800), 10000);
        setTimeout(onDone, estDurationMs);
      }
      return true;
    } catch (e) {
      console.warn('[GeminiVoice] bridgePlayAudio error:', e);
    }
  }

  return false;
}

// ─── Speak text (TTS fallback when no audio) ──────────────────────────────────
function safeSpeakText(text: string, isTamil: boolean, onDone?: () => void): boolean {
  // 1. Web
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.speechSynthesis) {
    try {
      window.speechSynthesis.cancel();
      const utt = new SpeechSynthesisUtterance(text);
      utt.lang = isTamil ? 'ta-IN' : 'en-IN';
      utt.rate = 1.0;
      utt.onend = () => onDone?.();
      utt.onerror = () => onDone?.();
      window.speechSynthesis.speak(utt);
      return true;
    } catch {}
  }

  // 2. expo-speech
  try {
    const ExpoSpeech = require('expo-speech');
    if (ExpoSpeech?.speak) {
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

// ─── Microphone Permission Helper ──────────────────────────────────────────────
export async function ensureMicrophonePermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;

  try {
    // 1. Direct Android OS check
    const { PermissionsAndroid } = require('react-native');
    const isGranted = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
    if (isGranted) {
      console.log('[Permission] Android RECORD_AUDIO already granted.');
      return true;
    }

    // 2. Request via expo-camera (Expo Go native delegate)
    try {
      const { getMicrophonePermissionsAsync, requestMicrophonePermissionsAsync } = require('expo-camera');
      if (typeof getMicrophonePermissionsAsync === 'function') {
        const cur = await getMicrophonePermissionsAsync();
        if (cur?.granted) {
          console.log('[Permission] expo-camera reports granted.');
          return true;
        }
        if (typeof requestMicrophonePermissionsAsync === 'function') {
          const req = await requestMicrophonePermissionsAsync();
          if (req?.granted) {
            console.log('[Permission] expo-camera request granted!');
            return true;
          }
        }
      }
    } catch (e) {
      console.log('[Permission] expo-camera request skipped:', e);
    }

    // 3. Request via PermissionsAndroid
    const res = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, {
      title: 'Microphone Permission',
      message: 'MaitreD needs your microphone to hear your food orders.',
      buttonPositive: 'Allow',
      buttonNegative: 'Deny',
    });
    console.log('[Permission] PermissionsAndroid request result:', res);
    return res === PermissionsAndroid.RESULTS.GRANTED;
  } catch (err) {
    console.warn('[Permission] Failed to check/request microphone:', err);
    return false;
  }
}

// ─── Store ─────────────────────────────────────────────────────────────────────
export const useGeminiVoiceStore = create<GeminiVoiceState>((set, get) => ({
  agentState: 'IDLE',
  isConnecting: false,
  isConnected: false,
  isMuted: false,
  messages: [],
  partialUserTranscript: '',
  partialAgentTranscript: '',
  isTamilMode: false,

  setupListeners: (_routerInstance: any) => {},

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
    }
  },

  toggleLanguage: () => {
    set((s) => ({ isTamilMode: !s.isTamilMode }));
  },

  stopSpeaking: async () => {
    await safeStopAllAudio();
    if (get().agentState === 'SPEAKING') {
      set({ agentState: 'IDLE', partialAgentTranscript: '' });
    }
  },

  startCall: async () => {
    const { isConnected, isConnecting } = get();
    if (isConnected || isConnecting) return;

    set({ isConnecting: true, agentState: 'PROCESSING' });

    try {
      // Pre-flight microphone permission check
      if (Platform.OS === 'android') {
        await ensureMicrophonePermission();
      }

      set({ isConnected: true, isConnecting: false, agentState: 'IDLE' });

      // Send greeting on first open
      if (get().messages.length === 0) {
        await get().sendTextMessage('Hello');
      }
    } catch (err) {
      console.error('[GeminiVoice] startCall failed:', err);
      set({ isConnecting: false, isConnected: false, agentState: 'ERROR' });
    }
  },

  stopCall: async () => {
    get().stopListening();
    await get().stopSpeaking();
    if (Platform.OS !== 'web') {
      const bridge = useGeminiVoiceStore as any;
      if (bridge.bridgeReleaseMicrophone) {
        try { bridge.bridgeReleaseMicrophone(); } catch {}
      }
    }
    set({
      isConnected: false,
      isConnecting: false,
      agentState: 'IDLE',
      partialUserTranscript: '',
      partialAgentTranscript: '',
    });
  },

  /**
   * startListening: Begin recording via VoiceBridge WebView (Android/iOS)
   * or Web SpeechRecognition (browser).
   * Uses push-to-talk pattern — user taps "Done" to send.
   */
  startListening: async () => {
    if (get().isMuted || get().agentState === 'LISTENING') return;

    await get().stopSpeaking();
    set({ agentState: 'LISTENING', partialUserTranscript: '🎤 Listening to you... speak your order!' });

    // ── Android/iOS: VoiceBridge WebView recording ──────────────────────────
    if (Platform.OS !== 'web') {
      if (Platform.OS === 'android') {
        const granted = await ensureMicrophonePermission();
        if (!granted) {
          set({
            agentState: 'IDLE',
            partialUserTranscript: '⚠️ Microphone permission is required. Please grant access in phone Settings > Apps > Expo Go > Permissions.',
          });
          return;
        }
      }
      const bridge = useGeminiVoiceStore as any;
      if (bridge.bridgeStartListening) {
        const lang = get().isTamilMode ? 'ta-IN' : 'en-IN';
        bridge.bridgeStartListening(lang);
      }
      return;
    }

    // ── Web: SpeechRecognition ───────────────────────────────────────────────
    if (typeof window !== 'undefined') {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

      if (SpeechRecognition) {
        try {
          if (webSpeechRecognizer) webSpeechRecognizer.abort();

          const recognizer = new SpeechRecognition();
          webSpeechRecognizer = recognizer;
          recognizer.continuous = true;
          recognizer.interimResults = true;
          recognizer.lang = get().isTamilMode ? 'ta-IN' : 'en-IN';

          recognizer.onresult = (event: any) => {
            let interim = '';
            let final = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
              const t = event.results[i][0].transcript;
              if (event.results[i].isFinal) final += t;
              else interim += t;
            }
            const spoken = (final || interim).trim();
            if (spoken) {
              set({ partialUserTranscript: spoken });
              if (silenceTimer) clearTimeout(silenceTimer);
              silenceTimer = setTimeout(() => {
                if (spoken && get().agentState === 'LISTENING') {
                  recognizer.stop();
                  get().sendTextMessage(spoken);
                }
              }, 2000);
            }
          };

          recognizer.onerror = (e: any) => {
            if (e.error !== 'no-speech') {
              console.warn('[WebSpeech] error:', e.error);
            }
          };

          recognizer.onend = () => {
            if (get().agentState === 'LISTENING' && get().isConnected && !get().isMuted) {
              try { recognizer.start(); } catch {}
            }
          };

          recognizer.start();
        } catch (e) {
          console.warn('[GeminiVoice] Web SpeechRecognition start failed:', e);
        }
      }
    }
  },

  /**
   * stopListening: Stop recording without sending.
   */
  stopListening: () => {
    if (silenceTimer) {
      clearTimeout(silenceTimer);
      silenceTimer = null;
    }

    // Stop web recognizer
    if (webSpeechRecognizer) {
      try { webSpeechRecognizer.abort(); } catch {}
      webSpeechRecognizer = null;
    }

    // Stop bridge recording (Android/iOS)
    if (Platform.OS !== 'web') {
      const bridge = useGeminiVoiceStore as any;
      if (bridge.bridgeStopListening) {
        try { bridge.bridgeStopListening(); } catch {}
      }
    }

    if (get().agentState === 'LISTENING') {
      set({ agentState: 'IDLE', partialUserTranscript: '' });
    }
  },

  /**
   * stopAndSendRecording: Stop recording and send audio to backend for STT + NLU.
   * This is called when user taps "Done" while recording.
   * On Android: triggers VoiceBridge to finalize and dispatch audio.
   * On Web: sends buffered SpeechRecognition text.
   */
  stopAndSendRecording: async () => {
    if (get().agentState !== 'LISTENING') return;

    if (Platform.OS !== 'web') {
      // Trigger VoiceBridge to stop MediaRecorder and send audio
      const bridge = useGeminiVoiceStore as any;
      if (bridge.bridgeForceFinalize) {
        set({ agentState: 'PROCESSING', partialUserTranscript: '⏳ Processing your voice...' });
        try { bridge.bridgeForceFinalize(); } catch {}
      } else {
        set({ agentState: 'IDLE', partialUserTranscript: '' });
      }
      return;
    }

    // Web: use partial transcript text
    const partial = get().partialUserTranscript.trim();
    const cleanPartial = partial.replace(/^🎤.*$/gm, '').trim();
    if (cleanPartial) {
      get().sendTextMessage(cleanPartial);
    } else {
      set({ agentState: 'IDLE', partialUserTranscript: '' });
    }
  },

  // ─── Send text message to backend ─────────────────────────────────────────
  sendTextMessage: async (text: string) => {
    const trimmed = (text || '').trim();
    if (!trimmed) return;

    get().stopListening();
    await get().stopSpeaking();

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

      // Execute UI actions
      for (const action of uiActions) {
        try {
          await executeSingleAction(action as UIAction);
        } catch (actErr) {
          console.error('[GeminiVoice] UI Action failed:', actErr);
        }
      }

      // Play response audio
      set({ agentState: 'SPEAKING' });

      const onPlaybackDone = () => {
        set({ partialAgentTranscript: '', agentState: 'IDLE' });
        // Don't auto-restart listening — push-to-talk pattern is more reliable
      };

      let played = false;

      if (audioBase64) {
        played = await safePlayAudio(audioBase64, onPlaybackDone);
      }

      if (!played) {
        const isTamil = /[\u0B80-\u0BFF]/.test(assistantText) || get().isTamilMode;
        const spoken = safeSpeakText(assistantText, isTamil, onPlaybackDone);
        if (!spoken) {
          const readTime = Math.min(Math.max(assistantText.length * 55, 2000), 7000);
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
        agentState: 'IDLE',
        partialAgentTranscript: '',
      }));
    }
  },

  // ─── Send voice audio (base64) to backend for STT + NLU ───────────────────
  sendVoiceAudio: async (audioBase64: string) => {
    if (!audioBase64) return;

    get().stopListening();
    await get().stopSpeaking();

    set({ agentState: 'PROCESSING', partialUserTranscript: '⏳ Understanding your speech...' });

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

      // Execute UI actions
      for (const action of uiActions) {
        try {
          await executeSingleAction(action as UIAction);
        } catch (actErr) {
          console.error('[GeminiVoice] UI Action failed:', actErr);
        }
      }

      // Play response audio
      set({ agentState: 'SPEAKING' });

      const onPlaybackDone = () => {
        set({ partialAgentTranscript: '', agentState: 'IDLE' });
      };

      let played = false;
      if (audioBase64Payload) {
        played = await safePlayAudio(audioBase64Payload, onPlaybackDone);
      }

      if (!played) {
        const isTamil = /[\u0B80-\u0BFF]/.test(assistantText) || get().isTamilMode;
        const spoken = safeSpeakText(assistantText, isTamil, onPlaybackDone);
        if (!spoken) {
          const readTime = Math.min(Math.max(assistantText.length * 55, 2000), 7000);
          setTimeout(onPlaybackDone, readTime);
        }
      }
    } catch (err) {
      console.error('[GeminiVoice] sendVoiceAudio failed:', err);
      const errorMsg: ChatMessage = {
        id: Math.random().toString(36).substring(7),
        role: 'agent',
        text: "I couldn't hear that clearly. Please try again or type your order.",
        timestamp: Date.now(),
      };
      set((state) => ({
        messages: [...state.messages, errorMsg],
        agentState: 'IDLE',
        partialUserTranscript: '',
        partialAgentTranscript: '',
      }));
    }
  },
}));
