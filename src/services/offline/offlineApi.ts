import NetInfo from '@react-native-community/netinfo';
import { syncQueue } from './syncQueue';
import { lendflowApi, CreateManualDueParams } from '@/services/api/lendflowApi';
import { queryClient } from '@/services/queryClient';
import { useAppStore } from '@/store/useAppStore';
import { BorrowerFormData, CreateLoanFormData } from '@/validations/loan';
import { Borrower, Loan, InterestDue } from '@/types/database';

async function checkIsOnline(): Promise<boolean> {
  try {
    const state = await NetInfo.fetch();
    const isNetConnected = Boolean(state.isConnected && state.isInternetReachable !== false);
    const isStoreConnected = useAppStore.getState().isOnline;
    return isNetConnected && isStoreConnected;
  } catch {
    return useAppStore.getState().isOnline;
  }
}

function isNetworkError(err: any): boolean {
  if (!err) return false;
  const msg = (err.message || '').toLowerCase();
  const code = (err.code || '').toLowerCase();
  return (
    msg.includes('network request failed') ||
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('timed out') ||
    msg.includes('timeout') ||
    msg.includes('abort') ||
    msg.includes('connection') ||
    msg.includes('econnrefused') ||
    msg.includes('enotfound') ||
    code === 'econnrefused' ||
    code === 'enotfound'
  );
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number = 6000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('Network request timed out')), timeoutMs)
    ),
  ]);
}

