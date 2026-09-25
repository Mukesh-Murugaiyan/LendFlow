import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Header } from '@/components/Header';
import { SearchFilterBar } from '@/components/SearchFilterBar';
import { Badge } from '@/components/Badge';
import { FloatingActionButton } from '@/components/FloatingActionButton';
import { EmptyState } from '@/components/EmptyState';
import { lendflowApi } from '@/services/api/lendflowApi';
import { useAppStore } from '@/store/useAppStore';
import { formatCurrency, calculateInterestAmount } from '@/utils/financial';
import { formatDisplayDate } from '@/utils/date';
import { Loan } from '@/types/database';

export default function LoansScreen() {
  const { currentOrgId } = useAppStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('ALL');

  const filterOptions = [
    { key: 'ALL', label: 'All Loans' },
    { key: 'ACTIVE', label: 'Active' },
    { key: 'CLOSED', label: 'Closed' },
    { key: 'FULLY_PAID', label: 'Fully Paid' },
    { key: 'DUE_TODAY', label: 'Due Today' },
  ];

  const {
    data: loans = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['loans_list', currentOrgId, searchQuery, activeFilter],
    queryFn: () => lendflowApi.getLoans(currentOrgId, searchQuery, activeFilter),
  });

  const queryClient = useQueryClient();

  const deleteLoanMutation = useMutation({
    mutationFn: (loanId: string) => lendflowApi.deleteLoan(loanId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loans_list'] });
      queryClient.invalidateQueries({ queryKey: ['all_loans'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard_summary'] });
      queryClient.invalidateQueries({ queryKey: ['all_dues'] });
      queryClient.invalidateQueries({ queryKey: ['interest_dues'] });
      Alert.alert('Loan Deleted', 'The loan record and its interest schedule have been removed.');
    },
    onError: (err: any) => {
      Alert.alert('Delete Failed', err.message || 'Could not delete loan.');
    },
  });

  const handleDeleteLoan = (loanId: string, borrowerName?: string) => {
    Alert.alert(
      'Delete Loan',
      `Are you sure you want to delete this loan${borrowerName ? ` for ${borrowerName}` : ''}? All its scheduled interest records will also be deleted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteLoanMutation.mutate(loanId),
        },
      ]
    );
  };

  const renderLoanItem = ({ item }: { item: Loan }) => {
    const interestPerPeriod = calculateInterestAmount(item.principal_amount, item.interest_rate);

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => router.push(`/loan/${item.id}`)}
        activeOpacity={0.8}
      >
        <View style={styles.cardHeader}>
          <View style={styles.nameBlock}>
            <Text style={styles.borrowerName}>{item.borrower?.full_name || 'Borrower'}</Text>
            <Text style={styles.mobileText}>
              {item.borrower?.mobile_number || '-'}
              {item.borrower?.government_id_masked ? ` • ID: ${item.borrower.government_id_masked}` : ''}
            </Text>
          </View>
          <View style={styles.headerRight}>
            <Badge status={item.loan_status} />
            <TouchableOpacity
              style={styles.deleteBtn}
              onPress={() => handleDeleteLoan(item.id, item.borrower?.full_name)}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="trash-outline" size={14} color="#EF4444" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.statsRow}>
          <View style={styles.statCol}>
            <Text style={styles.statLabel}>Principal</Text>
            <Text style={styles.statValue}>{formatCurrency(item.principal_amount)}</Text>
          </View>
          <View style={styles.statCol}>
            <Text style={styles.statLabel}>Rate / Frequency</Text>
            <Text style={styles.statValue}>
              {item.interest_rate}% ({item.interest_interval_days}d)
            </Text>
          </View>
          <View style={styles.statCol}>
            <Text style={styles.statLabel}>Period Interest</Text>
            <Text style={[styles.statValue, { color: '#4F46E5' }]}>
              {formatCurrency(interestPerPeriod)}
            </Text>
          </View>
        </View>

        <View style={styles.footerRow}>
          <View style={styles.dateBlock}>
            <Text style={styles.dateLabel}>Next Due Date</Text>
            <Text style={styles.dateValue}>{formatDisplayDate(item.next_interest_due_date)}</Text>
          </View>
          <View style={styles.detailsAction}>
            <Text style={styles.viewDetailsText}>View History →</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <Header
        title="Loans"
        subtitle="Manage Lending Portfolios"
        rightAction={{
          icon: 'add-circle-outline',
          onPress: () => router.push('/create-loan'),
        }}
      />

      <SearchFilterBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        placeholder="Search name, phone, city, loan ID..."
        filterOptions={filterOptions}
        activeFilter={activeFilter}
        onFilterSelect={setActiveFilter}
      />

      <FlatList
        data={loans}
        keyExtractor={(item) => item.id}
        renderItem={renderLoanItem}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} />}
        ListEmptyComponent={
          !isLoading ? (
            <EmptyState
              icon="wallet-outline"
              title="No Loans Found"
              description="No loans matched your filter or search query. Create a new loan to start tracking interest."
              actionLabel="+ Create First Loan"
              onAction={() => router.push('/create-loan')}
            />
          ) : null
        }
      />

      <FloatingActionButton />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  listContent: {
    padding: 16,
    paddingBottom: 90,
    gap: 12,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  deleteBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameBlock: {
    flex: 1,
  },
  borrowerName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  mobileText: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 12,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  statCol: {
    flex: 1,
  },
  statLabel: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '500',
    textTransform: 'uppercase',
  },
  statValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 2,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    padding: 10,
    borderRadius: 10,
  },
  dateBlock: {
    flex: 1,
  },
  dateLabel: {
    fontSize: 10,
    color: '#94A3B8',
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  dateValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4338CA',
    marginTop: 1,
  },
  detailsAction: {
    alignItems: 'flex-end',
  },
  viewDetailsText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4F46E5',
  },
});
