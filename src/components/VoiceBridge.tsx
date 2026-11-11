/**
 * VoiceBridge.tsx
 *
 * Production-Grade Universal Speech-to-Text & Audio Bridge for MaitreD AI Voice Agent.
 * Compatible with Web (Desktop Chrome / Safari / Edge) and Mobile (Android / iOS WebView).
 *
 * Key Architecture:
 * 1. Audio Recording:
 *    - Captures device microphone via navigator.mediaDevices.getUserMedia({ audio: true }).
 *    - Explicit permission gating: Android RECORD_AUDIO verified before getUserMedia.
 *    - Dual-node audio graph:
 *      * AnalyserNode for continuous real-time RMS metering (reference metering).
 *      * ScriptProcessorNode for real-time 16-bit PCM chunk buffering.
 *    - Garbage-Collection Immunity: All Web Audio nodes are pinned to window._maitred_*.
 *    - Direct destination routing with zeroed outputBuffer: Keeps graph active without speaker feedback.
 *    - Real-time inputBuffer validation: Measures non-zero float values, input RMS, and peak.
 *    - Downsampling from input rate (e.g. 44.1kHz / 48kHz) to 16kHz Mono.
 *    - Compliant 16-bit PCM WAV (RIFF header) generation.
 * 2. Voice Activity Detection (VAD):
 *    - Ambient room noise calibration during initial 4 chunks (~370ms).
 *    - Dynamic speech threshold (Math.max(0.007, ambientNoiseFloor * 1.8)).
 *    - Auto-detects speech onset and ~1.6s of silence completion.
 *    - Manual push-to-talk override via forceFinalize() on button tap.
 * 3. Robust Lifecycle Management:
 *    - cancelListening() cleanly aborts without emitting false "No audio captured" errors on IDLE.
 *    - finalizeRecording() strictly guarded by isListening.
 * 4. Universal Platform Support:
 *    - On Web: Runs directly in browser DOM window.
 *    - On Mobile: Runs inside transparent foreground WebView.
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

// ── Shared Audio Engine JavaScript (Executed in Web DOM or WebView) ─────────────
const AUDIO_ENGINE_JS = `
(function() {
  'use strict';

  var isListening = false;
  var currentLang = 'en-IN';
  var mediaStream = null;
  var audioContext = null;
  var source = null;
  var scriptProcessor = null;
  var analyser = null;
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
  var chunkCounter = 0;
  var ambientNoiseFloor = 0;
  var ambientCalibrated = false;
  var ambientChunksCount = 0;
  var speechThreshold = 0.008;

  window.onerror = function(msg, url, line) {
    sendToRN('DEBUG', { message: 'AudioEngine Error: ' + msg + ' (line ' + line + ')' });
  };

  function sendToRN(type, payload) {
    var msgObj = Object.assign({ type: type }, payload || {});
    // On React Native Mobile WebView:
    if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
      window.ReactNativeWebView.postMessage(JSON.stringify(msgObj));
    }
    // On Web Browser Direct Hook:
    if (window._rnVoiceBridgeCallback) {
      window._rnVoiceBridgeCallback(msgObj);
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
        if (e.error !== 'no-speech') {
          sendToRN('DEBUG', { message: 'WebSpeech error: ' + (e.error || 'unknown') });
        }
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
    view.setUint16(20, 1, true); // PCM Format (1)
    view.setUint16(22, 1, true); // Mono channel (1)
    view.setUint32(24, sampleRate, true); // e.g. 16000
    view.setUint32(28, sampleRate * 2, true); // 32000
    view.setUint16(32, 2, true); // Block align (2)
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
      window._maitred_scriptProcessor = null;
    }
    if (analyser) {
      try { analyser.disconnect(); } catch(e) {}
      analyser = null;
      window._maitred_analyser = null;
    }
    if (source) {
      try { source.disconnect(); } catch(e) {}
      source = null;
      window._maitred_source = null;
    }
    if (audioContext) {
      try { audioContext.close(); } catch(e) {}
      audioContext = null;
      window._maitred_audioContext = null;
    }
    if (mediaStream) {
      try {
        mediaStream.getTracks().forEach(function(t) { t.stop(); });
      } catch(e) {}
      mediaStream = null;
      window._maitred_mediaStream = null;
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
    chunkCounter = 0;
    ambientNoiseFloor = 0;
    ambientCalibrated = false;
    ambientChunksCount = 0;
    speechThreshold = 0.008;

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

    cleanupAudioCapture();
    initFreshCapture();
  }

  function initFreshCapture() {
    if (micRequestPending) {
      sendToRN('DEBUG', { message: 'Microphone request is already in progress, waiting...' });
      return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      sendToRN('ERROR', { error: 'navigator.mediaDevices.getUserMedia is not supported in this browser' });
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
          message: 'getUserMedia pending > 4s. Please verify microphone permission in settings.'
        });
      }
    }, 4000);

    var constraints = {
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    };

    navigator.mediaDevices.getUserMedia(constraints)
      .catch(function(cErr) {
        sendToRN('DEBUG', { message: 'Advanced constraints failed (' + (cErr && cErr.message) + '), retrying with audio: true' });
        return navigator.mediaDevices.getUserMedia({ audio: true });
      })
      .then(function(stream) {
        clearTimeout(micTimeoutId);
        micRequestPending = false;
        mediaStream = stream;
        window._maitred_mediaStream = stream;

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

        // Track lifecycle monitors
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
        window._maitred_audioContext = audioContext;

        audioContext.onstatechange = function() {
          sendToRN('DEBUG', { message: 'AudioContext state changed to: ' + audioContext.state });
        };

        function connectAudioPipeline() {
          var inputRate = audioContext.sampleRate || 44100;
          sendToRN('DEBUG', {
            message: 'AudioContext running at ' + inputRate + 'Hz, state=' + audioContext.state
          });

          // 1. Create MediaStreamSource
          source = audioContext.createMediaStreamSource(stream);
          window._maitred_source = source;

          // 2. Create AnalyserNode (reference metering)
          analyser = audioContext.createAnalyser();
          analyser.fftSize = 1024;
          analyser.smoothingTimeConstant = 0.3;
          source.connect(analyser);
          window._maitred_analyser = analyser;

          // 3. Create ScriptProcessorNode (bufferSize=4096, 1 channel in, 1 channel out)
          scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1);
          window._maitred_scriptProcessor = scriptProcessor;

          var analyserBuffer = new Float32Array(analyser.fftSize);

          scriptProcessor.onaudioprocess = function(e) {
            // ALWAYS zero the outputBuffer so no microphone sound is played through the device speakers!
            var outBuf = e.outputBuffer.getChannelData(0);
            outBuf.fill(0);

            // If not in a listening turn, do not buffer chunks
            if (!isListening) return;

            var inBuf = e.inputBuffer.getChannelData(0);
            var len = inBuf.length;

            // Calculate input buffer RMS, peak, and non-zero count
            var sum = 0;
            var nonZero = 0;
            var peak = 0;
            for (var i = 0; i < len; i++) {
              var s = inBuf[i];
              var abs = Math.abs(s);
              if (abs > peak) peak = abs;
              if (abs > 0.00005) nonZero++;
              sum += s * s;
            }
            var rms = Math.sqrt(sum / len);
            totalNonZeroSamples += nonZero;
            chunkCounter++;

            // Independent AnalyserNode RMS verification
            analyser.getFloatTimeDomainData(analyserBuffer);
            var aSum = 0;
            for (var j = 0; j < analyserBuffer.length; j++) {
              aSum += analyserBuffer[j] * analyserBuffer[j];
            }
            var analyserRms = Math.sqrt(aSum / analyserBuffer.length);

            // Copy and push to PCM chunks
            var copy = new Float32Array(len);
            copy.set(inBuf);
            pcmChunks.push(copy);

            // First chunk logging with full diagnostics
            if (!firstChunkLogged) {
              firstChunkLogged = true;
              sendToRN('DEBUG', {
                message: 'PCM callback active: bufferSize=' + len +
                         ', nonZero=' + nonZero + '/' + len +
                         ', inputRMS=' + rms.toFixed(5) +
                         ', analyserRMS=' + analyserRms.toFixed(5) +
                         ', peak=' + peak.toFixed(4)
              });
            }

            // Calibrate ambient noise floor during first 4 chunks (~370ms)
            if (!ambientCalibrated) {
              ambientNoiseFloor = (ambientNoiseFloor * ambientChunksCount + rms) / (ambientChunksCount + 1);
              ambientChunksCount++;
              if (ambientChunksCount >= 4) {
                ambientCalibrated = true;
                // Dynamic threshold: at least 0.007, or 1.8x the measured room noise
                speechThreshold = Math.max(0.007, ambientNoiseFloor * 1.8);
                sendToRN('DEBUG', {
                  message: 'Noise floor calibrated: ambientRMS=' + ambientNoiseFloor.toFixed(5) +
                           ', speechThreshold=' + speechThreshold.toFixed(5)
                });
              }
            }

            // Voice Activity Detection (VAD)
            var currentThreshold = speechThreshold || 0.008;
            if (rms > currentThreshold || analyserRms > currentThreshold) {
              if (!isSpeaking) {
                isSpeaking = true;
                sendToRN('DEBUG', {
                  message: 'Voice detected: RMS=' + rms.toFixed(5) +
                           ' (threshold=' + currentThreshold.toFixed(5) +
                           '), chunk #' + pcmChunks.length
                });
              }
              silenceFrames = 0;
            } else if (isSpeaking) {
              silenceFrames++;
              // ~1.6 seconds of silence after speech (18 chunks of 4096 at 44.1kHz is ~1.67s)
              if (silenceFrames >= 18) {
                sendToRN('DEBUG', {
                  message: 'VAD silence detected (~1.6s of silence after speech). Auto-finalizing...'
                });
                finalizeRecording();
              }
            }

            // Periodic progress logging every 15 chunks (~1.4s)
            if (pcmChunks.length % 15 === 0) {
              sendToRN('AUDIO_LEVEL', {
                rms: rms,
                analyserRms: analyserRms,
                peak: peak,
                chunks: pcmChunks.length,
                isSpeaking: isSpeaking
              });

              if (pcmChunks.length >= 30 && totalNonZeroSamples === 0) {
                sendToRN('DEBUG', {
                  message: 'Hardware warning: 30 consecutive chunks with 0.00 amplitude. Check if hardware mic is muted.'
                });
              }
            }
          };

          // Connect source -> scriptProcessor -> destination
          // Since outBuf is filled with 0, this keeps the graph alive with 0 audio loopback!
          source.connect(scriptProcessor);
          scriptProcessor.connect(audioContext.destination);

          if (isListening) {
            sendToRN('STARTED', {});
          } else {
            sendToRN('DEBUG', { message: 'Microphone stream pre-warmed and ready for speech.' });
          }
        }

        if (audioContext.state === 'suspended') {
          audioContext.resume().then(function() {
            connectAudioPipeline();
          }).catch(function(resErr) {
            sendToRN('DEBUG', { message: 'AudioContext resume error: ' + resErr });
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

  function finalizeRecording() {
    // CRITICAL GUARD: Only finalize if actively listening!
    if (!isListening) return;
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

    // 2. Encode collected PCM audio into standard 16kHz WAV
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
                 ', inputRate=' + currentRate + 'Hz -> outputRate=16000Hz'
      });

      var resampled = downsampleBuffer(merged, currentRate, 16000);
      var wavBytes = encodeWAV(resampled, 16000);
      var b64Wav = uint8ToBase64(wavBytes);

      sendToRN('DEBUG', {
        message: '16kHz WAV encoded: ' + wavBytes.byteLength + ' bytes, base64 length=' + b64Wav.length +
                 ', sending to backend STT...'
      });
      sendToRN('FINALIZE_AUDIO', { audioBase64: b64Wav });
    } else {
      // If no chunks arrived yet, wait up to 1200ms for hardware buffer to arrive
      setTimeout(function() {
        if (!isListening) return;
        if (pcmChunks.length > 0) {
          finalizeRecording();
        } else {
          speechDispatched = true;
          isListening = false;
          sendToRN('AUDIO_SILENT', {});
        }
      }, 1200);
      return;
    }

    if (speechRecognition) {
      try { speechRecognition.stop(); } catch(e) {}
    }
  }

  // ── 6. Public Bridge Methods ─────────────────────────────────────────────────
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
    chunkCounter = 0;
    ambientCalibrated = false;
    ambientChunksCount = 0;

    // Ensure AudioContext is active
    if (audioContext && audioContext.state === 'suspended') {
      try { audioContext.resume(); } catch(e) {}
    }

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

  window.cancelListening = function() {
    isListening = false;
    speechDispatched = true;
    pcmChunks = [];
    isSpeaking = false;
    silenceFrames = 0;
    speechRecognizedText = '';
    if (speechRecognition) {
      try { speechRecognition.stop(); } catch(e) {}
    }
  };

  window.forceFinalize = function() {
    finalizeRecording();
  };

  window.releaseMicrophone = function() {
    isListening = false;
    micRequestPending = false;
    cleanupAudioCapture();
    if (speechRecognition) {
      try { speechRecognition.stop(); } catch(e) {}
      speechRecognition = null;
    }
    sendToRN('DEBUG', { message: 'Microphone hardware released cleanly.' });
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
})();
`;

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
${AUDIO_ENGINE_JS}
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

  const executeBridgeCommand = (cmd: string) => {
    if (Platform.OS === 'web') {
      try {
        // Direct browser DOM execution on Web
        const fn = new Function(cmd);
        fn();
      } catch (e) {
        console.warn('[VoiceBridge.web] Command error:', e);
      }
    } else if (webviewRef.current) {
      try {
        webviewRef.current.injectJavaScript(cmd);
      } catch (e) {
        console.warn('[VoiceBridge.mobile] injectJavaScript error:', e);
      }
    }
  };

  // Handle incoming bridge events
  const handleMessageData = (data: any) => {
    try {
      const store = useGeminiVoiceStore.getState();

      switch (data.type) {
        case 'READY':
          isBridgeReady.current = true;
          console.log('[VoiceBridge] Audio bridge ready (' + Platform.OS + ')');
          if (store.isConnected && store.agentState === 'LISTENING' && !store.isMuted) {
            const lang = store.isTamilMode ? 'ta-IN' : 'en-IN';
            executeBridgeCommand(`window.startListening && window.startListening("${lang}"); true;`);
          } else if (store.isConnected) {
            executeBridgeCommand('window.preWarmMicrophone && window.preWarmMicrophone(); true;');
          }
          break;

        case 'STARTED':
          console.log('[VoiceBridge] Recording active in audio engine');
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

        case 'AUDIO_SILENT':
          console.log('[VoiceBridge] No audio detected. Returning to idle.');
          if (store.agentState === 'LISTENING' || store.agentState === 'PROCESSING') {
            useGeminiVoiceStore.setState({
              agentState: 'IDLE',
              partialUserTranscript: 'Tap Speak and say your food order clearly.',
            });
          }
          break;

        case 'ERROR':
          console.log('[VoiceBridge] Notice:', data.error);
          if (store.agentState === 'LISTENING' || store.agentState === 'PROCESSING') {
            useGeminiVoiceStore.setState({
              agentState: 'IDLE',
              partialUserTranscript: data.error || 'Please speak clearly into your mic.',
            });
          }
          break;
      }
    } catch (e) {
      console.warn('[VoiceBridge] handleMessageData error:', e);
    }
  };

  // Setup Web DOM direct hook on Web platform
  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      (window as any)._rnVoiceBridgeCallback = handleMessageData;
      try {
        const script = document.createElement('script');
        script.textContent = AUDIO_ENGINE_JS;
        document.head.appendChild(script);
      } catch (err) {
        console.warn('[VoiceBridge.web] Script initialization error:', err);
      }
    }

    return () => {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        (window as any)._rnVoiceBridgeCallback = null;
      }
    };
  }, []);

  // Expose global bridge controller hooks to Zustand store
  useEffect(() => {
    (useGeminiVoiceStore as any).bridgePlayAudio = (base64: string) => {
      executeBridgeCommand(`window.playAudioBase64 && window.playAudioBase64("${base64}"); true;`);
    };
    (useGeminiVoiceStore as any).bridgeStopAudio = () => {
      executeBridgeCommand('window.stopAudio && window.stopAudio(); true;');
    };
    (useGeminiVoiceStore as any).bridgeStartListening = (lang: string) => {
      executeBridgeCommand(`window.startListening && window.startListening("${lang}"); true;`);
    };
    (useGeminiVoiceStore as any).bridgeStopListening = () => {
      executeBridgeCommand('window.cancelListening && window.cancelListening(); true;');
    };
    (useGeminiVoiceStore as any).bridgeForceFinalize = () => {
      executeBridgeCommand('window.forceFinalize && window.forceFinalize(); true;');
    };
    (useGeminiVoiceStore as any).bridgePreWarmMicrophone = () => {
      executeBridgeCommand('window.preWarmMicrophone && window.preWarmMicrophone(); true;');
    };
    (useGeminiVoiceStore as any).bridgeReleaseMicrophone = () => {
      executeBridgeCommand('window.releaseMicrophone && window.releaseMicrophone(); true;');
    };

    return () => {
      executeBridgeCommand('window.releaseMicrophone && window.releaseMicrophone(); true;');
    };
  }, []);

  // Sync state machine with bridge
  useEffect(() => {
    if (!isBridgeReady.current) return;

    if (!isConnected || isMuted) {
      executeBridgeCommand('window.cancelListening && window.cancelListening(); true;');
      return;
    }

    const lang = isTamilMode ? 'ta-IN' : 'en-IN';

    if (agentState === 'LISTENING') {
      executeBridgeCommand(`window.startListening && window.startListening("${lang}"); true;`);
    } else if (agentState !== 'PROCESSING' && agentState !== 'SPEAKING') {
      // When leaving LISTENING state, cleanly cancel without triggering an empty finalization error
      executeBridgeCommand('window.cancelListening && window.cancelListening(); true;');
    }
  }, [agentState, isConnected, isMuted, isTamilMode]);

  // Handle incoming bridge events from WebView (Mobile)
  const handleWebViewMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      handleMessageData(data);
    } catch (e) {
      console.warn('[VoiceBridge] onMessage parse error:', e);
    }
  };

  // On Web: Audio engine is already injected into the DOM directly
  if (Platform.OS === 'web') {
    return null;
  }

  if (!WebView) {
    return null;
  }

  // Render a 36x36 transparent WebView inside the active Modal Dialog for Mobile (Android / iOS)
  return (
    <View style={styles.bridgeContainer} pointerEvents="box-none">
      <WebView
        ref={webviewRef}
        originWhitelist={['*']}
        source={{ html: BRIDGE_HTML, baseUrl: 'https://localhost' }}
        onMessage={handleWebViewMessage}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        mediaPlaybackRequiresUserAction={false}
        allowsInlineMediaPlayback={true}
        androidHardwareAccelerationDisabled={false}
        mixedContentMode="always"
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
