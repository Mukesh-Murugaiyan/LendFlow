import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { queryClient } from '@/services/queryClient';
import { useAuthStore } from '@/store/useAuthStore';
import { networkService } from '@/services/network';

export default function RootLayout() {
  const { initializeAuth } = useAuthStore();

  useEffect(() => {
    networkService.init();
    initializeAuth();
  }, [initializeAuth]);

  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#FFFFFF' },
          headerTintColor: '#0F172A',
          headerTitleStyle: { fontWeight: '700' },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: '#F8FAFC' },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="create-loan"
          options={{
            presentation: 'modal',
            title: 'Create Loan',
            headerBackTitle: 'Cancel',
          }}
        />
        <Stack.Screen
          name="create-borrower"
          options={{
            presentation: 'modal',
            title: 'New Borrower',
            headerBackTitle: 'Cancel',
          }}
        />
        <Stack.Screen
          name="loan/[id]"
          options={{
            title: 'Loan Details',
            headerBackTitle: 'Back',
          }}
        />
        <Stack.Screen
          name="borrower/[id]"
          options={{
            title: 'Borrower Profile',
            headerBackTitle: 'Back',
          }}
        />
        <Stack.Screen
          name="reports"
          options={{
            title: 'Financial Reports',
            headerBackTitle: 'Back',
          }}
        />
        <Stack.Screen
          name="audit-logs"
          options={{
            title: 'Audit Trail',
            headerBackTitle: 'Back',
          }}
        />
        <Stack.Screen
          name="auth"
          options={{
            presentation: 'modal',
            title: 'Sign In',
          }}
        />
      </Stack>
    </QueryClientProvider>
  );
}
