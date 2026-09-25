import '@/global.css';
import { Platform } from 'react-native';

export const Colors = {
  light: {
    primary: '#4F46E5',
    primaryLight: '#EEF2FF',
    accent: '#06B6D4',
    text: '#0F172A',
    textSecondary: '#64748B',
    textMuted: '#94A3B8',
    background: '#F8FAFC',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#E2E8F0',
    border: '#E2E8F0',
    card: '#FFFFFF',
    cardBorder: '#E2E8F0',
    
    // Financial Status Colors
    paid: '#10B981',
    paidLight: '#ECFDF5',
    unpaid: '#F59E0B',
    unpaidLight: '#FFFBEB',
    overdue: '#EF4444',
    overdueLight: '#FEF2F2',
    closed: '#64748B',
    closedLight: '#F1F5F9',
  },
  dark: {
    primary: '#6366F1',
    primaryLight: '#312E81',
    accent: '#22D3EE',
    text: '#F8FAFC',
    textSecondary: '#94A3B8',
    textMuted: '#64748B',
    background: '#0B0F19',
    backgroundElement: '#131B2E',
    backgroundSelected: '#1E293B',
    border: '#1E293B',
    card: '#131B2E',
    cardBorder: '#1E293B',

    // Financial Status Colors
    paid: '#10B981',
    paidLight: '#064E3B',
    unpaid: '#F59E0B',
    unpaidLight: '#78350F',
    overdue: '#F43F5E',
    overdueLight: '#881337',
    closed: '#94A3B8',
    closedLight: '#1E293B',
  },
} as const;

export type ThemeColors = typeof Colors.light;
export type ThemeColor = keyof typeof Colors.light;

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;

export const BorderRadius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 18,
  full: 9999,
};
