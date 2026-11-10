/**
 * VoiceBridge.tsx
 *
 * Production-Grade Universal Speech-to-Text & Audio Bridge for MaitreD AI Voice Agent.
 * Compatible with Android (WebView Chromium), iOS, and Web.
 *
 * Key Architecture:
 * 1. Audio Recording:
 *    - Uses native device microphone via getUserMedia({ audio: true }).
 *    - AudioContext captures PCM audio samples in real-time with automatic resume().
 *    - Downsamples to 16kHz Mono.
 *    - Encodes directly into compliant 16-bit PCM WAV format (RIFF/WAVE header).
 *    - Base64 WAV is delivered to React Native for high-accuracy backend STT.
 *    - Warm stream retention: keeps microphone stream alive between turns to eliminate
 *      re-initialization lag and audio dropouts.
 * 2. Voice Activity Detection (VAD):
 *    - Real-time RMS volume computation.
 *    - Auto-detects speech start and speech end (1.4s silence after speech).
 *    - Manual push-to-talk override via forceFinalize() on button tap.
 * 3. Layout Resilience:
 *    - Rendered directly inside the focused native Dialog/Modal window so Chromium
 *      compositor treats media capture as fully active and foregrounded.
 * 4. High-Fidelity Audio Playback:
 *    - Plays backend gTTS audio responses via HTML5 Audio pipeline.
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
  <title>MaitreD Audio Engine</title>
  <style>
    html, body {
      background: transparent;
      margin: 0;
      padding: 0;
      overflow: hidden;
      width: 20px;
      height: 20px;
    }
  </style>
</head>
<body>
<script>
  'use strict';

  var isListening = false;
  var currentLang = 'en-IN';
  var mediaStream = null;
  var audioContext = null;
  var scriptProcessor = null;
  var pcmChunks = [];
  var isSpeaking = false;
  var silenceFrames = 0;
  var speechDispatched = false;
  var speechRecognition = null;
  var speechRecognizedText = '';
  var currentAudio = null;
  var firstChunkLogged = false;

  window.onerror = function(msg, url, line) {
    sendToRN('DEBUG', { message: 'WebView JS Error: ' + msg + ' (' + line + ')' });
  };

  function sendToRN(type, payload) {
    var msg = JSON.stringify(Object.assign({ type: type }, payload || {}));
    if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
      window.ReactNativeWebView.postMessage(msg);
    }
  }

  // ── 1. Web Speech API (Complementary Real-Time Engine) ────────────────────────
  function initSpeechRecognition() {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return null;
    try {
      var r = new SR();
      r.continuous = true;
      r.interimResults = true;
      r.lang = currentLang;

      r.onresult = function(e) {
        var interim = '';
        var final = '';
        for (var i = e.resultIndex; i < e.results.length; ++i) {
          var t = e.results[i][0].transcript;
          if (e.results[i].isFinal) final += t;
          else interim += t;
        }
        var spoken = (final || interim || '').trim();
        if (spoken) {
          speechRecognizedText = spoken;
          sendToRN('TRANSCRIPT', { text: spoken, isFinal: !!final });
        }
      };

      r.onerror = function() {};
      r.onend = function() {
        if (isListening && speechRecognition) {
          try { speechRecognition.start(); } catch(err) {}
        }
      };
      return r;
    } catch(err) {
      return null;
    }
  }

  // ── 2. Standard 16-bit PCM WAV Encoder ───────────────────────────────────────
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
    view.setUint16(20, 1, true); // PCM Format
    view.setUint16(22, 1, true); // Mono channel
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true); // Block align
    view.setUint16(34, 16, true); // 16 bits per sample
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

  // ── 3. Downsampling Helper ──────────────────────────────────────────────────
  function downsampleBuffer(buffer, sampleRate, outSampleRate) {
    if (outSampleRate === sampleRate) {
      return buffer;
    }
    if (outSampleRate > sampleRate) {
      return buffer;
    }
    var sampleRateRatio = sampleRate / outSampleRate;
    var newLength = Math.round(buffer.length / sampleRateRatio);
    var result = new Float32Array(newLength);
    var offsetResult = 0;
    var offsetBuffer = 0;
    while (offsetResult < result.length) {
      var nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
      var accum = 0, count = 0;
      for (var i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
        accum += buffer[i];
        count++;
      }
      result[offsetResult] = count > 0 ? (accum / count) : 0;
      offsetResult++;
      offsetBuffer = nextOffsetBuffer;
    }
    return result;
  }

  // ── 4. Microphone Audio Stream & VAD ─────────────────────────────────────────
  function startMicrophoneCapture() {
    pcmChunks = [];
    isSpeaking = false;
    silenceFrames = 0;
    speechRecognizedText = '';
    speechDispatched = false;
    firstChunkLogged = false;

    // Warm stream reuse: keep existing stream alive across turns
    if (mediaStream && mediaStream.active && audioContext && audioContext.state !== 'closed') {
      sendToRN('DEBUG', { message: 'Reusing existing warm microphone stream.' });
      if (audioContext.state === 'suspended') {
        audioContext.resume();
      }
      sendToRN('STARTED', {});
      return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      sendToRN('ERROR', { error: 'getUserMedia is not supported in this environment' });
      return;
    }

    sendToRN('DEBUG', { message: 'Requesting microphone stream (secure=' + window.isSecureContext + ')...' });

    var constraints = {
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    };

    navigator.mediaDevices.getUserMedia(constraints)
      .catch(function() {
        return navigator.mediaDevices.getUserMedia({ audio: true });
      })
      .then(function(stream) {
        mediaStream = stream;
        sendToRN('DEBUG', { message: 'Microphone stream acquired! Tracks=' + stream.getAudioTracks().length });

        var AudioCtx = window.AudioContext || window.webkitAudioContext;
        audioContext = new AudioCtx();
        if (audioContext.state === 'suspended') {
          audioContext.resume();
        }

        var inputRate = audioContext.sampleRate || 44100;
        sendToRN('DEBUG', { message: 'AudioContext active at ' + inputRate + 'Hz, state=' + audioContext.state });

        var source = audioContext.createMediaStreamSource(stream);
        // ScriptProcessor captures 4096-sample raw buffers
        scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1);

        scriptProcessor.onaudioprocess = function(e) {
          if (!isListening) return;

          var inputData = e.inputBuffer.getChannelData(0);
          var copy = new Float32Array(inputData.length);
          copy.set(inputData);
          pcmChunks.push(copy);

          // Calculate Root Mean Square (RMS) volume
          var sum = 0;
          for (var i = 0; i < copy.length; i++) {
            sum += copy[i] * copy[i];
          }
          var rms = Math.sqrt(sum / copy.length);

          if (!firstChunkLogged) {
            firstChunkLogged = true;
            sendToRN('DEBUG', { message: 'Audio streaming actively into buffer! Initial RMS=' + rms.toFixed(4) });
          }

          if (pcmChunks.length % 10 === 0) {
            sendToRN('AUDIO_LEVEL', { rms: rms, frames: pcmChunks.length });
          }

          // Voice Activity Detection (threshold: 0.008 for sensitive mic capture)
          if (rms > 0.008) {
            if (!isSpeaking) {
              isSpeaking = true;
              sendToRN('DEBUG', { message: 'User voice detected (RMS=' + rms.toFixed(4) + ')' });
            }
            silenceFrames = 0;
          } else if (isSpeaking) {
            silenceFrames++;
            // ~1.4 seconds of silence after speaking (each 4096 chunk at 44.1kHz is ~92ms -> 15 chunks ~1.4s)
            if (silenceFrames > 15) {
              sendToRN('DEBUG', { message: 'VAD silence detected. Finalizing voice turn...' });
              finalizeRecording();
            }
          }
        };

        source.connect(scriptProcessor);
        scriptProcessor.connect(audioContext.destination);

        sendToRN('STARTED', {});
      })
      .catch(function(err) {
        sendToRN('ERROR', { error: 'Mic stream error: ' + err.name + ' - ' + err.message });
      });
  }

  function pauseMicrophoneCapture() {
    isListening = false;
  }

  function releaseMicrophone() {
    isListening = false;
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
        mediaStream.getTracks().forEach(function(t) { t.stop(); });
      } catch(e) {}
      mediaStream = null;
    }
    if (speechRecognition) {
      try { speechRecognition.stop(); } catch(e) {}
      speechRecognition = null;
    }
    sendToRN('DEBUG', { message: 'Microphone hardware released cleanly.' });
  }

  function finalizeRecording() {
    if (speechDispatched) return;
    speechDispatched = true;
    isListening = false;

    // 1. If Web Speech API already transcribed text with high confidence, use it
    if (speechRecognizedText && speechRecognizedText.trim().length > 1) {
      sendToRN('FINALIZE_TEXT', { text: speechRecognizedText.trim() });
      if (speechRecognition) {
        try { speechRecognition.stop(); } catch(e) {}
      }
      return;
    }

    // 2. Otherwise encode collected PCM audio into standard 16kHz WAV
    if (pcmChunks.length > 0) {
      var totalSamples = 0;
      for (var i = 0; i < pcmChunks.length; i++) totalSamples += pcmChunks[i].length;

      var merged = new Float32Array(totalSamples);
      var offset = 0;
      for (var j = 0; j < pcmChunks.length; j++) {
        merged.set(pcmChunks[j], offset);
        offset += pcmChunks[j].length;
      }

      var currentRate = (audioContext && audioContext.sampleRate) ? audioContext.sampleRate : 44100;
      var resampled = downsampleBuffer(merged, currentRate, 16000);

      var wavBytes = encodeWAV(resampled, 16000);
      var b64Wav = uint8ToBase64(wavBytes);

      sendToRN('DEBUG', { message: 'Encoded 16kHz WAV: ' + wavBytes.byteLength + ' bytes' });
      sendToRN('FINALIZE_AUDIO', { audioBase64: b64Wav });
    } else {
      // If no chunks arrived yet, wait 350ms to give audio buffer time to flush
      setTimeout(function() {
        if (pcmChunks.length > 0) {
          speechDispatched = false;
          finalizeRecording();
        } else {
          sendToRN('ERROR', { error: 'No audio captured. Please speak into your microphone.' });
        }
      }, 350);
      return;
    }

    if (speechRecognition) {
      try { speechRecognition.stop(); } catch(e) {}
    }
  }

  // ── 5. Public Bridge Methods for React Native ─────────────────────────────────
  window.startListening = function(lang) {
    if (isListening) return;
    if (lang) currentLang = lang;
    isListening = true;
    speechDispatched = false;

    // Start Web Speech recognizer if available
    if (!speechRecognition) {
      speechRecognition = initSpeechRecognition();
    }
    if (speechRecognition) {
      speechRecognition.lang = currentLang;
      try { speechRecognition.start(); } catch(e) {}
    }

    // Start raw PCM capture
    startMicrophoneCapture();
  };

  window.stopListening = function() {
    finalizeRecording();
  };

  window.forceFinalize = function() {
    finalizeRecording();
  };

  window.releaseMicrophone = function() {
    releaseMicrophone();
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
    currentAudio.play().catch(function() {
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

  // Auto-request Android runtime permission on mount
  useEffect(() => {
    if (Platform.OS === 'android') {
      PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, {
        title: 'Microphone Permission',
        message: 'MaitreD needs microphone access to take your food orders by voice.',
        buttonPositive: 'Allow',
        buttonNegative: 'Deny',
      }).catch((e) => {
        console.warn('[VoiceBridge] Android mic request warning:', e);
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
    (useGeminiVoiceStore as any).bridgeReleaseMicrophone = () => {
      sendCommandToBridge('window.releaseMicrophone && window.releaseMicrophone(); true;');
    };

    return () => {
      sendCommandToBridge('window.releaseMicrophone && window.releaseMicrophone(); true;');
    };
  }, []);

  // Sync state machine with WebView bridge
  useEffect(() => {
    if (!isBridgeReady.current) return;

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
          console.log('[VoiceBridge] Audio bridge ready');
          if (store.isConnected && store.agentState === 'LISTENING' && !store.isMuted) {
            const lang = store.isTamilMode ? 'ta-IN' : 'en-IN';
            sendCommandToBridge(`window.startListening && window.startListening("${lang}"); true;`);
          }
          break;

        case 'STARTED':
          console.log('[VoiceBridge] Recording active in WebView');
          break;

        case 'TRANSCRIPT':
          if (data.text) {
            useGeminiVoiceStore.setState({ partialUserTranscript: data.text });
          }
          break;

        case 'FINALIZE_TEXT':
          if (data.text) {
            console.log('[VoiceBridge] Text recognized locally:', data.text);
            store.sendTextMessage(data.text);
          }
          break;

        case 'FINALIZE_AUDIO':
          if (data.audioBase64) {
            console.log('[VoiceBridge] 16kHz WAV captured, sending to backend STT...');
            store.sendVoiceAudio(data.audioBase64);
          }
          break;

        case 'AUDIO_ENDED':
          useGeminiVoiceStore.setState({
            agentState: 'IDLE',
            partialAgentTranscript: '',
          });
          break;

        case 'DEBUG':
          console.log('[VoiceBridge]', data.message);
          break;

        case 'AUDIO_LEVEL':
          break;

        case 'ERROR':
          console.warn('[VoiceBridge] Notice:', data.error);
          break;
      }
    } catch (e) {
      console.warn('[VoiceBridge] onMessage parse error:', e);
    }
  };

  if (Platform.OS === 'web' || !WebView) {
    return null;
  }

  // Render a 20x20 transparent WebView with opacity: 0.99 inside the active Modal Dialog
  // so Chromium compositor keeps audio capture fully active and foregrounded.
  return (
    <View style={styles.bridgeContainer} pointerEvents="box-none">
      <WebView
        ref={webviewRef}
        originWhitelist={['*']}
        source={{ html: BRIDGE_HTML, baseUrl: 'https://maitred.app' }}
        onMessage={handleMessage}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        mediaPlaybackRequiresUserAction={false}
        allowsInlineMediaPlayback={true}
        androidHardwareAccelerationDisabled={false}
        scalesPageToFit={false}
        style={styles.webView}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bridgeContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 20,
    height: 20,
    opacity: 0.99,
    backgroundColor: 'transparent',
    zIndex: 9999,
  },
  webView: {
    width: 20,
    height: 20,
    backgroundColor: 'transparent',
  },
});
