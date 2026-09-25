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
import { EmptyState } from '@/components/EmptyState';
import { lendflowApi } from '@/services/api/lendflowApi';
import { useAppStore } from '@/store/useAppStore';
import { formatCurrency } from '@/utils/financial';
import { formatDisplayDate, isOverdue } from '@/utils/date';
import { InterestDue } from '@/types/database';

export default function DuesScreen() {
  const { currentOrgId } = useAppStore();
  const queryClient = useQueryClient();
  const [activeFilter, setActiveFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const filterOptions = [
    { key: 'ALL', label: 'All Dues' },
    { key: 'UNPAID', label: 'Unpaid' },
    { key: 'PAID', label: 'Paid' },
  ];

  const {
    data: dues = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['interest_dues', currentOrgId, activeFilter],
    queryFn: () => lendflowApi.getInterestDues(currentOrgId, activeFilter),
  });

  // Mark as Paid Mutation
  const markPaidMutation = useMutation({
    mutationFn: (dueId: string) => lendflowApi.markInterestPaid(dueId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['interest_dues'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard_summary'] });
      queryClient.invalidateQueries({ queryKey: ['loan_details'] });
    },
    onError: (err: any) => {
      Alert.alert('Payment Error', err.message || 'Failed to mark interest as paid');
    },
  });

  // Reverse Payment Mutation
  const reverseMutation = useMutation({
    mutationFn: (dueId: string) => lendflowApi.reverseInterestPayment(dueId, 'Reversed via due list'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['interest_dues'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard_summary'] });
      queryClient.invalidateQueries({ queryKey: ['loan_details'] });
    },
    onError: (err: any) => {
      Alert.alert('Reversal Error', err.message || 'Failed to reverse payment');
    },
  });

  const handleMarkPaid = (due: InterestDue) => {
    Alert.alert(
      'Confirm Payment Collection',
      `Mark interest of ${formatCurrency(due.interest_amount)} for ${due.borrower?.full_name || 'Borrower'} as PAID?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm Paid',
          style: 'default',
          onPress: () => markPaidMutation.mutate(due.id),
        },
      ]
    );
  };

  const handleReverse = (due: InterestDue) => {
    Alert.alert(
      'Reverse Payment',
      `Are you sure you want to reverse the payment for ${formatDisplayDate(due.due_date)}? Record will return to UNPAID.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reverse to Unpaid',
          style: 'destructive',
          onPress: () => reverseMutation.mutate(due.id),
        },
      ]
    );
  };

  const deleteDueMutation = useMutation({
    mutationFn: (dueId: string) => lendflowApi.deleteInterestDue(dueId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['interest_dues'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard_summary'] });
      queryClient.invalidateQueries({ queryKey: ['all_dues'] });
      queryClient.invalidateQueries({ queryKey: ['loan_details'] });
      Alert.alert('Due Deleted', 'Interest due record has been removed.');
    },
    onError: (err: any) => {
      Alert.alert('Delete Failed', err.message || 'Could not delete due.');
    },
  });

  const handleDeleteDue = (due: InterestDue) => {
    Alert.alert(
      'Delete Interest Record',
      `Are you sure you want to delete due #${due.due_number} (${formatCurrency(due.interest_amount)}) for ${due.borrower?.full_name || 'Borrower'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteDueMutation.mutate(due.id),
        },
      ]
    );
  };

  // Filter by search query if typed
  const filteredDues = dues.filter((d) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      d.borrower?.full_name.toLowerCase().includes(q) ||
      d.borrower?.mobile_number.includes(q) ||
      d.due_date.includes(q)
    );
  });

  const renderDueItem = ({ item }: { item: InterestDue }) => {
    const overdue = item.status === 'UNPAID' && isOverdue(item.due_date);

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <TouchableOpacity
            style={styles.headerLeft}
            onPress={() => router.push(`/loan/${item.loan_id}`)}
            activeOpacity={0.7}
          >
            <Text style={styles.borrowerName}>{item.borrower?.full_name || 'Borrower'}</Text>
            <Text style={styles.periodText}>Period #{item.due_number}</Text>
          </TouchableOpacity>
          <View style={styles.headerRight}>
            <Badge status={overdue ? 'OVERDUE' : item.status} />
            <TouchableOpacity
              style={styles.deleteDueBtn}
              onPress={() => handleDeleteDue(item)}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="trash-outline" size={15} color="#EF4444" />
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity
          onPress={() => router.push(`/loan/${item.loan_id}`)}
          activeOpacity={0.7}
        >
          <View style={styles.midRow}>
            <View>
              <Text style={styles.dateLabel}>Due Date</Text>
              <Text style={[styles.dateText, overdue && styles.overdueDate]}>
                {formatDisplayDate(item.due_date)}
              </Text>
            </View>

            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.amountLabel}>Interest Due</Text>
              <Text style={styles.amountText}>{formatCurrency(item.interest_amount)}</Text>
            </View>
          </View>
        </TouchableOpacity>

        {item.payment_note ? (
          <Text style={styles.noteText}>Note: {item.payment_note}</Text>
        ) : null}

        {item.paid_at && item.status === 'PAID' ? (
          <Text style={styles.paidAtText}>
            Paid on {formatDisplayDate(item.paid_at)} ({formatCurrency(item.paid_amount ?? item.interest_amount)})
          </Text>
        ) : null}

        <View style={styles.cardActions}>
          {item.status === 'UNPAID' ? (
            <TouchableOpacity
              style={styles.payButton}
              onPress={() => handleMarkPaid(item)}
              activeOpacity={0.8}
            >
              <Text style={styles.payButtonText}>Mark as Paid</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.reverseButton}
              onPress={() => handleReverse(item)}
              activeOpacity={0.8}
            >
              <Text style={styles.reverseButtonText}>Reverse Payment</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.viewLoanBtn}
            onPress={() => router.push(`/loan/${item.loan_id}`)}
          >
            <Text style={styles.viewLoanText}>View Loan Details</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <Header title="Interest Dues" subtitle="Track Collections & Payments" />

      <SearchFilterBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        placeholder="Filter borrower or due date..."
        filterOptions={filterOptions}
        activeFilter={activeFilter}
        onFilterSelect={setActiveFilter}
      />

      <FlatList
        data={filteredDues}
        keyExtractor={(item) => item.id}
        renderItem={renderDueItem}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} />}
        ListEmptyComponent={
          !isLoading ? (
            <EmptyState
              icon="calendar-outline"
              title="No Due Records"
              description="No interest due records match this filter."
            />
          ) : null
        }
      />
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
    paddingBottom: 40,
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
    marginBottom: 12,
  },
  headerLeft: {
    flex: 1,
    paddingRight: 8,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  borrowerName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  periodText: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 1,
  },
  midRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    padding: 12,
    borderRadius: 10,
    marginBottom: 10,
  },
  dateLabel: {
    fontSize: 10,
    color: '#94A3B8',
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  dateText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 2,
  },
  overdueDate: {
    color: '#EF4444',
  },
  amountLabel: {
    fontSize: 10,
    color: '#94A3B8',
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  amountText: {
    fontSize: 17,
    fontWeight: '800',
    color: '#4F46E5',
    marginTop: 2,
  },
  noteText: {
    fontSize: 12,
    color: '#64748B',
    fontStyle: 'italic',
    marginBottom: 6,
  },
  paidAtText: {
    fontSize: 11,
    color: '#10B981',
    fontWeight: '600',
    marginBottom: 8,
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 6,
  },
  payButton: {
    flex: 1,
    backgroundColor: '#10B981',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  payButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  reverseButton: {
    flex: 1,
    backgroundColor: '#FEE2E2',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  reverseButtonText: {
    color: '#B91C1C',
    fontWeight: '700',
    fontSize: 13,
  },
  viewLoanBtn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  viewLoanText: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '600',
  },
  deleteDueBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
