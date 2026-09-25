import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useAppStore } from '@/store/useAppStore';
import { lendflowApi } from '@/services/api/lendflowApi';
import { formatCurrency } from '@/utils/financial';
import { toISODateString } from '@/utils/date';
import { StatCard } from '@/components/StatCard';
import { DatePickerInput } from '@/components/DatePickerInput';

export default function ReportsScreen() {
  const { currentOrgId } = useAppStore();
  const today = toISODateString();

  const [fromDate, setFromDate] = useState('2026-01-01');
  const [toDate, setToDate] = useState('2026-12-31');

  const { data: loans = [] } = useQuery({
    queryKey: ['reports_loans', currentOrgId],
    queryFn: () => lendflowApi.getLoans(currentOrgId),
    enabled: !!currentOrgId,
  });

  const { data: dues = [] } = useQuery({
    queryKey: ['reports_dues', currentOrgId],
    queryFn: () => lendflowApi.getInterestDues(currentOrgId),
    enabled: !!currentOrgId,
  });

  const { data: borrowers = [] } = useQuery({
    queryKey: ['reports_borrowers', currentOrgId],
    queryFn: () => lendflowApi.getBorrowers(currentOrgId),
    enabled: !!currentOrgId,
  });

  // Filter dues by date range
  const filteredDues = dues.filter(
    (d) => (!fromDate || d.due_date >= fromDate) && (!toDate || d.due_date <= toDate)
  );

  const totalPrincipalGiven = loans.reduce((sum, l) => sum + Number(l.principal_amount), 0);
  const totalPrincipalActive = loans
    .filter((l) => l.loan_status === 'ACTIVE' && l.principal_status === 'ACTIVE')
    .reduce((sum, l) => sum + Number(l.principal_amount), 0);

  const totalInterestCollected = filteredDues
    .filter((d) => d.status === 'PAID')
    .reduce((sum, d) => sum + Number(d.paid_amount ?? d.interest_amount), 0);

  const totalInterestOutstanding = filteredDues
    .filter((d) => d.status === 'UNPAID')
    .reduce((sum, d) => sum + Number(d.interest_amount), 0);

  const overdueInterest = filteredDues
    .filter((d) => d.status === 'UNPAID' && d.due_date < today)
    .reduce((sum, d) => sum + Number(d.interest_amount), 0);

  // Borrower-wise collection breakdown
  const borrowerBreakdown = borrowers.map((b) => {
    const bDues = filteredDues.filter((d) => d.borrower_id === b.id);
    const collected = bDues
      .filter((d) => d.status === 'PAID')
      .reduce((sum, d) => sum + Number(d.paid_amount ?? d.interest_amount), 0);
    const pending = bDues
      .filter((d) => d.status === 'UNPAID')
      .reduce((sum, d) => sum + Number(d.interest_amount), 0);
    return {
      borrower: b,
      collected,
      pending,
      totalDues: bDues.length,
    };
  });

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Date Filter Card */}
      <View style={styles.filterCard}>
        <Text style={styles.filterTitle}>Date Range Filter</Text>
        <View style={styles.dateInputsRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.inputLabel}>From Date</Text>
            <DatePickerInput
              label="Report From Date"
              value={fromDate}
              onChange={setFromDate}
              placeholder="From Date"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.inputLabel}>To Date</Text>
            <DatePickerInput
              label="Report To Date"
              value={toDate}
              onChange={setToDate}
              placeholder="To Date"
            />
          </View>
        </View>
      </View>

      {/* KPI Cards */}
      <Text style={styles.sectionHeader}>Portfolio Capital & Yield</Text>
      <View style={styles.grid}>
        <StatCard
          title="Principal Disbursed"
          value={formatCurrency(totalPrincipalGiven)}
          icon="trending-up-outline"
          theme="slate"
        />
        <StatCard
          title="Active Principal"
          value={formatCurrency(totalPrincipalActive)}
          icon="cash-outline"
          theme="indigo"
        />
      </View>

      <View style={styles.grid}>
        <StatCard
          title="Interest Collected"
          value={formatCurrency(totalInterestCollected)}
          icon="checkmark-circle-outline"
          theme="emerald"
        />
        <StatCard
          title="Unpaid Interest"
          value={formatCurrency(totalInterestOutstanding)}
          icon="alert-circle-outline"
          theme="amber"
        />
      </View>

      <View style={[styles.grid, { marginBottom: 20 }]}>
        <StatCard
          title="Overdue Interest"
          value={formatCurrency(overdueInterest)}
          icon="warning-outline"
          theme="rose"
          subtitle="Past due dates"
        />
      </View>

      {/* Borrower-Wise Breakdown */}
      <Text style={styles.sectionHeader}>Borrower-Wise Collections</Text>
      <View style={styles.tableCard}>
        {borrowerBreakdown.map((item, idx) => (
          <View
            key={item.borrower.id}
            style={[styles.tableRow, idx > 0 && styles.rowBorder]}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.borrowerName}>{item.borrower.full_name}</Text>
              <Text style={styles.borrowerPhone}>{item.borrower.mobile_number}</Text>
            </View>

            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.collectedText}>
                + {formatCurrency(item.collected)} collected
              </Text>
              {item.pending > 0 && (
                <Text style={styles.pendingText}>
                  {formatCurrency(item.pending)} pending
                </Text>
              )}
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
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
  filterCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
  },
  filterTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  dateInputsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  inputLabel: {
    fontSize: 11,
    color: '#64748B',
    marginBottom: 4,
    fontWeight: '600',
  },
  dateInput: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: '#0F172A',
  },
  sectionHeader: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 10,
  },
  grid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  tableCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
  },
  tableRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  rowBorder: {
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  borrowerName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  borrowerPhone: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2,
  },
  collectedText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#10B981',
  },
  pendingText: {
    fontSize: 12,
    color: '#F59E0B',
    fontWeight: '600',
    marginTop: 2,
  },
});
