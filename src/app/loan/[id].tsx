import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { Badge } from '@/components/Badge';
import { lendflowApi } from '@/services/api/lendflowApi';
import { InterestDue } from '@/types/database';
import { formatDisplayDate, isOverdue } from '@/utils/date';
import { calculateInterestAmount, formatCurrency } from '@/utils/financial';

export default function LoanDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();

  const {
    data,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['loan_details', id],
    queryFn: () => lendflowApi.getLoanDetails(id as string),
    enabled: !!id,
  });

  const loan = data?.loan;
  const dues = data?.dues || [];

  // Mutations
  const markPaidMutation = useMutation({
    mutationFn: (dueId: string) => lendflowApi.markInterestPaid(dueId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loan_details', id] });
      queryClient.invalidateQueries({ queryKey: ['dashboard_summary'] });
      queryClient.invalidateQueries({ queryKey: ['interest_dues'] });
    },
    onError: (err: any) => {
      Alert.alert('Payment Error', err.message || 'Failed to mark interest as paid');
    },
  });

  const reversePaymentMutation = useMutation({
    mutationFn: (dueId: string) => lendflowApi.reverseInterestPayment(dueId, 'Manual reversal'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loan_details', id] });
      queryClient.invalidateQueries({ queryKey: ['dashboard_summary'] });
      queryClient.invalidateQueries({ queryKey: ['interest_dues'] });
    },
    onError: (err: any) => {
      Alert.alert('Reversal Error', err.message || 'Failed to reverse payment');
    },
  });

  const closeLoanMutation = useMutation({
    mutationFn: (note?: string) => lendflowApi.closeLoan(id as string, note),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loan_details', id] });
      queryClient.invalidateQueries({ queryKey: ['dashboard_summary'] });
      queryClient.invalidateQueries({ queryKey: ['loans_list'] });
      Alert.alert('Loan Closed', 'Principal marked as fully paid. Future interest generation is stopped.');
    },
    onError: (err: any) => {
      Alert.alert('Close Error', err.message || 'Failed to close loan');
    },
  });

  const reopenLoanMutation = useMutation({
    mutationFn: (note?: string) => lendflowApi.reopenLoan(id as string, note),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loan_details', id] });
      queryClient.invalidateQueries({ queryKey: ['dashboard_summary'] });
      queryClient.invalidateQueries({ queryKey: ['loans_list'] });
      Alert.alert('Loan Reopened', 'Loan is now ACTIVE. Scheduled interest generation will resume from next due date.');
    },
    onError: (err: any) => {
      Alert.alert('Reopen Error', err.message || 'Failed to reopen loan');
    },
  });

  const deleteLoanMutation = useMutation({
    mutationFn: () => lendflowApi.deleteLoan(id as string),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loans_list'] });
      queryClient.invalidateQueries({ queryKey: ['all_loans'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard_summary'] });
      queryClient.invalidateQueries({ queryKey: ['all_dues'] });
      queryClient.invalidateQueries({ queryKey: ['interest_dues'] });
      Alert.alert('Loan Deleted', 'This loan record and all its dues have been deleted.', [
        { text: 'OK', onPress: () => router.replace('/(tabs)/loans') },
      ]);
    },
    onError: (err: any) => {
      Alert.alert('Delete Failed', err.message || 'Failed to delete loan');
    },
  });

  const deleteDueMutation = useMutation({
    mutationFn: (dueId: string) => lendflowApi.deleteInterestDue(dueId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loan_details', id] });
      queryClient.invalidateQueries({ queryKey: ['dashboard_summary'] });
      queryClient.invalidateQueries({ queryKey: ['interest_dues'] });
      queryClient.invalidateQueries({ queryKey: ['all_dues'] });
      Alert.alert('Due Deleted', 'Interest due record has been removed.');
    },
    onError: (err: any) => {
      Alert.alert('Delete Failed', err.message || 'Failed to delete interest due');
    },
  });

  const handleDeleteLoan = () => {
    Alert.alert(
      'Delete Loan',
      `Are you sure you want to permanently delete this loan of ${formatCurrency(loan?.principal_amount)}? All its interest records will also be deleted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteLoanMutation.mutate(),
        },
      ]
    );
  };

  const handleDeleteDue = (dueId: string, dueNumber: number) => {
    Alert.alert(
      'Delete Interest Record',
      `Are you sure you want to delete due #${dueNumber}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteDueMutation.mutate(dueId),
        },
      ]
    );
  };

  if (isLoading || !loan) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.loadingText}>Loading loan record...</Text>
      </View>
    );
  }

  // Financial calculations
  const interestPerPeriod = calculateInterestAmount(loan.principal_amount, loan.interest_rate);
  const totalInterestGenerated = dues.reduce((sum, d) => sum + Number(d.interest_amount), 0);
  const totalInterestPaid = dues
    .filter((d) => d.status === 'PAID')
    .reduce((sum, d) => sum + Number(d.paid_amount ?? d.interest_amount), 0);
  const totalInterestUnpaid = dues
    .filter((d) => d.status === 'UNPAID')
    .reduce((sum, d) => sum + Number(d.interest_amount), 0);

  const isClosed = loan.loan_status === 'CLOSED' || loan.principal_status === 'FULLY_PAID';

  const handleCloseLoan = () => {
    Alert.alert(
      'Mark Principal Fully Paid?',
      `This will mark the principal of ${formatCurrency(loan.principal_amount)} as settled and close this loan. No future interest records will be generated.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Principal Fully Paid',
          style: 'destructive',
          onPress: () => closeLoanMutation.mutate('Settled in full'),
        },
      ]
    );
  };

  const handleReopenLoan = () => {
    Alert.alert(
      'Reopen Loan?',
      'This will reactivate this loan and resume future interest generation from the next scheduled due date.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reopen Loan',
          style: 'default',
          onPress: () => reopenLoanMutation.mutate('Lender reopened account'),
        },
      ]
    );
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Loan Details',
          headerRight: () => (
            <TouchableOpacity
              onPress={handleDeleteLoan}
              activeOpacity={0.7}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={styles.navDeleteBtn}
            >
              <Ionicons name="trash-outline" size={20} color="#EF4444" />
            </TouchableOpacity>
          ),
        }}
      />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} />}
      >
        {/* Borrower Card */}
        <View style={styles.card}>
          <View style={styles.borrowerHeader}>
            <View style={styles.borrowerLeft}>
              <Text style={styles.borrowerName}>{loan.borrower?.full_name}</Text>
              <Text style={styles.borrowerPhone}>{loan.borrower?.mobile_number}</Text>
              <View style={styles.borrowerGovtIdRow}>
                <Ionicons name="card-outline" size={13} color="#64748B" />
                <Text style={styles.borrowerGovtIdText}>
                  Govt ID: <Text style={styles.borrowerGovtIdVal}>{loan.borrower?.government_id_masked || 'Not Provided'}</Text>
                </Text>
              </View>
              {loan.borrower?.address ? (
                <Text style={styles.borrowerAddr}>
                  {loan.borrower.address}, {loan.borrower.city}
                </Text>
              ) : null}
            </View>
            <View style={styles.borrowerBadges}>
              <View style={styles.badgeRowWithDelete}>
                <Badge
                  status={loan.loan_status}
                  label={`Loan: ${loan.loan_status}`}
                />

              </View>
              <Badge
                status={loan.principal_status}
                label={`Principal: ${loan.principal_status === 'FULLY_PAID' ? 'Fully Paid' : 'Outstanding'}`}
              />
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoGrid}>
            <View style={styles.infoCol}>
              <Text style={styles.infoLabel}>Loan Start Date</Text>
              <Text style={styles.infoValue}>{formatDisplayDate(loan.loan_start_date)}</Text>
            </View>
            <View style={styles.infoCol}>
              <Text style={styles.infoLabel}>First Due Date</Text>
              <Text style={styles.infoValue}>{formatDisplayDate(loan.first_interest_due_date)}</Text>
            </View>
            <View style={styles.infoCol}>
              <Text style={styles.infoLabel}>Next Due Date</Text>
              <Text style={[styles.infoValue, { color: '#4F46E5' }]}>
                {formatDisplayDate(loan.next_interest_due_date)}
              </Text>
            </View>
          </View>
        </View>

        {/* Financial Summary Box */}
        <View style={styles.financialSummaryCard}>
          <Text style={styles.cardTitle}>Financial Summary</Text>

          <View style={styles.summaryGrid}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Principal Amount</Text>
              <Text style={styles.summaryValueBig}>{formatCurrency(loan.principal_amount)}</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Interest Rate</Text>
              <Text style={styles.summaryValueBig}>
                {loan.interest_rate}% / {loan.interest_interval_days}d
              </Text>
            </View>
          </View>

          <View style={styles.statPillsRow}>
            <View style={styles.statPill}>
              <Text style={styles.pillLabel}>Interest / Period</Text>
              <Text style={styles.pillValue}>{formatCurrency(interestPerPeriod)}</Text>
            </View>
            <View style={styles.statPill}>
              <Text style={styles.pillLabel}>Total Paid</Text>
              <Text style={[styles.pillValue, { color: '#10B981' }]}>
                {formatCurrency(totalInterestPaid)}
              </Text>
            </View>
            <View style={styles.statPill}>
              <Text style={styles.pillLabel}>Total Unpaid</Text>
              <Text style={[styles.pillValue, { color: '#F59E0B' }]}>
                {formatCurrency(totalInterestUnpaid)}
              </Text>
            </View>
            <View style={styles.statPill}>
              <Text style={styles.pillLabel}>Total Generated</Text>
              <Text style={styles.pillValue}>{formatCurrency(totalInterestGenerated)}</Text>
            </View>
          </View>

          {/* Principal Lifecycle Actions */}
          <View style={styles.principalActionRow}>
            {!isClosed ? (
              <TouchableOpacity
                style={styles.closeLoanButton}
                onPress={handleCloseLoan}
                activeOpacity={0.8}
              >
                <Ionicons name="checkmark-done" size={16} color="#FFFFFF" />
                <Text style={styles.closeLoanButtonText}>Mark Principal Fully Paid</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.reopenLoanButton}
                onPress={handleReopenLoan}
                activeOpacity={0.8}
              >
                <Ionicons name="refresh" size={16} color="#4F46E5" />
                <Text style={styles.reopenLoanButtonText}>Reopen Loan (Resume Generation)</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Interest History Section */}
        <View style={styles.historyHeaderRow}>
          <Text style={styles.historySectionTitle}>Interest History ({dues.length})</Text>
          <Text style={styles.historySubtitle}>Database Generated Records</Text>
        </View>

        {dues.length === 0 ? (
          <View style={styles.emptyHistory}>
            <Ionicons name="calendar-outline" size={32} color="#94A3B8" />
            <Text style={styles.emptyHistoryTitle}>No Interest Dues Generated Yet</Text>
            <Text style={styles.emptyHistoryDesc}>
              The scheduled database function will automatically generate due #{1} on{' '}
              {formatDisplayDate(loan.next_interest_due_date)}.
            </Text>
          </View>
        ) : (
          <View style={styles.duesList}>
            {dues.map((due: InterestDue) => {
              const overdue = due.status === 'UNPAID' && isOverdue(due.due_date);

              return (
                <View key={due.id} style={styles.dueItemCard}>
                  <View style={styles.dueItemHeader}>
                    <View style={styles.dueItemHeaderLeft}>
                      <Text style={styles.duePeriodTitle}>
                        Period #{due.due_number} • {formatDisplayDate(due.due_date)}
                      </Text>
                      <Text style={styles.duePeriodDates}>
                        From {formatDisplayDate(due.period_start_date)} to {formatDisplayDate(due.due_date)}
                      </Text>
                    </View>
                    <View style={styles.dueItemHeaderRight}>
                      <Badge status={overdue ? 'OVERDUE' : due.status} />
                      <TouchableOpacity
                        style={styles.deleteDueSmallBtn}
                        onPress={() => handleDeleteDue(due.id, due.due_number)}
                        activeOpacity={0.7}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons name="trash-outline" size={14} color="#EF4444" />
                      </TouchableOpacity>
                    </View>
                  </View>

                  <View style={styles.dueAmountRow}>
                    <Text style={styles.dueAmountText}>{formatCurrency(due.interest_amount)}</Text>
                    {due.status === 'PAID' && (
                      <Text style={styles.paidDateText}>
                        Paid on {formatDisplayDate(due.paid_at)}
                      </Text>
                    )}
                  </View>

                  {due.payment_note ? (
                    <Text style={styles.paymentNoteText}>{due.payment_note}</Text>
                  ) : null}

                  {/* Mark as Paid / Reverse Actions */}
                  <View style={styles.dueActionRow}>
                    {due.status === 'UNPAID' ? (
                      <TouchableOpacity
                        style={styles.markPaidBtn}
                        onPress={() => markPaidMutation.mutate(due.id)}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="checkmark-circle" size={16} color="#FFFFFF" />
                        <Text style={styles.markPaidBtnText}>Mark as Paid</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        style={styles.reverseBtn}
                        onPress={() => reversePaymentMutation.mutate(due.id)}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="arrow-undo" size={14} color="#EF4444" />
                        <Text style={styles.reverseBtnText}>Reverse Payment</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 14,
    color: '#64748B',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
  },
  borrowerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  borrowerLeft: {
    flex: 1,
  },
  borrowerName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  borrowerPhone: {
    fontSize: 13,
    color: '#4F46E5',
    fontWeight: '600',
    marginTop: 2,
  },
  borrowerGovtIdRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 3,
  },
  borrowerGovtIdText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  borrowerGovtIdVal: {
    fontWeight: '700',
    color: '#1E293B',
  },
  borrowerAddr: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 4,
  },
  borrowerBadges: {
    alignItems: 'flex-end',
    gap: 4,
  },
  divider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 14,
  },
  infoGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  infoCol: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 10,
    color: '#94A3B8',
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  infoValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 2,
  },
  financialSummaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 20,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  summaryGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
    backgroundColor: '#F8FAFC',
    padding: 12,
    borderRadius: 12,
  },
  summaryItem: {
    flex: 1,
  },
  summaryLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
  summaryValueBig: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 2,
  },
  statPillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  statPill: {
    flex: 1,
    minWidth: 140,
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  pillLabel: {
    fontSize: 10,
    color: '#94A3B8',
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  pillValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 2,
  },
  principalActionRow: {
    marginTop: 4,
  },
  closeLoanButton: {
    backgroundColor: '#0F172A',
    paddingVertical: 12,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  closeLoanButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  reopenLoanButton: {
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
    paddingVertical: 12,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  reopenLoanButtonText: {
    color: '#4F46E5',
    fontWeight: '700',
    fontSize: 14,
  },
  historyHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  historySectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  historySubtitle: {
    fontSize: 12,
    color: '#94A3B8',
  },
  emptyHistory: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyHistoryTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 10,
  },
  emptyHistoryDesc: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 18,
    maxWidth: 280,
  },
  duesList: {
    gap: 12,
  },
  dueItemCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  dueItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  dueItemHeaderLeft: {
    flex: 1,
    marginRight: 8,
  },
  dueItemHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  duePeriodTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  duePeriodDates: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  dueAmountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  dueAmountText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  paidDateText: {
    fontSize: 12,
    color: '#10B981',
    fontWeight: '600',
  },
  paymentNoteText: {
    fontSize: 11,
    color: '#64748B',
    fontStyle: 'italic',
    marginBottom: 8,
  },
  dueActionRow: {
    marginTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  markPaidBtn: {
    flex: 1,
    backgroundColor: '#10B981',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  markPaidBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  reverseBtn: {
    flex: 1,
    backgroundColor: '#FEF2F2',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  reverseBtnText: {
    color: '#EF4444',
    fontWeight: '600',
    fontSize: 12,
  },
  navDeleteBtn: {
    padding: 6,
    marginRight: -4,
  },
  badgeRowWithDelete: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  deleteLoanCardBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteDueSmallBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
