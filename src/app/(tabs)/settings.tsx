import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Header } from '@/components/Header';
import { lendflowApi } from '@/services/api/lendflowApi';
import { useAuthStore } from '@/store/useAuthStore';
import { toISODateString } from '@/utils/date';

export default function SettingsScreen() {
  const { profile, signOut } = useAuthStore();
  const queryClient = useQueryClient();

  const generateMutation = useMutation({
    mutationFn: (targetDate: string) => lendflowApi.triggerInterestGeneration(targetDate),
    onSuccess: (res) => {
      queryClient.invalidateQueries();
      Alert.alert(
        'Interest Generation Completed',
        `Generated Records: ${res.generatedCount ?? res.records_generated ?? 0}`
      );
    },
    onError: (err: any) => {
      Alert.alert('Scheduler Error', err.message || 'Failed to trigger interest generation');
    },
  });



  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await signOut();
          router.replace('/auth');
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <Header title="Settings" subtitle="System & Business Preferences" />

      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* User / Business Card */}
        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{profile?.full_name?.charAt(0) || 'L'}</Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>{profile?.full_name || 'LendFlow Lender'}</Text>
            <Text style={styles.profileEmail}>{profile?.email || ''}</Text>
          </View>
        </View>

        {/* Business Config Section */}
        <Text style={styles.sectionTitle}>Business & Regional Settings</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.rowIcon}>
              <Ionicons name="cash-outline" size={20} color="#4F46E5" />
            </View>
            <View style={styles.rowContent}>
              <Text style={styles.rowLabel}>Default Currency</Text>
              <Text style={styles.rowSub}>Indian Rupee (INR - ₹)</Text>
            </View>
          </View>

          <View style={styles.rowDivider} />

          <View style={styles.row}>
            <View style={styles.rowIcon}>
              <Ionicons name="globe-outline" size={20} color="#4F46E5" />
            </View>
            <View style={styles.rowContent}>
              <Text style={styles.rowLabel}>Timezone</Text>
              <Text style={styles.rowSub}>Asia/Kolkata (IST +5:30)</Text>
            </View>
          </View>
        </View>

        {/* Financial Tools & Automation */}
        <Text style={styles.sectionTitle}>Database Automation & Scheduler</Text>
        <View style={styles.card}>
          <TouchableOpacity
            style={styles.row}
            onPress={() => generateMutation.mutate(toISODateString())}
            activeOpacity={0.7}
          >
            <View style={styles.rowIcon}>
              <Ionicons name="play-circle-outline" size={20} color="#4F46E5" />
            </View>
            <View style={styles.rowContent}>
              <Text style={styles.rowLabel}>Run Due Generation (Today)</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
          </TouchableOpacity>
        </View>

        {/* Reports & Audit Section */}
        <Text style={styles.sectionTitle}>Reports & Financial Integrity</Text>
        <View style={styles.card}>
          <TouchableOpacity
            style={styles.row}
            onPress={() => router.push('/reports')}
            activeOpacity={0.7}
          >
            <View style={styles.rowIcon}>
              <Ionicons name="stats-chart-outline" size={20} color="#10B981" />
            </View>
            <View style={styles.rowContent}>
              <Text style={styles.rowLabel}>Financial Reports & Analytics</Text>
              <Text style={styles.rowSub}>Collections, date ranges, and portfolio breakdown</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
          </TouchableOpacity>

          <View style={styles.rowDivider} />

          <TouchableOpacity
            style={styles.row}
            onPress={() => router.push('/audit-logs')}
            activeOpacity={0.7}
          >
            <View style={styles.rowIcon}>
              <Ionicons name="shield-checkmark-outline" size={20} color="#6366F1" />
            </View>
            <View style={styles.rowContent}>
              <Text style={styles.rowLabel}>Audit Trail</Text>
              <Text style={styles.rowSub}>Financial operations and tamper-proof logs</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
          </TouchableOpacity>
        </View>

        {/* Account Actions */}
        <TouchableOpacity
          style={styles.signOutBtn}
          onPress={handleSignOut}
          activeOpacity={0.8}
        >
          <Ionicons name="log-out-outline" size={18} color="#EF4444" />
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  profileCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 24,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#4F46E5',
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  profileEmail: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
  },
  orgBadge: {
    fontSize: 11,
    color: '#4F46E5',
    fontWeight: '600',
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 20,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowContent: {
    flex: 1,
  },
  rowLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
  },
  rowSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  rowDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginLeft: 62,
  },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FEE2E2',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
    marginTop: 10,
  },
  signOutText: {
    color: '#EF4444',
    fontSize: 14,
    fontWeight: '700',
  },
});
