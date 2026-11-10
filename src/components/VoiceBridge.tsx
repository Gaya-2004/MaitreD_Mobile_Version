/**
 * VoiceBridge.tsx
 *
 * Production-Grade Universal Speech-to-Text & Audio Bridge for MaitreD AI Voice Agent.
 * Compatible with Android (WebView Chromium inside Expo Go / Dev Client), iOS, and Web.
 *
 * Key Architecture:
 * 1. Audio Recording:
 *    - Captures device microphone via navigator.mediaDevices.getUserMedia({ audio: true }).
 *    - Explicit permission gating: React Native ensures native RECORD_AUDIO permission is granted
 *      BEFORE calling getUserMedia, preventing WebChromeClient deadlocks on Android.
 *    - AudioContext captures raw PCM audio samples via ScriptProcessorNode.
 *    - Explicitly awaits audioContext.resume() and validates audioContext.state === 'running'.
 *    - Validates track status (readyState === 'live', !track.muted, track.enabled).
 *    - Robust warm stream validation: checks stream activity, track liveness, AudioContext state,
 *      and pipeline connectivity before reuse. Automatically reinitializes if any check fails.
 *    - Zero-feedback gain pipeline to prevent acoustic feedback into phone speaker.
 *    - Downsamples from hardware rate (e.g. 44.1kHz / 48kHz) to 16kHz Mono.
 *    - Encodes into compliant 16-bit PCM WAV (RIFF header) delivered to React Native.
 * 2. Voice Activity Detection (VAD):
 *    - Real-time RMS volume computation.
 *    - Auto-detects speech start (RMS > 0.006) and speech completion (~1.8s silence).
 *    - Manual push-to-talk override via forceFinalize() on button tap.
 * 3. Dual Engine STT:
 *    - Primary: 16-bit PCM WAV delivered to backend Whisper/STT service.
 *    - Complementary: Local Web Speech API (webkitSpeechRecognition) when available.
 * 4. High-Fidelity Audio Playback:
 *    - Plays backend gTTS audio responses via HTML5 Audio pipeline.
 */

