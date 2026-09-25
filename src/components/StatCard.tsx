import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface StatCardProps {
  title: string;
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
  subtitle?: string;
  theme?: 'indigo' | 'emerald' | 'amber' | 'rose' | 'slate';
}

export function StatCard({ title, value, icon, subtitle, theme = 'indigo' }: StatCardProps) {
  const themeStyles = {
    indigo: { bg: '#EEF2FF', iconColor: '#4F46E5', border: '#E0E7FF' },
    emerald: { bg: '#ECFDF5', iconColor: '#10B981', border: '#D1FAE5' },
    amber: { bg: '#FFFBEB', iconColor: '#F59E0B', border: '#FEF3C7' },
    rose: { bg: '#FEF2F2', iconColor: '#EF4444', border: '#FEE2E2' },
    slate: { bg: '#F8FAFC', iconColor: '#64748B', border: '#E2E8F0' },
  }[theme];

  return (
    <View style={[styles.card, { borderColor: themeStyles.border }]}>
      <View style={styles.topRow}>
        <Text style={styles.title}>{title}</Text>
        <View style={[styles.iconWrap, { backgroundColor: themeStyles.bg }]}>
          <Ionicons name={icon} size={18} color={themeStyles.iconColor} />
        </View>
      </View>
      <Text style={styles.value} numberOfLines={1}>
        {value}
      </Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    flex: 1,
    minWidth: 150,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  title: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    flex: 1,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 4,
    fontWeight: '500',
  },
});
