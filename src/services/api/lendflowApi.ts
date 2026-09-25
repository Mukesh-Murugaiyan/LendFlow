import { supabase } from '@/services/supabase';
import { Loan, Borrower, InterestDue, DashboardSummary, AuditLog } from '@/types/database';
import { CreateLoanFormData, BorrowerFormData } from '@/validations/loan';
import { maskGovernmentId } from '@/utils/financial';
import { toISODateString } from '@/utils/date';
import { isValidUUID } from '@/utils/uuid';
import { useAppStore } from '@/store/useAppStore';

/**
 * Resolves a valid organization UUID for the current authenticated session.
 * Strictly guarantees a valid UUID is returned, preventing PostgreSQL 22P02
 * "invalid input syntax for type uuid: ''" errors.
 */
export async function resolveOrganizationId(orgId?: string, userId?: string): Promise<string> {
  try {
    if (orgId && isValidUUID(orgId)) {
      return orgId;
    }

    const sessionUser = (await supabase.auth.getUser()).data.user;
    const rawUid = userId || sessionUser?.id;
    if (!rawUid || !isValidUUID(rawUid)) {
      throw new Error('User session not found. Please sign in to perform this action.');
    }
    const uid = rawUid;

    // 1. Check profile.default_organization_id
    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('default_organization_id')
      .eq('id', uid)
      .maybeSingle();

    if (profileErr) {
      console.error('[lendflowApi.resolveOrganizationId] Error querying profile:', profileErr);
    }

    if (profile?.default_organization_id && isValidUUID(profile.default_organization_id)) {
      useAppStore.getState().setCurrentOrgId(profile.default_organization_id);
      return profile.default_organization_id;
    }

    // 2. Check organization_members
    const { data: member, error: memberErr } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', uid)
      .limit(1)
      .maybeSingle();

    if (memberErr) {
      console.error('[lendflowApi.resolveOrganizationId] Error querying organization_members:', memberErr);
    }

    if (member?.organization_id && isValidUUID(member.organization_id)) {
      useAppStore.getState().setCurrentOrgId(member.organization_id);
      return member.organization_id;
    }

    // 3. Check organizations owned
    const { data: org, error: orgLookupErr } = await supabase
      .from('organizations')
      .select('id')
      .eq('owner_id', uid)
      .limit(1)
      .maybeSingle();

    if (orgLookupErr) {
      console.error('[lendflowApi.resolveOrganizationId] Error querying owned organizations:', orgLookupErr);
    }

    if (org?.id && isValidUUID(org.id)) {
      useAppStore.getState().setCurrentOrgId(org.id);
      return org.id;
    }

    // 4. Auto-create organization if user doesn't have one yet
    const { data: newOrg, error: orgErr } = await supabase
      .from('organizations')
      .insert({
        name: 'My Lending Business',
        owner_id: uid,
      })
      .select('id')
      .single();

    if (orgErr) {
      console.error('[lendflowApi.resolveOrganizationId] Error creating new organization:', orgErr);
      throw orgErr;
    }

    await supabase.from('organization_members').insert({
      organization_id: newOrg.id,
      user_id: uid,
      role: 'OWNER',
    });

    await supabase
      .from('profiles')
      .upsert({
        id: uid,
        full_name: sessionUser?.user_metadata?.full_name || 'Lender',
        email: sessionUser?.email || null,
        default_organization_id: newOrg.id,
      });

    useAppStore.getState().setCurrentOrgId(newOrg.id);
    return newOrg.id;
  } catch (err: any) {
    console.error('[lendflowApi.resolveOrganizationId] Error:', {
      orgId,
      userId,
      message: err?.message,
      code: err?.code,
      details: err?.details,
      hint: err?.hint,
      error: err,
    });
    throw err;
  }
}

/**
 * LendFlow Data Service:
 * Directly connects React Native to Supabase PostgreSQL, RLS policies, and RPC functions.
 */
