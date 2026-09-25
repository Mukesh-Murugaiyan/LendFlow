-- ==============================================================================
-- 004_indexes.sql: Performance Indexes
-- Optimized for search, filters, pagination, and high-frequency scheduler queries
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- Borrowers Indexes
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_borrowers_org_id ON public.borrowers(organization_id);
CREATE INDEX IF NOT EXISTS idx_borrowers_full_name ON public.borrowers USING gin (to_tsvector('simple', full_name));
CREATE INDEX IF NOT EXISTS idx_borrowers_full_name_trgm ON public.borrowers(full_name);
CREATE INDEX IF NOT EXISTS idx_borrowers_mobile ON public.borrowers(mobile_number);
CREATE INDEX IF NOT EXISTS idx_borrowers_city ON public.borrowers(city);
CREATE INDEX IF NOT EXISTS idx_borrowers_created_at ON public.borrowers(created_at DESC);

-- ------------------------------------------------------------------------------
-- Loans Indexes
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_loans_org_id ON public.loans(organization_id);
CREATE INDEX IF NOT EXISTS idx_loans_borrower_id ON public.loans(borrower_id);
CREATE INDEX IF NOT EXISTS idx_loans_next_due ON public.loans(next_interest_due_date);
CREATE INDEX IF NOT EXISTS idx_loans_status ON public.loans(loan_status, principal_status);
-- Composite index for fast scheduler scans
CREATE INDEX IF NOT EXISTS idx_loans_scheduler_lookup ON public.loans(loan_status, principal_status, next_interest_due_date)
    WHERE loan_status = 'ACTIVE' AND principal_status = 'ACTIVE';
CREATE INDEX IF NOT EXISTS idx_loans_created_at ON public.loans(created_at DESC);

-- ------------------------------------------------------------------------------
-- Interest Dues Indexes
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_interest_dues_org_id ON public.interest_dues(organization_id);
CREATE INDEX IF NOT EXISTS idx_interest_dues_loan_id ON public.interest_dues(loan_id);
CREATE INDEX IF NOT EXISTS idx_interest_dues_borrower_id ON public.interest_dues(borrower_id);
CREATE INDEX IF NOT EXISTS idx_interest_dues_due_date ON public.interest_dues(due_date);
CREATE INDEX IF NOT EXISTS idx_interest_dues_status ON public.interest_dues(status);
-- Composite index for dues filtering and reporting
CREATE INDEX IF NOT EXISTS idx_interest_dues_org_status_due ON public.interest_dues(organization_id, status, due_date);

-- ------------------------------------------------------------------------------
-- Audit Logs Indexes
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_audit_logs_org_created ON public.audit_logs(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON public.audit_logs(entity_type, entity_id);
