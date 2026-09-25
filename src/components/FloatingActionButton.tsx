import React from 'react';
import { StyleSheet, TouchableOpacity, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

interface FABProps {
  label?: string;
  onPress?: () => void;
}

export function FloatingActionButton({ label = 'New Loan', onPress }: FABProps) {
  const handlePress = () => {
    if (onPress) {
      onPress();
    } else {
      router.push('/create-loan');
    }
  };

  return (
    <TouchableOpacity style={styles.fab} onPress={handlePress} activeOpacity={0.85}>
      <Ionicons name="add" size={24} color="#FFFFFF" />
      <Text style={styles.label}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    backgroundColor: '#4F46E5',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 30,
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
    gap: 8,
    zIndex: 100,
  },
  label: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
    letterSpacing: 0.3,
  },
});
