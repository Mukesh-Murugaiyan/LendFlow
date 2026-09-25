import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface BadgeProps {
  status: 'ACTIVE' | 'CLOSED' | 'FULLY_PAID' | 'PAID' | 'UNPAID' | 'OVERDUE' | 'CANCELLED' | string;
  label?: string;
  size?: 'sm' | 'md';
}

export function Badge({ status, label, size = 'sm' }: BadgeProps) {
  const isSm = size === 'sm';
  const displayLabel = label || status.replace('_', ' ');

  let bg = '#F1F5F9';
  let text = '#475569';

  switch (status) {
    case 'ACTIVE':
    case 'PAID':
      bg = '#DCFCE7';
      text = '#15803D';
      break;
    case 'UNPAID':
      bg = '#FEF3C7';
      text = '#B45309';
      break;
    case 'OVERDUE':
      bg = '#FEE2E2';
      text = '#B91C1C';
      break;
    case 'CLOSED':
    case 'FULLY_PAID':
      bg = '#E2E8F0';
      text = '#334155';
      break;
    default:
      bg = '#EEF2FF';
      text = '#4338CA';
      break;
  }

  return (
    <View style={[styles.badge, { backgroundColor: bg, paddingVertical: isSm ? 3 : 5, paddingHorizontal: isSm ? 8 : 12 }]}>
      <Text style={[styles.text, { color: text, fontSize: isSm ? 11 : 13 }]}>{displayLabel}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: 999,
    alignSelf: 'flex-start',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