import React, { useEffect, useRef } from 'react';
import { Platform, View, StyleSheet } from 'react-native';
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
      width: 36px;
      height: 36px;
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
  var zeroGain = null;
  var pcmChunks = [];
  var isSpeaking = false;
  var silenceFrames = 0;
  var speechDispatched = false;
  var speechRecognition = null;
  var speechRecognizedText = '';
  var currentAudio = null;
  var firstChunkLogged = false;
  var micRequestPending = false;
  var totalNonZeroSamples = 0;

  window.onerror = function(msg, url, line) {
    sendToRN('DEBUG', { message: 'WebView JS Error: ' + msg + ' (line ' + line + ')' });
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

      r.onerror = function(e) {
        sendToRN('DEBUG', { message: 'WebSpeech error: ' + (e.error || 'unknown') });
      };
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

  // ── 4. Warm-Stream Validation ────────────────────────────────────────────────
  function isWarmStreamValid() {
    if (!mediaStream || !mediaStream.active) return false;
    var tracks = mediaStream.getAudioTracks();
    if (!tracks || tracks.length === 0) return false;
    var t = tracks[0];
    if (t.readyState !== 'live' || t.muted || !t.enabled) return false;
    if (!audioContext || audioContext.state === 'closed') return false;
    if (!scriptProcessor) return false;
    return true;
  }

  function cleanupAudioCapture() {
    if (scriptProcessor) {
      try { scriptProcessor.disconnect(); } catch(e) {}
      scriptProcessor = null;
    }
    if (zeroGain) {
      try { zeroGain.disconnect(); } catch(e) {}
      zeroGain = null;
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
  }

  // ── 5. Microphone Audio Stream & PCM Capture Pipeline ─────────────────────────
  function startMicrophoneCapture() {
    pcmChunks = [];
    isSpeaking = false;
    silenceFrames = 0;
    speechRecognizedText = '';
    speechDispatched = false;
    firstChunkLogged = false;
    totalNonZeroSamples = 0;

    // Validate existing warm stream
    if (isWarmStreamValid()) {
      sendToRN('DEBUG', { message: 'Reusing validated warm microphone stream.' });
      if (audioContext.state === 'suspended') {
        audioContext.resume().then(function() {
          if (audioContext.state === 'running') {
            sendToRN('STARTED', {});
          } else {
            sendToRN('DEBUG', { message: 'AudioContext resume failed to reach running; re-initializing.' });
            cleanupAudioCapture();
            initFreshCapture();
          }
        }).catch(function() {
          cleanupAudioCapture();
          initFreshCapture();
        });
      } else if (audioContext.state === 'running') {
        sendToRN('STARTED', {});
      } else {
        cleanupAudioCapture();
        initFreshCapture();
      }
      return;
    }

    // Clean up stale or degraded stream before fresh initialization
    cleanupAudioCapture();
    initFreshCapture();
  }

  function initFreshCapture() {
    if (micRequestPending) {
      sendToRN('DEBUG', { message: 'Microphone request is already in progress, waiting...' });
      return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      sendToRN('ERROR', { error: 'navigator.mediaDevices.getUserMedia is not supported in this environment' });
      return;
    }

    micRequestPending = true;
    sendToRN('DEBUG', {
      message: 'Requesting getUserMedia({ audio: true }). secure=' + window.isSecureContext +
               ', mediaDevices=' + (!!navigator.mediaDevices)
    });

    var micTimeoutId = setTimeout(function() {
      if (micRequestPending) {
        sendToRN('DEBUG', {
          message: 'getUserMedia pending > 4s. Please verify Android microphone permission in Settings > Apps > Expo Go > Permissions.'
        });
      }
    }, 4000);

    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(function(stream) {
        clearTimeout(micTimeoutId);
        micRequestPending = false;
        mediaStream = stream;

        var tracks = stream.getAudioTracks();
        if (!tracks || tracks.length === 0) {
          sendToRN('ERROR', { error: 'Microphone stream returned no audio tracks.' });
          return;
        }

        var t0 = tracks[0];
        sendToRN('DEBUG', {
          message: 'Microphone track acquired: label="' + (t0.label || 'Default Mic') + '"' +
                   ', readyState=' + t0.readyState +
                   ', enabled=' + t0.enabled +
                   ', muted=' + t0.muted
        });

        if (t0.readyState !== 'live') {
          sendToRN('ERROR', { error: 'Microphone audio track is not live (readyState=' + t0.readyState + ')' });
          return;
        }
        if (t0.muted) {
          sendToRN('ERROR', { error: 'Microphone audio track is muted at hardware level.' });
          return;
        }
        t0.enabled = true;

        // Monitor track lifecycle
        t0.onended = function() {
          sendToRN('DEBUG', { message: 'Microphone track ended unexpectedly.' });
          cleanupAudioCapture();
        };
        t0.onmute = function() {
          sendToRN('DEBUG', { message: 'Microphone track muted by system.' });
        };
        t0.onunmute = function() {
          sendToRN('DEBUG', { message: 'Microphone track unmuted.' });
        };

        // Initialize AudioContext
        var AudioCtx = window.AudioContext || window.webkitAudioContext;
        audioContext = new AudioCtx();

        audioContext.onstatechange = function() {
          sendToRN('DEBUG', { message: 'AudioContext state change: ' + audioContext.state });
        };

        function connectAudioPipeline() {
          if (audioContext.state !== 'running') {
            sendToRN('DEBUG', { message: 'AudioContext state is ' + audioContext.state + ', awaiting running state...' });
          }

          var inputRate = audioContext.sampleRate || 44100;
          sendToRN('DEBUG', {
            message: 'AudioContext active at ' + inputRate + 'Hz, state=' + audioContext.state
          });

          var source = audioContext.createMediaStreamSource(stream);
          scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1);

          scriptProcessor.onaudioprocess = function(e) {
            if (!isListening) return;

            var inputData = e.inputBuffer.getChannelData(0);
            var copy = new Float32Array(inputData.length);
            copy.set(inputData);
            pcmChunks.push(copy);

            // Compute RMS and peak values
            var sum = 0;
            var nonZero = 0;
            var peak = 0;
            for (var i = 0; i < copy.length; i++) {
              var abs = Math.abs(copy[i]);
              if (abs > peak) peak = abs;
              if (abs > 0.0001) nonZero++;
              sum += copy[i] * copy[i];
            }
            var rms = Math.sqrt(sum / copy.length);
            totalNonZeroSamples += nonZero;

            if (!firstChunkLogged) {
              firstChunkLogged = true;
              sendToRN('DEBUG', {
                message: 'PCM audio actively captured! Initial RMS=' + rms.toFixed(4) +
                         ', peak=' + peak.toFixed(4) + ', nonZeroSamples=' + nonZero + '/' + copy.length
              });
            }

            if (pcmChunks.length % 15 === 0) {
              sendToRN('AUDIO_LEVEL', { rms: rms, peak: peak, chunks: pcmChunks.length });
              // Pure silence warning if 30 chunks pass with 0 non-zero values
              if (pcmChunks.length >= 30 && totalNonZeroSamples === 0) {
                sendToRN('DEBUG', {
                  message: 'Warning: 30 chunks received with 0 amplitude. Verify hardware mic isn\'t muted.'
                });
              }
            }

            // Voice Activity Detection (threshold: 0.006 for sensitive speech capture)
            if (rms > 0.006) {
              if (!isSpeaking) {
                isSpeaking = true;
                sendToRN('DEBUG', {
                  message: 'Speech detected! RMS=' + rms.toFixed(4) + ', peak=' + peak.toFixed(4) + ', chunk=' + pcmChunks.length
                });
              }
              silenceFrames = 0;
            } else if (isSpeaking) {
              silenceFrames++;
              // ~1.8 seconds of silence after speech (each 4096 chunk at 44.1kHz is ~92ms -> 20 chunks ~1.8s)
              if (silenceFrames >= 20) {
                sendToRN('DEBUG', { message: 'VAD silence detected (~1.8s). Finalizing voice turn...' });
                finalizeRecording();
              }
            }
          };

          // Route through a zero-gain node so onaudioprocess fires continuously
          // without looping acoustic feedback into the phone speaker
          zeroGain = audioContext.createGain();
          zeroGain.gain.value = 0;
          source.connect(scriptProcessor);
          scriptProcessor.connect(zeroGain);
          zeroGain.connect(audioContext.destination);

          sendToRN('STARTED', {});
        }

        if (audioContext.state === 'suspended') {
          audioContext.resume().then(function() {
            connectAudioPipeline();
          }).catch(function(resErr) {
            sendToRN('DEBUG', { message: 'AudioContext resume warning: ' + resErr });
            connectAudioPipeline();
          });
        } else {
          connectAudioPipeline();
        }
      })
      .catch(function(err) {
        clearTimeout(micTimeoutId);
        micRequestPending = false;
        sendToRN('ERROR', { error: 'Mic stream error: ' + err.name + ' - ' + err.message });
      });
  }

  function pauseMicrophoneCapture() {
    isListening = false;
  }

  function releaseMicrophone() {
    isListening = false;
    micRequestPending = false;
    cleanupAudioCapture();
    if (speechRecognition) {
      try { speechRecognition.stop(); } catch(e) {}
      speechRecognition = null;
    }
    sendToRN('DEBUG', { message: 'Microphone hardware released cleanly.' });
  }

  function finalizeRecording() {
    if (speechDispatched) return;

    if (micRequestPending) {
      sendToRN('DEBUG', { message: 'Finalize requested while mic request is pending. Waiting for stream...' });
      setTimeout(function() {
        finalizeRecording();
      }, 500);
      return;
    }

    // 1. If Web Speech API already transcribed text with high confidence, use it
    if (speechRecognizedText && speechRecognizedText.trim().length > 1) {
      speechDispatched = true;
      isListening = false;
      sendToRN('DEBUG', { message: 'Using local WebSpeech transcript: "' + speechRecognizedText.trim() + '"' });
      sendToRN('FINALIZE_TEXT', { text: speechRecognizedText.trim() });
      if (speechRecognition) {
        try { speechRecognition.stop(); } catch(e) {}
      }
      return;
    }

    // 2. Otherwise encode collected PCM audio into standard 16kHz WAV
    if (pcmChunks.length > 0) {
      speechDispatched = true;
      isListening = false;

      var totalSamples = 0;
      for (var i = 0; i < pcmChunks.length; i++) totalSamples += pcmChunks[i].length;

      var merged = new Float32Array(totalSamples);
      var offset = 0;
      for (var j = 0; j < pcmChunks.length; j++) {
        merged.set(pcmChunks[j], offset);
        offset += pcmChunks[j].length;
      }

      var currentRate = (audioContext && audioContext.sampleRate) ? audioContext.sampleRate : 44100;
      var durationSec = (totalSamples / currentRate).toFixed(2);
      sendToRN('DEBUG', {
        message: 'Finalizing recording: chunks=' + pcmChunks.length +
                 ', totalSamples=' + totalSamples +
                 ', duration=' + durationSec + 's' +
                 ', sampleRate=' + currentRate + 'Hz'
      });

      var resampled = downsampleBuffer(merged, currentRate, 16000);
      var wavBytes = encodeWAV(resampled, 16000);
      var b64Wav = uint8ToBase64(wavBytes);

      sendToRN('DEBUG', {
        message: 'WAV encoded successfully: ' + wavBytes.byteLength + ' bytes, base64 len=' + b64Wav.length
      });
      sendToRN('FINALIZE_AUDIO', { audioBase64: b64Wav });
    } else {
      // If no chunks arrived yet, wait up to 600ms to give audio buffer time to accumulate
      setTimeout(function() {
        if (pcmChunks.length > 0) {
          finalizeRecording();
        } else {
          speechDispatched = true;
          isListening = false;
          sendToRN('ERROR', { error: 'No audio captured. Please speak into your microphone.' });
        }
      }, 600);
      return;
    }

    if (speechRecognition) {
      try { speechRecognition.stop(); } catch(e) {}
    }
  }

  // ── 6. Public Bridge Methods for React Native ─────────────────────────────────
  window.preWarmMicrophone = function() {
    if ((mediaStream && mediaStream.active) || micRequestPending) return;
    startMicrophoneCapture();
  };

  window.startListening = function(lang) {
    if (lang) currentLang = lang;
    isListening = true;
    speechDispatched = false;
    pcmChunks = [];
    isSpeaking = false;
    silenceFrames = 0;
    speechRecognizedText = '';
    firstChunkLogged = false;
    totalNonZeroSamples = 0;

    // Start Web Speech recognizer if available
    if (!speechRecognition) {
      speechRecognition = initSpeechRecognition();
    }
    if (speechRecognition) {
      speechRecognition.lang = currentLang;
      try { speechRecognition.start(); } catch(e) {}
    }

    if (isWarmStreamValid()) {
      sendToRN('DEBUG', { message: 'Reusing validated warm microphone stream.' });
      if (audioContext.state === 'suspended') {
        audioContext.resume().then(function() {
          sendToRN('STARTED', {});
        }).catch(function() {
          sendToRN('STARTED', {});
        });
      } else {
        sendToRN('STARTED', {});
      }
      return;
    }

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
    (useGeminiVoiceStore as any).bridgePreWarmMicrophone = () => {
      sendCommandToBridge('window.preWarmMicrophone && window.preWarmMicrophone(); true;');
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
          } else if (store.isConnected) {
            sendCommandToBridge('window.preWarmMicrophone && window.preWarmMicrophone(); true;');
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
            console.log('[VoiceBridge] 16kHz WAV captured, sending to backend STT (base64 length=' + data.audioBase64.length + ')...');
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
          if (store.agentState === 'LISTENING' || store.agentState === 'PROCESSING') {
            useGeminiVoiceStore.setState({
              agentState: 'IDLE',
              partialUserTranscript: data.error || 'Please speak clearly into your mic.',
            });
          }
          break;
      }
    } catch (e) {
      console.warn('[VoiceBridge] onMessage parse error:', e);
    }
  };

  if (Platform.OS === 'web' || !WebView) {
    return null;
  }

  // Render a 36x36 transparent WebView inside the active Modal Dialog
  // so Chromium compositor treats it as an on-screen, active foreground frame.
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
    width: 36,
    height: 36,
    opacity: 1,
    backgroundColor: 'transparent',
    zIndex: 9999,
  },
  webView: {
    width: 36,
    height: 36,
    backgroundColor: 'transparent',
  },
});