export const lendflowApi = {
  // 1. Dashboard summary via PostgreSQL RPC
  async getDashboardSummary(orgId?: string): Promise<DashboardSummary> {
    try {
      let effectiveOrgId: string;
      try {
        effectiveOrgId = await resolveOrganizationId(orgId);
      } catch (resErr) {
        console.warn('[lendflowApi.getDashboardSummary] Could not resolve org ID, returning default zeros:', resErr);
        return {
          total_active_loans: 0,
          total_closed_loans: 0,
          total_principal_active: 0,
          total_principal_given: 0,
          total_interest_generated: 0,
          total_interest_collected: 0,
          total_interest_outstanding: 0,
          interest_due_today: 0,
          overdue_interest: 0,
          active_borrowers: 0,
        };
      }

      const { data, error } = await supabase.rpc('get_dashboard_summary', {
        p_org_id: effectiveOrgId,
        p_today: toISODateString(),
      });
      if (error) {
        console.error('[lendflowApi.getDashboardSummary] RPC error:', error);
        throw error;
      }
      return data as DashboardSummary;
    } catch (err: any) {
      console.error('[lendflowApi.getDashboardSummary] Error:', {
        orgId,
        message: err?.message,
        code: err?.code,
        details: err?.details,
        hint: err?.hint,
        error: err,
      });
      throw err;
    }
  },

  // 2. Fetch Loans with joined borrower
  async getLoans(orgId?: string, search?: string, filter?: string): Promise<Loan[]> {
    try {
      let effectiveOrgId: string;
      try {
        effectiveOrgId = await resolveOrganizationId(orgId);
      } catch (resErr) {
        console.warn('[lendflowApi.getLoans] Could not resolve org ID, returning empty array:', resErr);
        return [];
      }

      let query = supabase
        .from('loans')
        .select('*, borrower:borrowers(*)')
        .eq('organization_id', effectiveOrgId)
        .order('created_at', { ascending: false });

      if (filter === 'ACTIVE') {
        query = query.eq('loan_status', 'ACTIVE').eq('principal_status', 'ACTIVE');
      } else if (filter === 'CLOSED') {
        query = query.eq('loan_status', 'CLOSED');
      } else if (filter === 'FULLY_PAID') {
        query = query.eq('principal_status', 'FULLY_PAID');
      } else if (filter === 'DUE_TODAY') {
        query = query.eq('next_interest_due_date', toISODateString());
      }

      if (search && search.trim() !== '') {
        query = query.or(
          `notes.ilike.%${search}%,borrower.full_name.ilike.%${search}%,borrower.mobile_number.ilike.%${search}%`
        );
      }

      const { data, error } = await query;
      if (error) {
        console.error('[lendflowApi.getLoans] Query error:', error);
        throw error;
      }
      return (data || []) as Loan[];
    } catch (err: any) {
      console.error('[lendflowApi.getLoans] Error:', {
        orgId,
        search,
        filter,
        message: err?.message,
        code: err?.code,
        details: err?.details,
        hint: err?.hint,
        error: err,
      });
      throw err;
    }
  },

  // 3. Fetch single loan details with dues history
  async getLoanDetails(loanId: string): Promise<{ loan: Loan; dues: InterestDue[] }> {
    try {
      if (!loanId || !isValidUUID(loanId)) {
        throw new Error(`Valid Loan UUID is required (received: "${loanId}")`);
      }

      const { data: loan, error: loanErr } = await supabase
        .from('loans')
        .select('*, borrower:borrowers(*)')
        .eq('id', loanId)
        .single();
      if (loanErr) {
        console.error('[lendflowApi.getLoanDetails] Query loan error:', loanErr);
        throw loanErr;
      }

      const { data: dues, error: duesErr } = await supabase
        .from('interest_dues')
        .select('*')
        .eq('loan_id', loanId)
        .order('due_number', { ascending: true });
      if (duesErr) {
        console.error('[lendflowApi.getLoanDetails] Query dues error:', duesErr);
        throw duesErr;
      }

      return { loan: loan as Loan, dues: (dues || []) as InterestDue[] };
    } catch (err: any) {
      console.error('[lendflowApi.getLoanDetails] Error:', {
        loanId,
        message: err?.message,
        code: err?.code,
        details: err?.details,
        hint: err?.hint,
        error: err,
      });
      throw err;
    }
  },

  // 4. Create Loan
  async createLoan(data: CreateLoanFormData, orgId?: string, userId?: string): Promise<Loan> {
    try {
      const { masked, last4 } = maskGovernmentId(data.government_id);
      const effectiveOrgId = await resolveOrganizationId(orgId, userId);
      const sessionUser = (await supabase.auth.getUser()).data.user;
      const rawUid = userId || sessionUser?.id;
      const effectiveUserId = (rawUid && isValidUUID(rawUid)) ? rawUid : null;

      let borrowerId = (data.existing_borrower_id && isValidUUID(data.existing_borrower_id))
        ? data.existing_borrower_id
        : null;

      if (!borrowerId) {
        const { data: bData, error: bErr } = await supabase
          .from('borrowers')
          .insert({
            organization_id: effectiveOrgId,
            full_name: data.full_name.trim(),
            mobile_number: data.mobile_number.trim(),
            alternate_mobile_number: data.alternate_mobile_number?.trim() || null,
            address: data.address?.trim() || null,
            city: data.city?.trim() || null,
            state: data.state?.trim() || null,
            pincode: data.pincode?.trim() || null,
            government_id_last4: last4 || null,
            government_id_masked: masked || null,
            occupation: data.occupation?.trim() || null,
            reference_name: data.reference_name?.trim() || null,
            reference_mobile: data.reference_mobile?.trim() || null,
            notes: data.borrower_notes?.trim() || null,
            created_by: effectiveUserId,
          })
          .select('id')
          .single();
        if (bErr) {
          console.error('[lendflowApi.createLoan] Insert borrower error:', {
            bErr,
            code: bErr.code,
            message: bErr.message,
            effectiveOrgId,
            effectiveUserId,
          });
          throw bErr;
        }
        borrowerId = bData.id;
      }

      const { data: createdLoan, error: loanErr } = await supabase
        .from('loans')
        .insert({
          organization_id: effectiveOrgId,
          borrower_id: borrowerId,
          principal_amount: data.principal_amount,
          interest_rate: data.interest_rate,
          interest_type: data.interest_type,
          interest_interval_days: data.interest_interval_days,
          loan_start_date: data.loan_start_date,
          first_interest_due_date: data.first_interest_due_date,
          next_interest_due_date: data.first_interest_due_date,
          principal_status: 'ACTIVE',
          loan_status: 'ACTIVE',
          notes: data.loan_notes?.trim() || null,
          created_by: effectiveUserId,
        })
        .select('*')
        .single();
      if (loanErr) {
        console.error('[lendflowApi.createLoan] Insert loan error:', {
          loanErr,
          code: loanErr.code,
          message: loanErr.message,
          effectiveOrgId,
          borrowerId,
          effectiveUserId,
        });
        throw loanErr;
      }

      return createdLoan as Loan;
    } catch (err: any) {
      console.error('[lendflowApi.createLoan] Error:', {
        data,
        orgId,
        userId,
        message: err?.message,
        code: err?.code,
        details: err?.details,
        hint: err?.hint,
        error: err,
      });
      throw err;
    }
  },

  // 5. Mark interest paid (PostgreSQL RPC)
  async markInterestPaid(dueId: string, paidAmount?: number, note?: string): Promise<any> {
    try {
      if (!dueId || !isValidUUID(dueId)) {
        throw new Error(`Valid Due UUID is required (received: "${dueId}")`);
      }
      const { data, error } = await supabase.rpc('mark_interest_paid', {
        p_due_id: dueId,
        p_paid_amount: paidAmount,
        p_note: note,
      });
      if (error) {
        console.error('[lendflowApi.markInterestPaid] RPC error:', error);
        throw error;
      }
      return data;
    } catch (err: any) {
      console.error('[lendflowApi.markInterestPaid] Error:', {
        dueId,
        paidAmount,
        note,
        message: err?.message,
        code: err?.code,
        details: err?.details,
        hint: err?.hint,
        error: err,
      });
      throw err;
    }
  },

  // 6. Reverse interest payment (PostgreSQL RPC)
  async reverseInterestPayment(dueId: string, note?: string): Promise<any> {
    try {
      if (!dueId || !isValidUUID(dueId)) {
        throw new Error(`Valid Due UUID is required (received: "${dueId}")`);
      }
      const { data, error } = await supabase.rpc('reverse_interest_payment', {
        p_due_id: dueId,
        p_note: note,
      });
      if (error) {
        console.error('[lendflowApi.reverseInterestPayment] RPC error:', error);
        throw error;
      }
      return data;
    } catch (err: any) {
      console.error('[lendflowApi.reverseInterestPayment] Error:', {
        dueId,
        note,
        message: err?.message,
        code: err?.code,
        details: err?.details,
        hint: err?.hint,
        error: err,
      });
      throw err;
    }
  },

  // 7. Close loan (Principal Fully Paid) (PostgreSQL RPC)
  async closeLoan(loanId: string, note?: string): Promise<any> {
    try {
      if (!loanId || !isValidUUID(loanId)) {
        throw new Error(`Valid Loan UUID is required (received: "${loanId}")`);
      }
      const { data, error } = await supabase.rpc('close_loan', {
        p_loan_id: loanId,
        p_note: note,
      });
      if (error) {
        console.error('[lendflowApi.closeLoan] RPC error:', error);
        throw error;
      }
      return data;
    } catch (err: any) {
      console.error('[lendflowApi.closeLoan] Error:', {
        loanId,
        note,
        message: err?.message,
        code: err?.code,
        details: err?.details,
        hint: err?.hint,
        error: err,
      });
      throw err;
    }
  },

  // 8. Reopen loan (PostgreSQL RPC)
  async reopenLoan(loanId: string, note?: string): Promise<any> {
    try {
      if (!loanId || !isValidUUID(loanId)) {
        throw new Error(`Valid Loan UUID is required (received: "${loanId}")`);
      }
      const { data, error } = await supabase.rpc('reopen_loan', {
        p_loan_id: loanId,
        p_note: note,
      });
      if (error) {
        console.error('[lendflowApi.reopenLoan] RPC error:', error);
        throw error;
      }
      return data;
    } catch (err: any) {
      console.error('[lendflowApi.reopenLoan] Error:', {
        loanId,
        note,
        message: err?.message,
        code: err?.code,
        details: err?.details,
        hint: err?.hint,
        error: err,
      });
      throw err;
    }
  },

  // 9. Trigger interest generation (PostgreSQL RPC)
  async triggerInterestGeneration(asOfDate?: string): Promise<any> {
    try {
      const targetDate = asOfDate || toISODateString();
      const { data, error } = await supabase.rpc('generate_due_interest_records', {
        p_as_of_date: targetDate,
      });
      if (error) {
        console.error('[lendflowApi.triggerInterestGeneration] RPC error:', error);
        throw error;
      }
      return data;
    } catch (err: any) {
      console.error('[lendflowApi.triggerInterestGeneration] Error:', {
        asOfDate,
        message: err?.message,
        code: err?.code,
        details: err?.details,
        hint: err?.hint,
        error: err,
      });
      throw err;
    }
  },

  // 10. Fetch all dues with joined borrower and loan
  async getInterestDues(orgId?: string, status?: string): Promise<InterestDue[]> {
    try {
      let effectiveOrgId: string;
      try {
        effectiveOrgId = await resolveOrganizationId(orgId);
      } catch (resErr) {
        console.warn('[lendflowApi.getInterestDues] Could not resolve org ID, returning empty array:', resErr);
        return [];
      }

      let query = supabase
        .from('interest_dues')
        .select('*, borrower:borrowers(*), loan:loans(*)')
        .eq('organization_id', effectiveOrgId)
        .order('due_date', { ascending: false });

      if (status && status !== 'ALL') {
        query = query.eq('status', status);
      }
      const { data, error } = await query;
      if (error) {
        console.error('[lendflowApi.getInterestDues] Query error:', error);
        throw error;
      }
      return (data || []) as InterestDue[];
    } catch (err: any) {
      console.error('[lendflowApi.getInterestDues] Error:', {
        orgId,
        status,
        message: err?.message,
        code: err?.code,
        details: err?.details,
        hint: err?.hint,
        error: err,
      });
      throw err;
    }
  },

  // 11. Fetch Borrowers
  async getBorrowers(orgId?: string, search?: string): Promise<Borrower[]> {
    try {
      let effectiveOrgId: string;
      try {
        effectiveOrgId = await resolveOrganizationId(orgId);
      } catch (resErr) {
        console.warn('[lendflowApi.getBorrowers] Could not resolve org ID, returning empty array:', resErr);
        return [];
      }

      let query = supabase
        .from('borrowers')
        .select('*')
        .eq('organization_id', effectiveOrgId)
        .order('created_at', { ascending: false });

      if (search && search.trim() !== '') {
        query = query.ilike('full_name', `%${search}%`);
      }
      const { data, error } = await query;
      if (error) {
        console.error('[lendflowApi.getBorrowers] Query error:', error);
        throw error;
      }
      return (data || []) as Borrower[];
    } catch (err: any) {
      console.error('[lendflowApi.getBorrowers] Error:', {
        orgId,
        search,
        message: err?.message,
        code: err?.code,
        details: err?.details,
        hint: err?.hint,
        error: err,
      });
      throw err;
    }
  },

  // 12. Fetch single Borrower details with loans
  async getBorrowerDetails(borrowerId: string): Promise<{ borrower: Borrower; loans: Loan[] }> {
    try {
      if (!borrowerId || !isValidUUID(borrowerId)) {
        throw new Error(`Valid Borrower UUID is required (received: "${borrowerId}")`);
      }

      const { data: borrower, error: bErr } = await supabase
        .from('borrowers')
        .select('*')
        .eq('id', borrowerId)
        .single();
      if (bErr) {
        console.error('[lendflowApi.getBorrowerDetails] Query borrower error:', bErr);
        throw bErr;
      }

      const { data: loans, error: lErr } = await supabase
        .from('loans')
        .select('*')
        .eq('borrower_id', borrowerId)
        .order('created_at', { ascending: false });
      if (lErr) {
        console.error('[lendflowApi.getBorrowerDetails] Query loans error:', lErr);
        throw lErr;
      }

      return { borrower: borrower as Borrower, loans: (loans || []) as Loan[] };
    } catch (err: any) {
      console.error('[lendflowApi.getBorrowerDetails] Error:', {
        borrowerId,
        message: err?.message,
        code: err?.code,
        details: err?.details,
        hint: err?.hint,
        error: err,
      });
      throw err;
    }
  },

  // 13. Create standalone Borrower
  async createBorrower(data: BorrowerFormData, orgId?: string, userId?: string): Promise<Borrower> {
    try {
      const { masked, last4 } = maskGovernmentId(data.government_id);
      const effectiveOrgId = await resolveOrganizationId(orgId, userId);
      const sessionUser = (await supabase.auth.getUser()).data.user;
      const rawUid = userId || sessionUser?.id;
      const effectiveUserId = (rawUid && isValidUUID(rawUid)) ? rawUid : null;

      const { data: created, error } = await supabase
        .from('borrowers')
        .insert({
          organization_id: effectiveOrgId,
          full_name: data.full_name.trim(),
          mobile_number: data.mobile_number.trim(),
          alternate_mobile_number: data.alternate_mobile_number?.trim() || null,
          address: data.address?.trim() || null,
          city: data.city?.trim() || null,
          state: data.state?.trim() || null,
          pincode: data.pincode?.trim() || null,
          government_id_last4: last4 || null,
          government_id_masked: masked || null,
          occupation: data.occupation?.trim() || null,
          reference_name: data.reference_name?.trim() || null,
          reference_mobile: data.reference_mobile?.trim() || null,
          notes: data.notes?.trim() || null,
          created_by: effectiveUserId,
        })
        .select('*')
        .single();
      if (error) {
        console.error('[lendflowApi.createBorrower] Insert borrower error:', {
          error,
          code: error.code,
          message: error.message,
          effectiveOrgId,
          effectiveUserId,
        });
        throw error;
      }
      return created as Borrower;
    } catch (err: any) {
      console.error('[lendflowApi.createBorrower] Error:', {
        data,
        orgId,
        userId,
        message: err?.message,
        code: err?.code,
        details: err?.details,
        hint: err?.hint,
        error: err,
      });
      throw err;
    }
  },

  // 14. Fetch Audit Logs
  async getAuditLogs(orgId?: string): Promise<AuditLog[]> {
    try {
      let effectiveOrgId: string;
      try {
        effectiveOrgId = await resolveOrganizationId(orgId);
      } catch (resErr) {
        console.warn('[lendflowApi.getAuditLogs] Could not resolve org ID, returning empty array:', resErr);
        return [];
      }

      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('organization_id', effectiveOrgId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) {
        console.error('[lendflowApi.getAuditLogs] Query error:', error);
        throw error;
      }
      return (data || []) as AuditLog[];
    } catch (err: any) {
      console.error('[lendflowApi.getAuditLogs] Error:', {
        orgId,
        message: err?.message,
        code: err?.code,
        details: err?.details,
        hint: err?.hint,
        error: err,
      });
      throw err;
    }
  },

  // 15. Delete Borrower (cascades to their loans and dues)
  async deleteBorrower(borrowerId: string): Promise<boolean> {
    try {
      if (!borrowerId || !isValidUUID(borrowerId)) {
        throw new Error(`Valid Borrower UUID is required (received: "${borrowerId}")`);
      }

      const { error } = await supabase
        .from('borrowers')
        .delete()
        .eq('id', borrowerId);

      if (error) {
        console.error('[lendflowApi.deleteBorrower] Error deleting borrower:', error);
        throw error;
      }
      return true;
    } catch (err: any) {
      console.error('[lendflowApi.deleteBorrower] Error:', {
        borrowerId,
        message: err?.message,
        code: err?.code,
        details: err?.details,
        hint: err?.hint,
        error: err,
      });
      throw err;
    }
  },

  // 16. Delete Loan (cascades to interest dues)
  async deleteLoan(loanId: string): Promise<boolean> {
    try {
      if (!loanId || !isValidUUID(loanId)) {
        throw new Error(`Valid Loan UUID is required (received: "${loanId}")`);
      }

      const { error } = await supabase
        .from('loans')
        .delete()
        .eq('id', loanId);

      if (error) {
        console.error('[lendflowApi.deleteLoan] Error deleting loan:', error);
        throw error;
      }
      return true;
    } catch (err: any) {
      console.error('[lendflowApi.deleteLoan] Error:', {
        loanId,
        message: err?.message,
        code: err?.code,
        details: err?.details,
        hint: err?.hint,
        error: err,
      });
      throw err;
    }
  },

  // 17. Delete Interest Due
  async deleteInterestDue(dueId: string): Promise<boolean> {
    try {
      if (!dueId || !isValidUUID(dueId)) {
        throw new Error(`Valid Due UUID is required (received: "${dueId}")`);
      }

      const { error } = await supabase
        .from('interest_dues')
        .delete()
        .eq('id', dueId);

      if (error) {
        console.error('[lendflowApi.deleteInterestDue] Error deleting interest due:', error);
        throw error;
      }
      return true;
    } catch (err: any) {
      console.error('[lendflowApi.deleteInterestDue] Error:', {
        dueId,
        message: err?.message,
        code: err?.code,
        details: err?.details,
        hint: err?.hint,
        error: err,
      });
      throw err;
    }
  },
};
