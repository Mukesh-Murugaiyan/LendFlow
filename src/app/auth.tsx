import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/store/useAuthStore';

export default function AuthScreen() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const { signIn, signUp, isLoading } = useAuthStore();

  const handleAuth = async () => {
    if (!email || !password) {
      Alert.alert('Required Fields', 'Please enter both email and password.');
      return;
    }

    if (isSignUp) {
      if (!fullName) {
        Alert.alert('Name Required', 'Please provide your full name.');
        return;
      }
      const res = await signUp(email, password, fullName);
      if (res.error) {
        Alert.alert('Sign Up Error', res.error);
      } else {
        router.replace('/(tabs)');
      }
    } else {
      const res = await signIn(email, password);
      if (res.error) {
        Alert.alert('Login Failed', res.error);
      } else {
        router.replace('/(tabs)');
      }
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      <View style={styles.card}>
        <View style={styles.logoWrap}>
          <Ionicons name="wallet" size={32} color="#4F46E5" />
        </View>

        <Text style={styles.title}>{isSignUp ? 'Create Lender Account' : 'Welcome to LendFlow'}</Text>
        <Text style={styles.subtitle}>
          {isSignUp
            ? 'Sign up to start tracking loans & automated interest'
            : 'Private Lending & Interest Management'}
        </Text>

        {isSignUp && (
          <View style={styles.fieldWrap}>
            <Text style={styles.fieldLabel}>Full Name / Business Name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Mukesh Murugaiyan"
              value={fullName}
              onChangeText={setFullName}
              autoCapitalize="words"
            />
          </View>
        )}

        <View style={styles.fieldWrap}>
          <Text style={styles.fieldLabel}>Email Address</Text>
          <TextInput
            style={styles.input}
            placeholder="lender@example.com"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
        </View>

        <View style={styles.fieldWrap}>
          <Text style={styles.fieldLabel}>Password</Text>
          <TextInput
            style={styles.input}
            placeholder="••••••••"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
        </View>

        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={handleAuth}
          disabled={isLoading}
          activeOpacity={0.8}
        >
          <Text style={styles.primaryBtnText}>
            {isLoading ? 'Processing...' : isSignUp ? 'Create Account' : 'Sign In'}
          </Text>
        </TouchableOpacity>

        {/* Toggle Mode */}
        <TouchableOpacity
          style={styles.toggleWrap}
          onPress={() => setIsSignUp(!isSignUp)}
        >
          <Text style={styles.toggleText}>
            {isSignUp
              ? 'Already have an account? Sign In'
              : "Don't have an account? Create One"}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  logoWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 20,
  },
  fieldWrap: {
    marginBottom: 14,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: '#0F172A',
  },
  primaryBtn: {
    backgroundColor: '#4F46E5',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 10,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  toggleWrap: {
    marginTop: 18,
    alignItems: 'center',
  },
  toggleText: {
    fontSize: 13,
    color: '#4F46E5',
    fontWeight: '600',
  },
});
