import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Pressable,
} from 'react-native';

import { Badge } from '@/components/Badge';
import { DatePickerInput } from '@/components/DatePickerInput';
import { lendflowApi } from '@/services/api/lendflowApi';
import { offlineApi } from '@/services/offline/offlineApi';
import { useAppStore } from '@/store/useAppStore';
import { InterestDue } from '@/types/database';
import { calculateNextDueDate, formatDisplayDate, isOverdue, toISODateString } from '@/utils/date';
import { getFriendlyErrorMessage } from '@/utils/error';
import { calculateInterestAmount, formatCurrency } from '@/utils/financial';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function LoanDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();

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
      Alert.alert('Payment Error', getFriendlyErrorMessage(err, 'Failed to mark interest as paid.'));
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
      Alert.alert('Reversal Error', getFriendlyErrorMessage(err, 'Failed to reverse payment.'));
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
      Alert.alert('Close Error', getFriendlyErrorMessage(err, 'Failed to close loan.'));
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
      Alert.alert('Reopen Error', getFriendlyErrorMessage(err, 'Failed to reopen loan.'));
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
      Alert.alert('Delete Failed', getFriendlyErrorMessage(err, 'Failed to delete loan.'));
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
      Alert.alert('Delete Failed', getFriendlyErrorMessage(err, 'Failed to delete interest due.'));
    },
  });

  const { currentOrgId } = useAppStore();

  const [isAddDueModalVisible, setIsAddDueModalVisible] = useState(false);
  const [selectedDueForActions, setSelectedDueForActions] = useState<InterestDue | null>(null);
  const [manualDueDate, setManualDueDate] = useState('');
  const [manualPeriodStart, setManualPeriodStart] = useState('');
  const [manualInterestAmount, setManualInterestAmount] = useState('');
  const [manualStatus, setManualStatus] = useState<'UNPAID' | 'PAID'>('UNPAID');
  const [manualNotes, setManualNotes] = useState('');

  const handleOpenAddDueModal = () => {
    if (!loan) return;
    // Find the latest due by sorting existing dues by due_date ascending
    const sortedDues = [...dues].sort((a, b) => a.due_date.localeCompare(b.due_date));
    const lastDue = sortedDues.length > 0 ? sortedDues[sortedDues.length - 1] : null;

    // Period starts from the last recorded due_date, or loan_start_date if no dues exist
    const defaultStart = lastDue?.due_date || loan.loan_start_date || toISODateString();

    // Next due date is computed dynamically 1 interval ahead from defaultStart
    const defaultDue = calculateNextDueDate(
      defaultStart,
      loan.interest_interval_days,
      loan.interest_type
    );

    const expectedInterest = calculateInterestAmount(loan.principal_amount, loan.interest_rate);

    setManualDueDate(defaultDue);
    setManualPeriodStart(defaultStart);
    setManualInterestAmount(String(expectedInterest));
    setManualStatus('UNPAID');
    setManualNotes('');
    setIsAddDueModalVisible(true);
  };

  const createDueMutation = useMutation({
    mutationFn: () => {
      if (!loan) throw new Error('Loan data not available');
      const amount = Number(manualInterestAmount);
      if (!amount || amount <= 0) {
        throw new Error('Please enter a valid interest amount greater than 0.');
      }
      if (!manualDueDate) {
        throw new Error('Due date is required.');
      }
      if (!manualPeriodStart) {
        throw new Error('Period start date is required.');
      }

      const exists = dues.some((d: InterestDue) => d.due_date === manualDueDate);
      if (exists) {
        throw new Error(`A due record already exists on ${manualDueDate} for this loan.`);
      }

      return offlineApi.createManualDue(
        {
          loan_id: loan.id,
          borrower_id: loan.borrower_id,
          organization_id: loan.organization_id || currentOrgId,
          due_date: manualDueDate,
          period_start_date: manualPeriodStart,
          interest_amount: amount,
          status: manualStatus,
          notes: manualNotes.trim() || undefined,
        },
        loan
      );
    },
    onSuccess: ({ isOffline }) => {
      setIsAddDueModalVisible(false);
      queryClient.invalidateQueries({ queryKey: ['loan_details', id] });
      queryClient.invalidateQueries({ queryKey: ['dashboard_summary'] });
      queryClient.invalidateQueries({ queryKey: ['interest_dues'] });
      queryClient.invalidateQueries({ queryKey: ['all_dues'] });
      Alert.alert(
        isOffline ? 'Due Saved Offline ⏳' : 'Interest Due Added',
        isOffline
          ? 'Manual due saved locally. It will automatically sync to the server once online.'
          : 'Manual interest due record has been created successfully.'
      );
    },
    onError: (err: any) => {
      Alert.alert('Add Due Error', getFriendlyErrorMessage(err, 'Failed to add manual due record.'));
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
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom + 36, 48) }]}
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
          <View style={{ flex: 1 }}>
            <Text style={styles.historySectionTitle}>Interest History ({dues.length})</Text>
            <Text style={styles.historySubtitle}>Database & Manual Records</Text>
          </View>
          {!isClosed && (
            <TouchableOpacity
              style={styles.addDueBtn}
              onPress={handleOpenAddDueModal}
              activeOpacity={0.8}
            >
              <Ionicons name="add-circle" size={16} color="#FFFFFF" />
              <Text style={styles.addDueBtnText}>+ Add Due</Text>
            </TouchableOpacity>
          )}
        </View>

        {dues.length === 0 ? (
          <View style={styles.emptyHistory}>
            <Ionicons name="calendar-outline" size={32} color="#94A3B8" />
            <Text style={styles.emptyHistoryTitle}>No Interest Dues Generated Yet</Text>
            <Text style={styles.emptyHistoryDesc}>
              The scheduled database function will automatically generate due #{1} on{' '}
              {formatDisplayDate(loan.next_interest_due_date)}.
            </Text>
            {!isClosed && (
              <TouchableOpacity
                style={[styles.addDueBtn, { marginTop: 14 }]}
                onPress={handleOpenAddDueModal}
                activeOpacity={0.8}
              >
                <Ionicons name="add-circle" size={16} color="#FFFFFF" />
                <Text style={styles.addDueBtnText}>+ Add Due Manually</Text>
              </TouchableOpacity>
            )}
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
                      {!isClosed && (
                        <TouchableOpacity
                          style={styles.dueMenuBtn}
                          onPress={() => setSelectedDueForActions(due)}
                          activeOpacity={0.7}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Ionicons name="ellipsis-vertical" size={17} color="#64748B" />
                        </TouchableOpacity>
                      )}
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

                  {/* Mark as Paid Action for Unpaid Dues */}
                  {!isClosed && due.status === 'UNPAID' && (
                    <View style={styles.dueActionRow}>
                      <TouchableOpacity
                        style={styles.markPaidBtn}
                        onPress={() => markPaidMutation.mutate(due.id)}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="checkmark-circle" size={16} color="#FFFFFF" />
                        <Text style={styles.markPaidBtnText}>Mark as Paid</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Manual Due Add Modal */}
      <Modal
        visible={isAddDueModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setIsAddDueModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalContent, { paddingBottom: Math.max(insets.bottom + 16, 24) }]}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>Add Interest Due Manually</Text>
                <Text style={styles.modalSubtitle}>
                  {loan?.borrower?.full_name} • Loan of {formatCurrency(loan?.principal_amount || 0)}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setIsAddDueModalVisible(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={22} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              {/* Period Start Date (From Date) */}
              <View>
                <Text style={styles.modalFieldLabel}>Interest From Date (Start Date) *</Text>
                <DatePickerInput
                  label="Interest From Date (Start Date)"
                  value={manualPeriodStart}
                  onChange={(val) => {
                    setManualPeriodStart(val);
                    if (loan) {
                      setManualDueDate(
                        calculateNextDueDate(val, loan.interest_interval_days, loan.interest_type)
                      );
                    }
                  }}
                />
              </View>

              {/* Due Date (To / Payable Date) */}
              <View style={{ marginTop: 12 }}>
                <Text style={styles.modalFieldLabel}>Due Date (Payment / Collection Date) *</Text>
                <DatePickerInput
                  label="Due Date (Payment Date)"
                  value={manualDueDate}
                  onChange={setManualDueDate}
                />
              </View>

              {/* Interest Amount */}
              <View style={{ marginTop: 12 }}>
                <Text style={styles.modalFieldLabel}>Interest Amount (₹) *</Text>
                <TextInput
                  style={styles.modalInput}
                  keyboardType="numeric"
                  placeholder="e.g. 500"
                  value={manualInterestAmount}
                  onChangeText={setManualInterestAmount}
                />
              </View>

              {/* Payment Status Toggle */}
              <View style={{ marginTop: 12 }}>
                <Text style={styles.modalFieldLabel}>Initial Due Status</Text>
                <View style={styles.statusToggleRow}>
                  <TouchableOpacity
                    style={[
                      styles.statusToggleBtn,
                      manualStatus === 'UNPAID' && styles.statusToggleBtnActiveUnpaid,
                    ]}
                    onPress={() => setManualStatus('UNPAID')}
                  >
                    <Ionicons
                      name="time-outline"
                      size={15}
                      color={manualStatus === 'UNPAID' ? '#D97706' : '#64748B'}
                    />
                    <Text
                      style={[
                        styles.statusToggleText,
                        manualStatus === 'UNPAID' && styles.statusToggleTextActiveUnpaid,
                      ]}
                    >
                      UNPAID (Pay Later)
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.statusToggleBtn,
                      manualStatus === 'PAID' && styles.statusToggleBtnActivePaid,
                    ]}
                    onPress={() => setManualStatus('PAID')}
                  >
                    <Ionicons
                      name="checkmark-circle-outline"
                      size={15}
                      color={manualStatus === 'PAID' ? '#059669' : '#64748B'}
                    />
                    <Text
                      style={[
                        styles.statusToggleText,
                        manualStatus === 'PAID' && styles.statusToggleTextActivePaid,
                      ]}
                    >
                      PAID (Paid Today)
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Notes */}
              <View style={{ marginTop: 12, marginBottom: 20 }}>
                <Text style={styles.modalFieldLabel}>Notes / Remarks (Optional)</Text>
                <TextInput
                  style={[styles.modalInput, styles.modalNotesInput]}
                  placeholder="e.g. Added manually by lender, custom cycle"
                  multiline
                  numberOfLines={2}
                  value={manualNotes}
                  onChangeText={setManualNotes}
                />
              </View>
            </ScrollView>

            {/* Modal Actions */}
            <View style={[styles.modalActionsRow, { paddingBottom: Math.max(insets.bottom, 12) }]}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setIsAddDueModalVisible(false)}
                disabled={createDueMutation.isPending}
              >
                <Text style={styles.modalCancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalSubmitBtn}
                onPress={() => createDueMutation.mutate()}
                disabled={createDueMutation.isPending}
                activeOpacity={0.8}
              >
                {createDueMutation.isPending ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                    <Text style={styles.modalSubmitBtnText}>Add Due Record</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* 3-Dot Due Actions Action Sheet Modal */}
      <Modal
        visible={!!selectedDueForActions}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedDueForActions(null)}
      >
        <Pressable
          style={styles.actionSheetOverlay}
          onPress={() => setSelectedDueForActions(null)}
        >
          <Pressable
            style={[styles.actionSheetContent, { paddingBottom: Math.max(insets.bottom + 16, 24) }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.actionSheetHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.actionSheetTitle}>
                  Due #{selectedDueForActions?.due_number} Options
                </Text>
                <Text style={styles.actionSheetSubtitle}>
                  {formatCurrency(selectedDueForActions?.interest_amount || 0)} • {formatDisplayDate(selectedDueForActions?.due_date)} • {selectedDueForActions?.status}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setSelectedDueForActions(null)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <View style={styles.actionSheetItems}>
              {/* If PAID: Option to Reverse Payment */}
              {selectedDueForActions?.status === 'PAID' && (
                <TouchableOpacity
                  style={styles.actionSheetItem}
                  onPress={() => {
                    const dueToReverse = selectedDueForActions;
                    setSelectedDueForActions(null);
                    if (dueToReverse) {
                      Alert.alert(
                        'Reverse Payment?',
                        `This will revert Due #${dueToReverse.due_number} back to UNPAID.`,
                        [
                          { text: 'Cancel', style: 'cancel' },
                          {
                            text: 'Reverse Payment',
                            style: 'destructive',
                            onPress: () => reversePaymentMutation.mutate(dueToReverse.id),
                          },
                        ]
                      );
                    }
                  }}
                  activeOpacity={0.7}
                >
                  <View style={[styles.actionSheetIconWrapper, { backgroundColor: '#FEF2F2' }]}>
                    <Ionicons name="arrow-undo-outline" size={18} color="#EF4444" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.actionSheetItemText, { color: '#EF4444' }]}>Reverse Payment</Text>
                    <Text style={styles.actionSheetItemSubtext}>Mark this due back to UNPAID</Text>
                  </View>
                </TouchableOpacity>
              )}

              {/* If UNPAID: Option to Mark as Paid */}
              {selectedDueForActions?.status === 'UNPAID' && (
                <TouchableOpacity
                  style={styles.actionSheetItem}
                  onPress={() => {
                    const dueToPay = selectedDueForActions;
                    setSelectedDueForActions(null);
                    if (dueToPay) {
                      markPaidMutation.mutate(dueToPay.id);
                    }
                  }}
                  activeOpacity={0.7}
                >
                  <View style={[styles.actionSheetIconWrapper, { backgroundColor: '#ECFDF5' }]}>
                    <Ionicons name="checkmark-circle-outline" size={18} color="#059669" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.actionSheetItemText, { color: '#059669' }]}>Mark as Paid</Text>
                    <Text style={styles.actionSheetItemSubtext}>Record interest payment of {formatCurrency(selectedDueForActions?.interest_amount || 0)}</Text>
                  </View>
                </TouchableOpacity>
              )}

              {/* Delete Due Record */}
              <TouchableOpacity
                style={styles.actionSheetItem}
                onPress={() => {
                  const dueToDelete = selectedDueForActions;
                  setSelectedDueForActions(null);
                  if (dueToDelete) {
                    handleDeleteDue(dueToDelete.id, dueToDelete.due_number);
                  }
                }}
                activeOpacity={0.7}
              >
                <View style={[styles.actionSheetIconWrapper, { backgroundColor: '#FEE2E2' }]}>
                  <Ionicons name="trash-outline" size={18} color="#DC2626" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.actionSheetItemText, { color: '#DC2626' }]}>Delete Due Record</Text>
                  <Text style={styles.actionSheetItemSubtext}>Permanently remove this due record</Text>
                </View>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.actionSheetCancelBtn}
              onPress={() => setSelectedDueForActions(null)}
              activeOpacity={0.8}
            >
              <Text style={styles.actionSheetCancelText}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
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
  addDueBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#4F46E5',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  addDueBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
    paddingBottom: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  modalBody: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  modalFieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 2,
  },
  modalFieldHint: {
    fontSize: 11,
    color: '#64748B',
    marginBottom: 6,
  },
  modalInput: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0F172A',
  },
  modalNotesInput: {
    height: 60,
    textAlignVertical: 'top',
  },
  statusToggleRow: {
    flexDirection: 'row',
    gap: 10,
  },
  statusToggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  statusToggleBtnActiveUnpaid: {
    backgroundColor: '#FEF3C7',
    borderColor: '#F59E0B',
  },
  statusToggleBtnActivePaid: {
    backgroundColor: '#D1FAE5',
    borderColor: '#10B981',
  },
  statusToggleText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  statusToggleTextActiveUnpaid: {
    color: '#B45309',
    fontWeight: '700',
  },
  statusToggleTextActivePaid: {
    color: '#065F46',
    fontWeight: '700',
  },
  modalActionsRow: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
  },
  modalCancelBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
  modalSubmitBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#4F46E5',
    paddingVertical: 12,
    borderRadius: 10,
  },
  modalSubmitBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  dueMenuBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionSheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'flex-end',
  },
  actionSheetContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  actionSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  actionSheetTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  actionSheetSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  actionSheetItems: {
    paddingVertical: 12,
    gap: 8,
  },
  actionSheetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    gap: 12,
  },
  actionSheetIconWrapper: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionSheetItemText: {
    fontSize: 14,
    fontWeight: '700',
  },
  actionSheetItemSubtext: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  actionSheetCancelBtn: {
    marginTop: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionSheetCancelText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#475569',
  },
});
