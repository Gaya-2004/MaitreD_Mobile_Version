/**
 * VoiceBridge.tsx
 *
 * Universal Speech-to-Text & Audio Bridge for MaitreD AI Voice Agent.
 * Compatible with Android, iOS, and Web.
 *
 * Capabilities:
 *   1. Dual-Engine Speech Recognition:
 *      - Engine A: Chromium Web Speech Recognition (for instant partial/final transcripts).
 *      - Engine B: HTML5 AudioContext recording (16kHz WAV) with live Voice Activity Detection (VAD).
 *   2. Base64 Audio Playback via HTML5 Audio pipeline (plays backend gTTS MP3).
 *   3. Auto-granted microphone permissions for Android WebView.
 */

import React, { useEffect, useRef } from 'react';
import { Platform, PermissionsAndroid, View, StyleSheet } from 'react-native';
import { useGeminiVoiceStore } from '../store/useGeminiVoiceStore';

let WebView: any = null;
if (Platform.OS !== 'web') {
  try {
    WebView = require('react-native-webview').WebView;
  } catch (e) {
    console.warn('[VoiceBridge] react-native-webview not loaded:', e);
  }
}

const BRIDGE_HTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MaitreD Audio Bridge</title>
</head>
<body style="background:transparent;margin:0;padding:0;overflow:hidden;">
<script>
  var recognition = null;
  var currentLang = 'en-IN';
  var isListening = false;
  var currentAudio = null;
  var audioContext = null;
  var mediaStream = null;
  var scriptProcessor = null;
  var pcmChunks = [];
  var isSpeaking = false;
  var silenceFrames = 0;
  var speechRecognizedText = '';
  var speechDispatched = false;

  function sendToRN(type, payload) {
    if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
      window.ReactNativeWebView.postMessage(JSON.stringify(Object.assign({ type: type }, payload || {})));
    }
  }

  // ── 1. Speech Recognition (Web Speech API) ──────────────────────────────────
  function getSpeechRecognition() {
    return window.SpeechRecognition || window.webkitSpeechRecognition;
  }

  function setupSpeechRecognition() {
    var SR = getSpeechRecognition();
    if (!SR) return null;

    try {
      var r = new SR();
      r.continuous = true;
      r.interimResults = true;
      r.lang = currentLang;

      r.onresult = function(event) {
        var interim = '';
        var final = '';
        for (var i = event.resultIndex; i < event.results.length; ++i) {
          var t = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            final += t;
          } else {
            interim += t;
          }
        }
        var spoken = (final || interim || '').trim();
        if (spoken) {
          speechRecognizedText = spoken;
          sendToRN('TRANSCRIPT', { text: spoken, isFinal: !!final });
        }
      };

      r.onerror = function(e) {
        // Soft error, audio recording engine continues as primary fallback
      };

      r.onend = function() {
        if (isListening) {
          try { r.start(); } catch(err) {}
        }
      };

      return r;
    } catch(e) {
      return null;
    }
  }

  // ── 2. 16-bit PCM WAV Encoder ───────────────────────────────────────────────
  function encodeWAV(samples, sampleRate) {
    var buffer = new ArrayBuffer(44 + samples.length * 2);
    var view = new DataView(buffer);
    function writeString(v, offset, str) {
      for (var i = 0; i < str.length; i++) {
        v.setUint8(offset + i, str.charCodeAt(i));
      }
    }
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + samples.length * 2, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM format
    view.setUint16(22, 1, true); // Mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(view, 36, 'data');
    view.setUint32(40, samples.length * 2, true);

    var offset = 44;
    for (var i = 0; i < samples.length; i++, offset += 2) {
      var s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
    return new Uint8Array(buffer);
  }

  function uint8ToBase64(uint8) {
    var binary = '';
    var len = uint8.byteLength;
    var chunkSize = 8192;
    for (var i = 0; i < len; i += chunkSize) {
      var end = Math.min(i + chunkSize, len);
      binary += String.fromCharCode.apply(null, uint8.subarray(i, end));
    }
    return btoa(binary);
  }

  // ── 3. Audio Recording & VAD (Microphone) ────────────────────────────────────
  function startMicrophoneCapture() {
    pcmChunks = [];
    isSpeaking = false;
    silenceFrames = 0;
    speechRecognizedText = '';
    speechDispatched = false;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      sendToRN('DEBUG', { message: 'navigator.mediaDevices.getUserMedia is NOT available' });
      return;
    }
    sendToRN('DEBUG', { message: 'Calling getUserMedia...' });

    navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: 16000,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    }).then(function(stream) {
      sendToRN('DEBUG', { message: 'getUserMedia stream acquired successfully!' });
      mediaStream = stream;
      var AudioCtx = window.AudioContext || window.webkitAudioContext;
      audioContext = new AudioCtx({ sampleRate: 16000 });
      var source = audioContext.createMediaStreamSource(stream);
      scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1);

      scriptProcessor.onaudioprocess = function(e) {
        if (!isListening) return;
        var input = e.inputBuffer.getChannelData(0);
        var chunk = new Float32Array(input.length);
        chunk.set(input);
        pcmChunks.push(chunk);

        // Calculate Volume (RMS)
        var sum = 0;
        for (var i = 0; i < chunk.length; i++) sum += chunk[i] * chunk[i];
        var rms = Math.sqrt(sum / chunk.length);

        if (pcmChunks.length % 15 === 0) {
          sendToRN('AUDIO_LEVEL', { rms: rms, chunks: pcmChunks.length });
        }

        // Voice Activity Detection (threshold lowered to 0.015 for mobile mic sensitivity)
        if (rms > 0.015) {
          isSpeaking = true;
          silenceFrames = 0;
        } else if (isSpeaking) {
          silenceFrames++;
          // ~1.2 seconds of silence after user spoke
          if (silenceFrames > 10) {
            sendToRN('DEBUG', { message: 'VAD silence detected, finalizing turn...' });
            finalizeSpokenTurn();
          }
        }
      };

      source.connect(scriptProcessor);
      scriptProcessor.connect(audioContext.destination);
    }).catch(function(err) {
      sendToRN('ERROR', { error: 'Microphone access: ' + err.name + ' - ' + err.message });
    });
  }

  function stopMicrophoneCapture() {
    if (scriptProcessor) {
      try { scriptProcessor.disconnect(); } catch(e) {}
      scriptProcessor = null;
    }
    if (audioContext) {
      try { audioContext.close(); } catch(e) {}
      audioContext = null;
    }
    if (mediaStream) {
      try {
        var tracks = mediaStream.getTracks();
        for (var i = 0; i < tracks.length; i++) tracks[i].stop();
      } catch(e) {}
      mediaStream = null;
    }
  }

  function finalizeSpokenTurn() {
    if (speechDispatched) return;
    speechDispatched = true;

    // 1. If Web Speech API already parsed clear text, dispatch text immediately
    if (speechRecognizedText && speechRecognizedText.trim().length > 1) {
      sendToRN('FINALIZE_TEXT', { text: speechRecognizedText.trim() });
      isListening = false;
      stopMicrophoneCapture();
      return;
    }

    // 2. Otherwise compile recorded PCM chunks into 16kHz WAV and send for backend STT
    if (pcmChunks.length > 0) {
      var totalLen = 0;
      for (var i = 0; i < pcmChunks.length; i++) totalLen += pcmChunks[i].length;
      var merged = new Float32Array(totalLen);
      var offset = 0;
      for (var j = 0; j < pcmChunks.length; j++) {
        merged.set(pcmChunks[j], offset);
        offset += pcmChunks[j].length;
      }
      var wavBytes = encodeWAV(merged, 16000);
      var b64Wav = uint8ToBase64(wavBytes);
      sendToRN('FINALIZE_AUDIO', { audioBase64: b64Wav, sampleRate: 16000 });
    }

    isListening = false;
    stopMicrophoneCapture();
  }

  // ── 4. Public API for React Native ──────────────────────────────────────────
  window.startListening = function(lang) {
    if (lang) currentLang = lang;
    isListening = true;
    speechDispatched = false;
    sendToRN('STARTED', {});

    // Start Web Speech API recognizer if available
    if (!recognition) {
      recognition = setupSpeechRecognition();
    }
    if (recognition) {
      recognition.lang = currentLang;
      try { recognition.start(); } catch(e) {}
    }

    // Start Audio recording with VAD
    startMicrophoneCapture();
  };

  window.stopListening = function(finalize) {
    if (finalize !== false && (pcmChunks.length > 0 || speechRecognizedText)) {
      finalizeSpokenTurn();
    } else {
      isListening = false;
      speechDispatched = true;
      if (recognition) {
        try { recognition.stop(); } catch(e) {}
      }
      stopMicrophoneCapture();
      sendToRN('STOPPED', {});
    }
  };

  window.forceFinalize = function() {
    finalizeSpokenTurn();
  };

  window.playAudioBase64 = function(b64) {
    if (currentAudio) {
      try { currentAudio.pause(); currentAudio = null; } catch(e) {}
    }
    currentAudio = new Audio('data:audio/mp3;base64,' + b64);
    currentAudio.onended = function() {
      currentAudio = null;
      sendToRN('AUDIO_ENDED', {});
    };
    currentAudio.onerror = function() {
      currentAudio = null;
      sendToRN('AUDIO_ENDED', { error: true });
    };
    currentAudio.play().catch(function(e) {
      sendToRN('AUDIO_ENDED', { error: true });
    });
  };

  window.stopAudio = function() {
    if (currentAudio) {
      try { currentAudio.pause(); currentAudio = null; } catch(e) {}
    }
  };

  sendToRN('READY', {});
