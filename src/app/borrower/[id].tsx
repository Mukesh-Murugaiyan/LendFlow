import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
  Alert,
} from 'react-native';
import { useLocalSearchParams, router, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/Badge';
import { formatCurrency, calculateInterestAmount } from '@/utils/financial';
import { formatDisplayDate } from '@/utils/date';
import { lendflowApi } from '@/services/api/lendflowApi';
import { getFriendlyErrorMessage } from '@/utils/error';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function BorrowerProfileScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['borrower_details', id],
    queryFn: () => lendflowApi.getBorrowerDetails(id as string),
    enabled: !!id,
  });

  const borrower = data?.borrower;
  const borrowerLoans = data?.loans || [];

  const deleteBorrowerMutation = useMutation({
    mutationFn: () => lendflowApi.deleteBorrower(id as string),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['borrowers_list'] });
      queryClient.invalidateQueries({ queryKey: ['all_loans'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard_summary'] });
      Alert.alert('Borrower Deleted', 'Profile and associated loans have been removed.', [
        { text: 'OK', onPress: () => router.replace('/(tabs)/borrowers') },
      ]);
    },
    onError: (err: any) => {
      Alert.alert('Delete Failed', getFriendlyErrorMessage(err, 'Could not delete borrower.'));
    },
  });

  const handleDeleteBorrower = () => {
    Alert.alert(
      'Delete Borrower Profile',
      `Are you sure you want to delete ${borrower?.full_name}? All associated loans and interest records will also be deleted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteBorrowerMutation.mutate(),
        },
      ]
    );
  };

  if (isLoading || !borrower) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>
          {isLoading ? 'Loading profile...' : 'Borrower profile not found.'}
        </Text>
      </View>
    );
  }

  const handleCall = (phone?: string | null) => {
    if (phone) {
      Linking.openURL(`tel:${phone.replace(/\s+/g, '')}`);
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Borrower Profile',
          headerRight: () => (
            <TouchableOpacity
              onPress={handleDeleteBorrower}
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
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom + 40, 60) }]}
      >
        {/* Profile Card */}
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{borrower.full_name.charAt(0)}</Text>
            </View>
            <View style={styles.headerInfo}>
              <Text style={styles.name}>{borrower.full_name}</Text>
              <Text style={styles.occupation}>{borrower.occupation || 'Self Employed'}</Text>
            </View>
            <View style={styles.actionBtns}>
              <TouchableOpacity
                style={styles.callBtn}
                onPress={() => handleCall(borrower.mobile_number)}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="call" size={18} color="#4F46E5" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.deleteBtn}
                onPress={handleDeleteBorrower}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="trash-outline" size={16} color="#EF4444" />
              </TouchableOpacity>
            </View>
          </View>

        <View style={styles.divider} />

        <View style={styles.detailGrid}>
          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>Mobile</Text>
            <Text style={styles.detailValue}>{borrower.mobile_number}</Text>
          </View>
          {borrower.alternate_mobile_number ? (
            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>Alt Mobile</Text>
              <Text style={styles.detailValue}>{borrower.alternate_mobile_number}</Text>
            </View>
          ) : null}
          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>Government ID</Text>
            <Text style={styles.detailValue}>{borrower.government_id_masked || 'Not Provided'}</Text>
          </View>
          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>City / State</Text>
            <Text style={styles.detailValue}>
              {borrower.city || '-'}, {borrower.state || '-'}
            </Text>
          </View>
          {borrower.address ? (
            <View style={[styles.detailItem, { width: '100%' }]}>
              <Text style={styles.detailLabel}>Address</Text>
              <Text style={styles.detailValue}>{borrower.address}</Text>
            </View>
          ) : null}
        </View>

        {borrower.reference_name ? (
          <View style={styles.referenceBox}>
            <Text style={styles.referenceLabel}>Reference Person:</Text>
            <Text style={styles.referenceValue}>
              {borrower.reference_name} ({borrower.reference_mobile || 'No Phone'})
            </Text>
          </View>
        ) : null}
      </View>

      {/* Loans Section */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Loans ({borrowerLoans.length})</Text>
        <TouchableOpacity
          style={styles.newLoanLink}
          onPress={() =>
            router.push({
              pathname: '/create-loan',
              params: {
                borrowerId: borrower?.id || (id as string),
                borrowerName: borrower?.full_name || '',
                borrowerMobile: borrower?.mobile_number || '',
              },
            })
          }
        >
          <Text style={styles.newLoanLinkText}>+ New Loan</Text>
        </TouchableOpacity>
      </View>

      {borrowerLoans.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>No loans recorded for this borrower.</Text>
          <TouchableOpacity
            style={[styles.newLoanLink, { marginTop: 12, paddingHorizontal: 16, paddingVertical: 8 }]}
            onPress={() =>
              router.push({
                pathname: '/create-loan',
                params: {
                  borrowerId: borrower?.id || (id as string),
                  borrowerName: borrower?.full_name || '',
                  borrowerMobile: borrower?.mobile_number || '',
                },
              })
            }
          >
            <Text style={styles.newLoanLinkText}>+ Add First Loan</Text>
          </TouchableOpacity>
        </View>
      ) : (
        borrowerLoans.map((loan) => {
          const interestAmt = calculateInterestAmount(loan.principal_amount, loan.interest_rate);
          return (
            <TouchableOpacity
              key={loan.id}
              style={styles.loanCard}
              onPress={() => router.push(`/loan/${loan.id}`)}
              activeOpacity={0.8}
            >
              <View style={styles.loanCardHeader}>
                <Text style={styles.loanPrincipal}>{formatCurrency(loan.principal_amount)}</Text>
                <Badge status={loan.loan_status} />
              </View>

              <Text style={styles.loanRate}>
                {loan.interest_rate}% interest • {formatCurrency(interestAmt)} every {loan.interest_interval_days} days
              </Text>

              <View style={styles.loanFooter}>
                <Text style={styles.loanDate}>
                  Started: {formatDisplayDate(loan.loan_start_date)}
                </Text>
                <Text style={styles.nextDue}>
                  Next Due: {formatDisplayDate(loan.next_interest_due_date)}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })
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
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    fontSize: 14,
    color: '#64748B',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 20,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#4F46E5',
  },
  headerInfo: {
    flex: 1,
  },
  name: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
  },
  occupation: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  actionBtns: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  callBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 14,
  },
  detailGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  detailItem: {
    width: '46%',
  },
  detailLabel: {
    fontSize: 10,
    color: '#94A3B8',
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  detailValue: {
    fontSize: 13,
    color: '#0F172A',
    fontWeight: '600',
    marginTop: 2,
  },
  referenceBox: {
    marginTop: 14,
    backgroundColor: '#F8FAFC',
    padding: 10,
    borderRadius: 8,
    flexDirection: 'row',
    gap: 6,
  },
  referenceLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  referenceValue: {
    fontSize: 12,
    color: '#0F172A',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  newLoanLink: {
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  newLoanLinkText: {
    color: '#4F46E5',
    fontWeight: '700',
    fontSize: 13,
  },
  emptyBox: {
    backgroundColor: '#FFFFFF',
    padding: 24,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyText: {
    color: '#94A3B8',
    fontSize: 13,
  },
  loanCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 10,
  },
  loanCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  loanPrincipal: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
  },
  loanRate: {
    fontSize: 13,
    color: '#4F46E5',
    fontWeight: '600',
    marginTop: 4,
  },
  loanFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  loanDate: {
    fontSize: 11,
    color: '#94A3B8',
  },
  nextDue: {
    fontSize: 11,
    fontWeight: '600',
    color: '#0F172A',
  },
  navDeleteBtn: {
    padding: 6,
    marginRight: -4,
  },
});
