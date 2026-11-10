import 'react-native-get-random-values';
import React, { Component, ErrorInfo, ReactNode, useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Slot } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import VoiceAgentModal from '../components/VoiceAgentModal';
import ResponsiveContainer from '../components/layout/ResponsiveContainer';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class RootErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('RootErrorBoundary caught an error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={errorStyles.container}>
          <Text style={errorStyles.title}>MaitreD</Text>
          <Text style={errorStyles.message}>Something went wrong while starting the app.</Text>
          {this.state.error?.message ? (
            <View style={errorStyles.errorBox}>
              <Text style={errorStyles.errorBoxText}>{this.state.error.message}</Text>
            </View>
          ) : null}
          <TouchableOpacity style={errorStyles.button} onPress={this.handleReset}>
            <Text style={errorStyles.buttonText}>Restart App</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <RootErrorBoundary>
          <ResponsiveContainer>
            <Slot />
            <VoiceAgentModal />
          </ResponsiveContainer>
        </RootErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const errorStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#DF9B34',
    marginBottom: 12,
  },
  message: {
    fontSize: 15,
    color: '#d1d5db',
    textAlign: 'center',
    marginBottom: 16,
  },
  errorBox: {
    backgroundColor: '#1f2937',
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
    maxWidth: '90%',
  },
  errorBoxText: {
    color: '#ef4444',
    fontSize: 13,
    fontFamily: Platform?.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  button: {
    backgroundColor: '#DF9B34',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  buttonText: {
    color: '#000',
    fontWeight: '600',
    fontSize: 15,
  },
});
