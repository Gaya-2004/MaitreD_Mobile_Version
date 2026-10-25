import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator, Image, KeyboardAvoidingView, Platform, DeviceEventEmitter } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Link, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../store';
import { customerApi } from '../../services/apiService';


interface ErrorState {
  title: string;
  message: string;
  actionType?: 'login' | 'retry';
}

export default function SignupScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ phone?: string }>();
  const { login } = useAuthStore();
  
  const [name, setName] = useState('');
  const [phone, setPhone] = useState(params.phone || '');
  const [isLoading, setIsLoading] = useState(false);
  const [errorInfo, setErrorInfo] = useState<ErrorState | null>(null);

  useEffect(() => {
    const nameSub = DeviceEventEmitter.addListener('set_signup_name', (val) => setName(val));
    const phoneSub = DeviceEventEmitter.addListener('set_signup_phone', (val) => setPhone(val));

    return () => {
      nameSub.remove();
      phoneSub.remove();
    };
  }, []);

  const handleSignup = async () => {
    setErrorInfo(null);
    
    // Basic validation
    if (!name || name.trim().length === 0) {
      setErrorInfo({
        title: 'Name Required',
        message: 'Please enter your full name.',
      });
      return;
    }
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

      // Check if phone already exists
      const checkRes = await customerApi.checkPhone({ phone: formattedPhone });
      if (checkRes.customer_exists) {
        setErrorInfo({
          title: 'Account Already Exists',
          message: 'An account is already registered with this mobile number.',
          actionType: 'login',
        });
        setIsLoading(false);
        return;
      }

      const data = await customerApi.signup({
        name: name.trim(),
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
      console.warn('Signup error:', err?.message || err);
      const rawMsg = String(err?.message || '');
      const cleanMsg = rawMsg.replace(/\s*\(HTTP\s*\d+\)/i, '').trim();
      setErrorInfo({
        title: 'Signup Failed',
        message: cleanMsg || 'An error occurred during signup. Please try again.',
      });
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
            <Text style={styles.title}>Create an Account</Text>
            <Text style={styles.subtitle}>Join us and start ordering</Text>
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
                  {errorInfo.actionType === 'login' && (
                    <TouchableOpacity
                      style={styles.errorActionBtn}
                      onPress={() => router.push('/login')}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.errorActionBtnText}>Log In Now</Text>
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
              <Ionicons name="person-outline" size={20} color="#666" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Full Name"
                placeholderTextColor="#999"
                value={name}
                onChangeText={(text) => {
                  setName(text);
                  setErrorInfo(null);
                }}
              />
            </View>

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
              onPress={handleSignup}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.loginBtnText}>Sign Up</Text>
              )}
            </TouchableOpacity>
            
            <View style={styles.signupContainer}>
              <Text style={styles.signupText}>Already have an account? </Text>
              <Link href="/login" asChild>
                <TouchableOpacity>
                  <Text style={styles.signupLink}>Login</Text>
                </TouchableOpacity>
              </Link>
            </View>
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