export const offlineApi = {
  /**
   * Offline-aware Borrower creation
   */
  async createBorrower(
    data: BorrowerFormData,
    orgId: string,
    userId?: string
  ): Promise<{ borrower: Borrower; isOffline: boolean }> {
    const isOnline = await checkIsOnline();

    if (!isOnline) {
      console.log('[offlineApi.createBorrower] Device offline, saving to local queue immediately.');
      return this.queueBorrowerCreation(data, orgId, userId);
    }

    try {
      const created = await withTimeout(lendflowApi.createBorrower(data, orgId, userId), 6000);
      return { borrower: created, isOffline: false };
    } catch (err: any) {
      if (isNetworkError(err)) {
        console.warn('[offlineApi] Network call failed or timed out, enqueuing borrower for offline sync:', err.message);
        return this.queueBorrowerCreation(data, orgId, userId);
      }
      throw err;
    }
  },

  async queueBorrowerCreation(
    data: BorrowerFormData,
    orgId: string,
    userId?: string
  ): Promise<{ borrower: Borrower; isOffline: boolean }> {
    const tempId = `temp_borrower_${Date.now()}`;
    const optimisticBorrower: Borrower & { is_pending_sync?: boolean } = {
      id: tempId,
      organization_id: orgId || 'local_pending_org',
      full_name: data.full_name.trim(),
      mobile_number: data.mobile_number.trim(),
      alternate_mobile_number: data.alternate_mobile_number?.trim() || null,
      address: data.address?.trim() || null,
      city: data.city?.trim() || null,
      state: data.state?.trim() || null,
      pincode: data.pincode?.trim() || null,
      government_id_last4: data.government_id ? data.government_id.slice(-4) : null,
      government_id_masked: data.government_id ? `XXXX-XXXX-${data.government_id.slice(-4)}` : null,
      occupation: data.occupation?.trim() || null,
      reference_name: data.reference_name?.trim() || null,
      reference_mobile: data.reference_mobile?.trim() || null,
      notes: data.notes?.trim() || null,
      created_by: userId || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_pending_sync: true,
    };

    await syncQueue.enqueue('CREATE_BORROWER', { data, orgId, userId }, tempId);

    // Optimistically update all matching query caches
    queryClient.setQueriesData({ queryKey: ['borrowers_list'] }, (old: any) => {
      return Array.isArray(old) ? [optimisticBorrower, ...old] : [optimisticBorrower];
    });

    return { borrower: optimisticBorrower as Borrower, isOffline: true };
  },

  /**
   * Offline-aware Loan creation
   */
  async createLoan(
    data: CreateLoanFormData,
    orgId: string,
    userId?: string
  ): Promise<{ loan: Loan; isOffline: boolean }> {
    const isOnline = await checkIsOnline();

    if (!isOnline) {
      console.log('[offlineApi.createLoan] Device offline, saving to local queue immediately.');
      return this.queueLoanCreation(data, orgId, userId);
    }

    try {
      const created = await withTimeout(lendflowApi.createLoan(data, orgId, userId), 6000);
      return { loan: created, isOffline: false };
    } catch (err: any) {
      if (isNetworkError(err)) {
        console.warn('[offlineApi] Network call failed or timed out, enqueuing loan for offline sync:', err.message);
        return this.queueLoanCreation(data, orgId, userId);
      }
      throw err;
    }
  },

  async queueLoanCreation(
    data: CreateLoanFormData,
    orgId: string,
    userId?: string
  ): Promise<{ loan: Loan; isOffline: boolean }> {
    const tempLoanId = `temp_loan_${Date.now()}`;
    const tempBorrowerId = data.existing_borrower_id || `temp_borrower_${Date.now()}`;

    const optimisticBorrower: Borrower = {
      id: tempBorrowerId,
      organization_id: orgId || 'local_pending_org',
      full_name: data.full_name.trim(),
      mobile_number: data.mobile_number.trim(),
      alternate_mobile_number: data.alternate_mobile_number?.trim() || null,
      address: data.address?.trim() || null,
      city: data.city?.trim() || null,
      state: data.state?.trim() || null,
      pincode: data.pincode?.trim() || null,
      government_id_last4: data.government_id ? data.government_id.slice(-4) : null,
      government_id_masked: data.government_id ? `XXXX-XXXX-${data.government_id.slice(-4)}` : null,
      occupation: data.occupation?.trim() || null,
      reference_name: data.reference_name?.trim() || null,
      reference_mobile: data.reference_mobile?.trim() || null,
      notes: data.borrower_notes?.trim() || null,
      created_by: userId || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const optimisticLoan: Loan & { is_pending_sync?: boolean } = {
      id: tempLoanId,
      organization_id: orgId || 'local_pending_org',
      borrower_id: tempBorrowerId,
      principal_amount: data.principal_amount,
      interest_rate: data.interest_rate,
      interest_type: data.interest_type,
      interest_interval_days: data.interest_interval_days,
      loan_start_date: data.loan_start_date,
      first_interest_due_date: data.first_interest_due_date,
      next_interest_due_date: data.first_interest_due_date,
      principal_status: 'ACTIVE',
      loan_status: 'ACTIVE',
      closed_at: null,
      notes: data.loan_notes?.trim() || null,
      created_by: userId || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      borrower: optimisticBorrower,
      is_pending_sync: true,
    };

    await syncQueue.enqueue('CREATE_LOAN', { data, orgId, userId }, tempLoanId);

    // Optimistically update all matching query caches
    queryClient.setQueriesData({ queryKey: ['loans_list'] }, (old: any) => {
      return Array.isArray(old) ? [optimisticLoan, ...old] : [optimisticLoan];
    });

    queryClient.setQueriesData({ queryKey: ['all_loans'] }, (old: any) => {
      return Array.isArray(old) ? [optimisticLoan, ...old] : [optimisticLoan];
    });

    if (!data.existing_borrower_id) {
      queryClient.setQueriesData({ queryKey: ['borrowers_list'] }, (old: any) => {
        return Array.isArray(old) ? [optimisticBorrower, ...old] : [optimisticBorrower];
      });
    } else {
      queryClient.setQueriesData({ queryKey: ['borrower_details', data.existing_borrower_id] }, (old: any) => {
        if (!old) return old;
        return {
          ...old,
          loans: [optimisticLoan, ...(old.loans || [])],
        };
      });
    }

    return { loan: optimisticLoan as Loan, isOffline: true };
  },

  /**
   * Offline-aware Mark Interest Paid
   */
  async markInterestPaid(
    dueId: string,
    paidAmount?: number,
    note?: string
  ): Promise<{ result: any; isOffline: boolean }> {
    const isOnline = await checkIsOnline();

    if (!isOnline) {
      return this.queueInterestPayment(dueId, paidAmount, note);
    }

    try {
      const res = await withTimeout(lendflowApi.markInterestPaid(dueId, paidAmount, note), 6000);
      return { result: res, isOffline: false };
    } catch (err: any) {
      if (isNetworkError(err)) {
        return this.queueInterestPayment(dueId, paidAmount, note);
      }
      throw err;
    }
  },

  async queueInterestPayment(
    dueId: string,
    paidAmount?: number,
    note?: string
  ): Promise<{ result: any; isOffline: boolean }> {
    await syncQueue.enqueue('PAY_INTEREST', { dueId, paidAmount, note });

    // Optimistically update interest dues queries
    const updateDueItem = (d: InterestDue) => {
      if (d.id === dueId) {
        return {
          ...d,
          status: 'PAID' as const,
          paid_at: new Date().toISOString(),
          paid_amount: paidAmount ?? d.interest_amount,
          payment_note: note ?? 'Paid (Offline)',
        };
      }
      return d;
    };

    queryClient.setQueriesData({ queryKey: ['interest_dues'] }, (old: any) => {
      if (Array.isArray(old)) {
        return old.map(updateDueItem);
      }
      return old;
    });

    return {
      result: { success: true, due_id: dueId, status: 'PAID', offline: true },
      isOffline: true,
    };
  },

  /**
   * Offline-aware Manual Due Creation
   */
  async createManualDue(
    params: CreateManualDueParams,
    loan: Loan
  ): Promise<{ due: InterestDue; isOffline: boolean }> {
    const isOnline = await checkIsOnline();

    if (!isOnline) {
      console.log('[offlineApi.createManualDue] Device offline, saving due to local queue.');
      return this.queueManualDueCreation(params, loan);
    }

    try {
      const created = await withTimeout(lendflowApi.createManualDue(params), 6000);
      return { due: created, isOffline: false };
    } catch (err: any) {
      if (isNetworkError(err)) {
        console.warn('[offlineApi] Network call failed or timed out, enqueuing due for offline sync:', err.message);
        return this.queueManualDueCreation(params, loan);
      }
      throw err;
    }
  },

  async queueManualDueCreation(
    params: CreateManualDueParams,
    loan: Loan
  ): Promise<{ due: InterestDue; isOffline: boolean }> {
    const tempDueId = `temp_due_${Date.now()}`;
    const isPaid = params.status === 'PAID';

    const optimisticDue: InterestDue & { is_pending_sync?: boolean } = {
      id: tempDueId,
      organization_id: params.organization_id || loan.organization_id,
      loan_id: params.loan_id,
      borrower_id: params.borrower_id || loan.borrower_id,
      due_number: 999,
      period_start_date: params.period_start_date,
      due_date: params.due_date,
      principal_amount: loan.principal_amount,
      interest_rate: loan.interest_rate,
      interest_amount: params.interest_amount,
      status: params.status || 'UNPAID',
      paid_at: isPaid ? new Date().toISOString() : null,
      paid_amount: isPaid ? params.interest_amount : null,
      payment_note: params.notes || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_pending_sync: true,
      loan,
      borrower: loan.borrower,
    };

    await syncQueue.enqueue('CREATE_MANUAL_DUE', { params }, tempDueId);

    // Optimistically update loan_details
    queryClient.setQueriesData({ queryKey: ['loan_details', params.loan_id] }, (old: any) => {
      if (!old) return old;
      return {
        ...old,
        dues: [...(old.dues || []), optimisticDue],
      };
    });

    queryClient.setQueriesData({ queryKey: ['interest_dues'] }, (old: any) => {
      return Array.isArray(old) ? [optimisticDue, ...old] : [optimisticDue];
    });

    return { due: optimisticDue, isOffline: true };
  },
};
