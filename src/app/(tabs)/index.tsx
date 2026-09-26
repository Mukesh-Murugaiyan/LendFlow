import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Badge } from '@/components/Badge';
import { FloatingActionButton } from '@/components/FloatingActionButton';
import { Header } from '@/components/Header';
import { StatCard } from '@/components/StatCard';
import { lendflowApi } from '@/services/api/lendflowApi';
import { useAppStore } from '@/store/useAppStore';
import { formatDisplayDate, toISODateString } from '@/utils/date';
import { formatCurrency } from '@/utils/financial';
import { getFriendlyErrorMessage } from '@/utils/error';

export default function DashboardScreen() {
  const { currentOrgId, setLastSyncedAt, isOnline } = useAppStore();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'today' | 'overdue' | 'upcoming' | 'recent_loans'>('today');

  // Queries
  const {
    data: summary,
    isLoading: isSummaryLoading,
    refetch: refetchSummary,
  } = useQuery({
    queryKey: ['dashboard_summary', currentOrgId],
    queryFn: async () => {
      const data = await lendflowApi.getDashboardSummary(currentOrgId);
      setLastSyncedAt(new Date().toLocaleTimeString());
      return data;
    },
  });

  const { data: allDues = [], refetch: refetchDues } = useQuery({
    queryKey: ['all_dues', currentOrgId],
    queryFn: () => lendflowApi.getInterestDues(currentOrgId),
  });

  const { data: allLoans = [], refetch: refetchLoans } = useQuery({
    queryKey: ['all_loans', currentOrgId],
    queryFn: () => lendflowApi.getLoans(currentOrgId),
  });

  // Manual trigger of interest generation (calls PostgreSQL function)
  const generateMutation = useMutation({
    mutationFn: (date?: string) => lendflowApi.triggerInterestGeneration(date),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['dashboard_summary'] });
      queryClient.invalidateQueries({ queryKey: ['all_dues'] });
      queryClient.invalidateQueries({ queryKey: ['all_loans'] });
      Alert.alert(
        'Interest Generation Complete',
        `Database checked active loans.\nRecords generated: ${res.generatedCount ?? res.records_generated ?? 0}`
      );
    },
    onError: (err: any) => {
      Alert.alert('Error', getFriendlyErrorMessage(err, 'Failed to trigger interest generation.'));
    },
  });

  const onRefresh = async () => {
    await Promise.all([refetchSummary(), refetchDues(), refetchLoans()]);
  };

  // Filter dues for tabs
  const today = toISODateString();
  const todayDues = allDues.filter((d) => d.status === 'UNPAID' && d.due_date === today);
  const overdueDues = allDues.filter((d) => d.status === 'UNPAID' && d.due_date < today);
  const upcomingDues = allDues.filter((d) => d.status === 'UNPAID' && d.due_date > today);
  const recentLoans = allLoans.slice(0, 5);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <Header
        title="LendFlow"
        subtitle="Private Lending & Interest Management"
        rightAction={
          isOnline
            ? {
                icon: 'flash-outline',
                onPress: () => {
                  Alert.alert(
                    'Database Scheduler',
                    'Create Pending Interest Record',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Run Now',
                        onPress: () => generateMutation.mutate(today),
                      },
                    ]
                  );
                },
              }
            : undefined
        }
      />

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={isSummaryLoading} onRefresh={onRefresh} />}
      >

        {/* Primary Financial Metric Cards */}
        <Text style={styles.sectionHeader}>Overview Metrics</Text>
        <View style={styles.statsGrid}>
          <StatCard
            title="Principal Outstanding"
            value={formatCurrency(summary?.total_principal_active ?? 0)}
            icon="cash-outline"
            theme="indigo"
            subtitle={`${summary?.total_active_loans ?? 0} active loans`}
          />
          <StatCard
            title="Interest Due Today"
            value={formatCurrency(summary?.interest_due_today ?? 0)}
            icon="today-outline"
            theme="amber"
            subtitle="Needs collection today"
          />
        </View>

        <View style={styles.statsGrid}>
          <StatCard
            title="Overdue Interest"
            value={formatCurrency(summary?.overdue_interest ?? 0)}
            icon="alert-circle-outline"
            theme="rose"
            subtitle="Pending past due dates"
          />
          <StatCard
            title="Interest Collected"
            value={formatCurrency(summary?.total_interest_collected ?? 0)}
            icon="checkmark-done-circle-outline"
            theme="emerald"
            subtitle={`of ${formatCurrency(summary?.total_interest_generated ?? 0)} total`}
          />
        </View>

        <View style={styles.statsGrid}>
          <StatCard
            title="Total Principal Given"
            value={formatCurrency(summary?.total_principal_given ?? 0)}
            icon="trending-up-outline"
            theme="slate"
            subtitle={`${summary?.total_closed_loans ?? 0} fully closed`}
          />
          <StatCard
            title="Active Borrowers"
            value={String(summary?.active_borrowers ?? 0)}
            icon="people-outline"
            theme="indigo"
            subtitle="Distinct borrowers"
          />
        </View>

        {/* Section Lists with Interactive Tabs */}
        <View style={styles.listSection}>
          <Text style={styles.sectionHeader}>Interest & Loan Activity</Text>
          <View style={styles.tabBar}>
            <TouchableOpacity
              style={[styles.tabButton, activeTab === 'today' && styles.tabButtonActive]}
              onPress={() => setActiveTab('today')}
            >
              <Text style={[styles.tabText, activeTab === 'today' && styles.tabTextActive]}>
                Today ({todayDues.length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabButton, activeTab === 'overdue' && styles.tabButtonActive]}
              onPress={() => setActiveTab('overdue')}
            >
              <Text style={[styles.tabText, activeTab === 'overdue' && styles.tabTextActive]}>
                Overdue ({overdueDues.length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabButton, activeTab === 'upcoming' && styles.tabButtonActive]}
              onPress={() => setActiveTab('upcoming')}
            >
              <Text style={[styles.tabText, activeTab === 'upcoming' && styles.tabTextActive]}>
                Upcoming ({upcomingDues.length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabButton, activeTab === 'recent_loans' && styles.tabButtonActive]}
              onPress={() => setActiveTab('recent_loans')}
            >
              <Text style={[styles.tabText, activeTab === 'recent_loans' && styles.tabTextActive]}>
                Loans ({recentLoans.length})
              </Text>
            </TouchableOpacity>
          </View>

          {/* Tab Content */}
          {activeTab === 'today' && (
            <View style={styles.itemsList}>
              {todayDues.length === 0 ? (
                <Text style={styles.emptyNotice}>No interest dues scheduled for today.</Text>
              ) : (
                todayDues.map((due) => (
                  <TouchableOpacity
                    key={due.id}
                    style={styles.dueCard}
                    onPress={() => router.push(`/loan/${due.loan_id}`)}
                  >
                    <View style={styles.dueLeft}>
                      <Text style={styles.borrowerName}>{due.borrower?.full_name || 'Borrower'}</Text>
                      <Text style={styles.dueSub}>Due Date: {formatDisplayDate(due.due_date)}</Text>
                    </View>
                    <View style={styles.dueRight}>
                      <Text style={styles.dueAmount}>{formatCurrency(due.interest_amount)}</Text>
                      <Badge status="UNPAID" label="DUE TODAY" />
                    </View>
                  </TouchableOpacity>
                ))
              )}
            </View>
          )}

          {activeTab === 'overdue' && (
            <View style={styles.itemsList}>
              {overdueDues.length === 0 ? (
                <Text style={styles.emptyNotice}>Zero overdue interest records. Great job!</Text>
              ) : (
                overdueDues.map((due) => (
                  <TouchableOpacity
                    key={due.id}
                    style={styles.dueCard}
                    onPress={() => router.push(`/loan/${due.loan_id}`)}
                  >
                    <View style={styles.dueLeft}>
                      <Text style={styles.borrowerName}>{due.borrower?.full_name || 'Borrower'}</Text>
                      <Text style={[styles.dueSub, { color: '#EF4444' }]}>
                        Overdue since {formatDisplayDate(due.due_date)}
                      </Text>
                    </View>
                    <View style={styles.dueRight}>
                      <Text style={styles.dueAmount}>{formatCurrency(due.interest_amount)}</Text>
                      <Badge status="OVERDUE" />
                    </View>
                  </TouchableOpacity>
                ))
              )}
            </View>
          )}

          {activeTab === 'upcoming' && (
            <View style={styles.itemsList}>
              {upcomingDues.length === 0 ? (
                <Text style={styles.emptyNotice}>No upcoming dues found.</Text>
              ) : (
                upcomingDues.map((due) => (
                  <TouchableOpacity
                    key={due.id}
                    style={styles.dueCard}
                    onPress={() => router.push(`/loan/${due.loan_id}`)}
                  >
                    <View style={styles.dueLeft}>
                      <Text style={styles.borrowerName}>{due.borrower?.full_name || 'Borrower'}</Text>
                      <Text style={styles.dueSub}>Due on {formatDisplayDate(due.due_date)}</Text>
                    </View>
                    <View style={styles.dueRight}>
                      <Text style={styles.dueAmount}>{formatCurrency(due.interest_amount)}</Text>
                      <Badge status="UNPAID" />
                    </View>
                  </TouchableOpacity>
                ))
              )}
            </View>
          )}

          {activeTab === 'recent_loans' && (
            <View style={styles.itemsList}>
              {recentLoans.map((loan) => (
                <TouchableOpacity
                  key={loan.id}
                  style={styles.dueCard}
                  onPress={() => router.push(`/loan/${loan.id}`)}
                >
                  <View style={styles.dueLeft}>
                    <Text style={styles.borrowerName}>{loan.borrower?.full_name || 'Borrower'}</Text>
                    <Text style={styles.dueSub}>
                      Principal: {formatCurrency(loan.principal_amount)} @ {loan.interest_rate}%
                    </Text>
                  </View>
                  <View style={styles.dueRight}>
                    <Badge status={loan.loan_status} />
                    <Text style={styles.loanNextDue}>Next: {formatDisplayDate(loan.next_interest_due_date)}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      <FloatingActionButton />
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
  scrollContent: {
    padding: 16,
    paddingBottom: 90,
  },
  schedulerBanner: {
    backgroundColor: '#EEF2FF',
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E0E7FF',
    gap: 12,
  },
  bannerIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerTextWrap: {
    flex: 1,
  },
  bannerTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4338CA',
  },
  bannerDesc: {
    fontSize: 11,
    color: '#475569',
    marginTop: 2,
    lineHeight: 15,
  },
  sectionHeader: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 12,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  listSection: {
    marginTop: 12,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
    borderRadius: 10,
    padding: 3,
    marginBottom: 14,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabButtonActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  tabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  tabTextActive: {
    color: '#4F46E5',
    fontWeight: '700',
  },
  itemsList: {
    gap: 10,
  },
  dueCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  dueLeft: {
    flex: 1,
  },
  borrowerName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  dueSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 3,
  },
  dueRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  dueAmount: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  loanNextDue: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
  },
  emptyNotice: {
    textAlign: 'center',
    color: '#94A3B8',
    paddingVertical: 24,
    fontSize: 13,
  },
});
