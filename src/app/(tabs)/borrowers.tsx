import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Linking,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Header } from '@/components/Header';
import { SearchFilterBar } from '@/components/SearchFilterBar';
import { EmptyState } from '@/components/EmptyState';
import { lendflowApi } from '@/services/api/lendflowApi';
import { useAppStore } from '@/store/useAppStore';
import { Borrower } from '@/types/database';
import { getFriendlyErrorMessage } from '@/utils/error';

export default function BorrowersScreen() {
  const { currentOrgId } = useAppStore();
  const [searchQuery, setSearchQuery] = useState('');

  const {
    data: borrowers = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['borrowers_list', currentOrgId, searchQuery],
    queryFn: () => lendflowApi.getBorrowers(currentOrgId, searchQuery),
    enabled: !!currentOrgId,
  });

  const { data: allLoans = [] } = useQuery({
    queryKey: ['all_loans', currentOrgId],
    queryFn: () => lendflowApi.getLoans(currentOrgId),
    enabled: !!currentOrgId,
  });

  const queryClient = useQueryClient();

  const deleteBorrowerMutation = useMutation({
    mutationFn: (borrowerId: string) => lendflowApi.deleteBorrower(borrowerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['borrowers_list'] });
      queryClient.invalidateQueries({ queryKey: ['all_loans'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard_summary'] });
      Alert.alert('Borrower Deleted', 'The borrower record has been removed.');
    },
    onError: (err: any) => {
      Alert.alert('Delete Failed', getFriendlyErrorMessage(err, 'Could not delete borrower.'));
    },
  });

  const handleDeleteBorrower = (id: string, name: string) => {
    Alert.alert(
      'Delete Borrower',
      `Are you sure you want to delete ${name}? All associated loans and interest records will also be deleted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteBorrowerMutation.mutate(id),
        },
      ]
    );
  };

  const handleCall = (phone: string) => {
    Linking.openURL(`tel:${phone.replace(/\s+/g, '')}`);
  };

  const renderBorrowerItem = ({ item }: { item: Borrower }) => {
    const borrowerLoans = allLoans.filter((l) => l.borrower_id === item.id);
    const activeLoans = borrowerLoans.filter((l) => l.loan_status === 'ACTIVE');

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => router.push(`/borrower/${item.id}`)}
        activeOpacity={0.8}
      >
        <View style={styles.topRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{item.full_name.charAt(0).toUpperCase()}</Text>
          </View>
          <View style={styles.infoCol}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.name}>{item.full_name}</Text>
              {(item as any).is_pending_sync && (
                <View style={{ backgroundColor: '#FEF3C7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 }}>
                  <Text style={{ fontSize: 10, color: '#B45309', fontWeight: '700' }}>⏳ Offline</Text>
                </View>
              )}
            </View>
            <Text style={styles.occupation}>{item.occupation || 'Self-Employed'}</Text>
          </View>
          <View style={styles.actionBtns}>
            <TouchableOpacity
              style={styles.callBtn}
              onPress={() => handleCall(item.mobile_number)}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="call" size={16} color="#4F46E5" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.deleteBtn}
              onPress={() => handleDeleteBorrower(item.id, item.full_name)}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="trash-outline" size={15} color="#EF4444" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.detailsGrid}>
          <View style={styles.detailCol}>
            <Text style={styles.detailLabel}>Mobile</Text>
            <Text style={styles.detailValue}>{item.mobile_number}</Text>
          </View>
          <View style={styles.detailCol}>
            <Text style={styles.detailLabel}>Location</Text>
            <Text style={styles.detailValue}>{item.city || item.state || 'India'}</Text>
          </View>
          <View style={styles.detailCol}>
            <Text style={styles.detailLabel}>Govt ID</Text>
            <Text style={styles.detailValue}>{item.government_id_masked || 'Not Provided'}</Text>
          </View>
        </View>

        <View style={styles.cardFooter}>
          <Text style={styles.loanCountText}>
            {activeLoans.length} Active Loans • {borrowerLoans.length} Total
          </Text>
          <Text style={styles.viewProfileText}>View Profile →</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <Header
        title="Borrowers"
        subtitle="Borrower Contacts & Profiles"
        rightAction={{
          icon: 'person-add-outline',
          onPress: () => router.push('/create-borrower'),
        }}
      />

      <SearchFilterBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        placeholder="Search by name, phone, city..."
      />

      <FlatList
        data={borrowers}
        keyExtractor={(item) => item.id}
        renderItem={renderBorrowerItem}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} />}
        ListEmptyComponent={
          !isLoading ? (
            <EmptyState
              icon="people-outline"
              title="No Borrowers"
              description="No borrower profiles found. Add a borrower to manage their loans and interest schedules."
              actionLabel="+ Add Borrower"
              onAction={() => router.push('/create-borrower')}
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
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#4F46E5',
  },
  infoCol: {
    flex: 1,
  },
  name: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  occupation: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  callBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtns: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  deleteBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 12,
  },
  detailsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  detailCol: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 10,
    color: '#94A3B8',
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  detailValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
    marginTop: 2,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    padding: 10,
    borderRadius: 10,
  },
  loanCountText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  viewProfileText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4F46E5',
  },
});
