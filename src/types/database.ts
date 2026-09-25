// Database and Domain Types for LendFlow

export type UserRole = 'OWNER' | 'ADMIN' | 'COLLECTOR' | 'VIEWER';
export type LoanStatus = 'ACTIVE' | 'CLOSED' | 'PAUSED';
export type PrincipalStatus = 'ACTIVE' | 'FULLY_PAID' | 'REOPENED';
export type InterestDueStatus = 'UNPAID' | 'PAID' | 'CANCELLED';
export type InterestType = 'SIMPLE' | 'MONTHLY_CALENDAR';

export interface Profile {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  default_organization_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Organization {
  id: string;
  name: string;
  owner_id: string;
  currency: string;
  timezone: string;
  created_at: string;
  updated_at: string;
}

export interface OrganizationMember {
  id: string;
  organization_id: string;
  user_id: string;
  role: UserRole;
  created_at: string;
}

export interface Borrower {
  id: string;
  organization_id: string;
  full_name: string;
  mobile_number: string;
  alternate_mobile_number?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  government_id_last4?: string | null;
  government_id_masked?: string | null;
  occupation?: string | null;
  reference_name?: string | null;
  reference_mobile?: string | null;
  notes?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Loan {
  id: string;
  organization_id: string;
  borrower_id: string;
  principal_amount: number;
  interest_rate: number;
  interest_type: InterestType;
  interest_interval_days: number;
  loan_start_date: string;
  first_interest_due_date: string;
  next_interest_due_date: string;
  principal_status: PrincipalStatus;
  loan_status: LoanStatus;
  closed_at?: string | null;
  notes?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;

  // Joined borrower info
  borrower?: Borrower;
}

export interface InterestDue {
  id: string;
  organization_id: string;
  loan_id: string;
  borrower_id: string;
  due_number: number;
  period_start_date: string;
  due_date: string;
  principal_amount: number;
  interest_rate: number;
  interest_amount: number;
  status: InterestDueStatus;
  paid_at?: string | null;
  paid_amount?: number | null;
  payment_note?: string | null;
  created_at: string;
  updated_at: string;

  // Joined loan & borrower info
  loan?: Loan;
  borrower?: Borrower;
}

export interface AuditLog {
  id: string;
  organization_id: string;
  user_id?: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  old_data?: Record<string, any> | null;
  new_data?: Record<string, any> | null;
  created_at: string;
}

export interface DashboardSummary {
  total_active_loans: number;
  total_closed_loans: number;
  total_principal_active: number;
  total_principal_given: number;
  total_interest_generated: number;
  total_interest_collected: number;
  total_interest_outstanding: number;
  interest_due_today: number;
  overdue_interest: number;
  active_borrowers: number;
}
