import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator, Image, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Link } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../store';
import { customerApi } from '../../services/apiService';

export default function LoginScreen() {
  const router = useRouter();
  const { login } = useAuthStore();
  
  interface ErrorState {
    title: string;
    message: string;
    actionType?: 'signup' | 'retry';
  }

  const [phone, setPhone] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorInfo, setErrorInfo] = useState<ErrorState | null>(null);

  const handleLogin = async () => {
    setErrorInfo(null);
    
    // Basic validation
    if (!phone || phone.length !== 10) {
      setErrorInfo({
        title: 'Invalid Mobile Number',
        message: 'Please enter a valid 10-digit mobile number.',
      });
      return;
    }
    setIsLoading(true);

    try {
      // Format phone number
      let formattedPhone = phone.trim();
      if (!formattedPhone.startsWith('+')) {
        formattedPhone = `+91${formattedPhone.replace(/^0+/, '')}`;
      }

      const data = await customerApi.login({
        phone: formattedPhone,
        otp: '1234'
      });
      
      login({
        customerId: data.id,
        customerName: data.name,
        phone: data.phone,
        token: data.token
      });
      
      router.replace('/outlet-selector');
    } catch (err: any) {
      console.warn('Login attempt failed:', err?.message || err);
      const rawMsg = String(err?.message || '');
      const is404 = err?.status === 404 || 
                    rawMsg.toLowerCase().includes('not found') || 
                    rawMsg.toLowerCase().includes('no account');

      if (is404) {
        setErrorInfo({
          title: 'Account Not Found',
          message: `No account found for +91 ${phone}. Please sign up to start ordering delicious food.`,
          actionType: 'signup',
        });
      } else if (rawMsg.toLowerCase().includes('timeout') || rawMsg.toLowerCase().includes('abort') || rawMsg.toLowerCase().includes('network')) {
        setErrorInfo({
          title: 'Connection Problem',
          message: 'Unable to reach the server. Please check your internet connection and try again.',
          actionType: 'retry',
        });
      } else {
        const cleanMsg = rawMsg.replace(/\s*\(HTTP\s*\d+\)/i, '').trim();
        setErrorInfo({
          title: 'Unable to Login',
          message: cleanMsg || 'An unexpected error occurred during login. Please try again.',
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView 
        style={{ flex: 1 }} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.content}>
          <View style={styles.header}>
            <Image 
              source={require('../../../assets/images/Dataudupi-Title.jpg')} 
              style={styles.logo} 
              resizeMode="contain"
            />
            <Text style={styles.title}>Welcome Back</Text>
            <Text style={styles.subtitle}>Enter your details to continue</Text>
          </View>

          <View style={styles.form}>
            {errorInfo ? (
              <View style={styles.errorCard}>
                <View style={styles.errorIconContainer}>
                  <Ionicons name="alert-circle" size={22} color="#DC2626" />
                </View>
                <View style={styles.errorTextContainer}>
                  <Text style={styles.errorTitle}>{errorInfo.title}</Text>
                  <Text style={styles.errorMessage}>{errorInfo.message}</Text>
                  {errorInfo.actionType === 'signup' && (
                    <TouchableOpacity
                      style={styles.errorActionBtn}
                      onPress={() => router.push({ pathname: '/signup', params: { phone } })}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.errorActionBtnText}>Sign Up Now</Text>
                      <Ionicons name="arrow-forward" size={13} color="#DC2626" />
                    </TouchableOpacity>
                  )}
                </View>
                <TouchableOpacity
                  style={styles.errorDismissBtn}
                  onPress={() => setErrorInfo(null)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="close" size={18} color="#991B1B" />
                </TouchableOpacity>
              </View>
            ) : null}

            <View style={styles.inputContainer}>
              <Ionicons name="call-outline" size={20} color="#666" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Mobile Number"
                placeholderTextColor="#999"
                keyboardType="phone-pad"
                value={phone}
                onChangeText={(text) => {
                  setPhone(text);
                  setErrorInfo(null);
                }}
                maxLength={10}
              />
            </View>



            <TouchableOpacity 
              style={[styles.loginBtn, isLoading && styles.loginBtnDisabled]}
              onPress={handleLogin}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.loginBtnText}>Login</Text>
              )}
            </TouchableOpacity>
            
            <View style={styles.signupContainer}>
              <Text style={styles.signupText}>Don&apos;t have an account? </Text>
              <Link href="/signup" asChild>
                <TouchableOpacity>
                  <Text style={styles.signupLink}>Sign Up</Text>
                </TouchableOpacity>
              </Link>
            </View>
            
            <Text style={styles.hintText}>Enter your mobile number to proceed.</Text>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logo: {
    width: 200,
    height: 80,
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1A1A1A',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
  },
  form: {
    width: '100%',
  },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 16,
    shadowColor: '#DC2626',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  errorIconContainer: {
    marginRight: 10,
    marginTop: 2,
  },
  errorTextContainer: {
    flex: 1,
    paddingRight: 4,
  },
  errorTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#991B1B',
    marginBottom: 3,
  },
  errorMessage: {
    fontSize: 13,
    color: '#7F1D1D',
    lineHeight: 18,
  },
  errorActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
    alignSelf: 'flex-start',
    backgroundColor: '#FEE2E2',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  errorActionBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#DC2626',
  },
  errorDismissBtn: {
    padding: 2,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    marginBottom: 16,
    paddingHorizontal: 16,
    height: 56,
    borderWidth: 1,
    borderColor: '#eee',
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#333',
    height: '100%',
  },
  loginBtn: {
    backgroundColor: '#FF4B1F',
    borderRadius: 12,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    shadowColor: '#FF4B1F',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  loginBtnDisabled: {
    backgroundColor: '#ffb29e',
    shadowOpacity: 0,
    elevation: 0,
  },
  loginBtnText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  signupContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 24,
  },
  signupText: {
    color: '#666',
    fontSize: 14,
  },
  signupLink: {
    color: '#FF4B1F',
    fontSize: 14,
    fontWeight: 'bold',
  },
  hintText: {
    textAlign: 'center',
    color: '#999',
    fontSize: 12,
    marginTop: 24,
  }
});