</script>
</body>
</html>
`;

export default function VoiceBridge() {
  const webviewRef = useRef<any>(null);
  const isBridgeReady = useRef(false);

  const isConnected = useGeminiVoiceStore((s) => s.isConnected);
  const agentState = useGeminiVoiceStore((s) => s.agentState);
  const isTamilMode = useGeminiVoiceStore((s) => s.isTamilMode);
  const isMuted = useGeminiVoiceStore((s) => s.isMuted);

  // Auto request Android audio permission
  useEffect(() => {
    if (Platform.OS === 'android') {
      PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, {
        title: 'Microphone Permission',
        message: 'MaitreD needs microphone access to understand your voice commands.',
        buttonPositive: 'Allow',
        buttonNegative: 'Deny',
      }).catch((e) => {
        console.warn('[VoiceBridge] Android mic request error:', e);
      });
    }
  }, []);

  const sendCommandToBridge = (cmd: string) => {
    if (webviewRef.current) {
      try {
        webviewRef.current.injectJavaScript(cmd);
      } catch (e) {
        console.warn('[VoiceBridge] injectJavaScript error:', e);
      }
    }
  };

  // Sync state machine with WebView bridge
  useEffect(() => {
    if (!isConnected || isMuted) {
      sendCommandToBridge('window.stopListening && window.stopListening(); true;');
      return;
    }

    const lang = isTamilMode ? 'ta-IN' : 'en-IN';

    if (agentState === 'LISTENING') {
      sendCommandToBridge(`window.startListening && window.startListening("${lang}"); true;`);
    } else if (agentState !== 'PROCESSING' && agentState !== 'SPEAKING') {
      sendCommandToBridge('window.stopListening && window.stopListening(); true;');
    }
  }, [agentState, isConnected, isMuted, isTamilMode]);

  // Handle incoming bridge events
  const handleMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      const store = useGeminiVoiceStore.getState();

      switch (data.type) {
        case 'READY':
          isBridgeReady.current = true;
          console.log('[VoiceBridge] WebView audio bridge initialized successfully.');
          if (store.isConnected && store.agentState === 'LISTENING' && !store.isMuted) {
            const lang = store.isTamilMode ? 'ta-IN' : 'en-IN';
            sendCommandToBridge(`window.startListening && window.startListening("${lang}"); true;`);
          }
          break;

        case 'TRANSCRIPT':
          if (data.text) {
            useGeminiVoiceStore.setState({ partialUserTranscript: data.text });
          }
          break;

        case 'FINALIZE_TEXT':
          if (data.text) {
            console.log('[VoiceBridge] Customer speech recognized (local text):', data.text);
            store.sendTextMessage(data.text);
          }
          break;

        case 'FINALIZE_AUDIO':
          if (data.audioBase64) {
            console.log('[VoiceBridge] Customer speech captured (WAV audio chunk), sending to backend STT...');
            store.sendVoiceAudio(data.audioBase64);
          }
          break;

        case 'AUDIO_ENDED':
          useGeminiVoiceStore.setState({
            agentState: 'IDLE',
            partialAgentTranscript: '',
          });
          if (store.isConnected && !store.isMuted) {
            setTimeout(() => {
              store.startListening();
            }, 300);
          }
          break;

        case 'STARTED':
          console.log('[VoiceBridge] Audio recording started in WebView.');
          break;

        case 'DEBUG':
          console.log('[VoiceBridge Debug]', data.message);
          break;

        case 'AUDIO_LEVEL':
          // Update visual feedback or log
          break;

        case 'ERROR':
          console.warn('[VoiceBridge] Engine notice:', data.error);
          break;
      }
    } catch (e) {
      console.warn('[VoiceBridge] onMessage error:', e);
    }
  };

  // Expose global bridge controller hooks to store
  useEffect(() => {
    (useGeminiVoiceStore as any).bridgePlayAudio = (base64: string) => {
      sendCommandToBridge(`window.playAudioBase64 && window.playAudioBase64("${base64}"); true;`);
    };
    (useGeminiVoiceStore as any).bridgeStopAudio = () => {
      sendCommandToBridge('window.stopAudio && window.stopAudio(); true;');
    };
    (useGeminiVoiceStore as any).bridgeStartListening = (lang: string) => {
      sendCommandToBridge(`window.startListening && window.startListening("${lang}"); true;`);
    };
    (useGeminiVoiceStore as any).bridgeStopListening = () => {
      sendCommandToBridge('window.stopListening && window.stopListening(); true;');
    };
    (useGeminiVoiceStore as any).bridgeForceFinalize = () => {
      sendCommandToBridge('window.forceFinalize && window.forceFinalize(); true;');
    };
  }, []);

  if (Platform.OS === 'web' || !WebView) {
    return null;
  }

  return (
    <View style={styles.activeInvisibleContainer} pointerEvents="none">
      <WebView
        ref={webviewRef}
        originWhitelist={['*']}
        source={{ html: BRIDGE_HTML, baseUrl: 'https://localhost' }}
        onMessage={handleMessage}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        mediaPlaybackRequiresUserAction={false}
        allowsInlineMediaPlayback={true}
        mediaCapturePermissionGrantType="grant"
        onPermissionRequest={(request: any) => {
          try {
            request.grant(request.resources);
          } catch (e) {
            console.warn('[VoiceBridge] Permission grant error:', e);
          }
        }}
        style={styles.activeInvisibleWebView}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  activeInvisibleContainer: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 20,
    height: 20,
    opacity: 0.05,
    zIndex: -9999,
  },
  activeInvisibleWebView: {
    width: 20,
    height: 20,
  },
});
