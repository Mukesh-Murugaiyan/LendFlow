-- ==============================================================================
-- LENDFLOW COMPLETE DATABASE SETUP (1-CLICK EXECUTION IN SUPABASE SQL EDITOR)
-- Project: https://ijuygzmfyjhfvwvvuyuv.supabase.co
-- Includes: Extensions, Tables, RLS, Functions, Indexes, pg_cron & Acceptance Seed
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- PART 1: EXTENSIONS & TABLES
-- ------------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    currency TEXT NOT NULL DEFAULT 'INR',
    timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS public.organization_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'OWNER' CHECK (role IN ('OWNER', 'ADMIN', 'COLLECTOR', 'VIEWER')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    UNIQUE(organization_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    default_organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS public.borrowers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    mobile_number TEXT NOT NULL,
    alternate_mobile_number TEXT,
    address TEXT,
    city TEXT,
    state TEXT,
    pincode TEXT,
    government_id_last4 VARCHAR(4),
    government_id_masked TEXT,
    occupation TEXT,
    reference_name TEXT,
    reference_mobile TEXT,
    notes TEXT,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS public.loans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    borrower_id UUID NOT NULL REFERENCES public.borrowers(id) ON DELETE CASCADE,
    principal_amount NUMERIC(14,2) NOT NULL CHECK (principal_amount > 0),
    interest_rate NUMERIC(8,4) NOT NULL CHECK (interest_rate >= 0),
    interest_type TEXT NOT NULL DEFAULT 'SIMPLE' CHECK (interest_type IN ('SIMPLE', 'MONTHLY_CALENDAR')),
    interest_interval_days INTEGER NOT NULL CHECK (interest_interval_days > 0),
    loan_start_date DATE NOT NULL,
    first_interest_due_date DATE NOT NULL,
    next_interest_due_date DATE NOT NULL,
    principal_status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (principal_status IN ('ACTIVE', 'FULLY_PAID', 'REOPENED')),
    loan_status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (loan_status IN ('ACTIVE', 'CLOSED', 'PAUSED')),
    closed_at TIMESTAMPTZ,
    notes TEXT,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS public.interest_dues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    loan_id UUID NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
    borrower_id UUID NOT NULL REFERENCES public.borrowers(id) ON DELETE CASCADE,
    due_number INTEGER NOT NULL,
    period_start_date DATE NOT NULL,
    due_date DATE NOT NULL,
    principal_amount NUMERIC(14,2) NOT NULL CHECK (principal_amount > 0),
    interest_rate NUMERIC(8,4) NOT NULL CHECK (interest_rate >= 0),
    interest_amount NUMERIC(14,2) NOT NULL CHECK (interest_amount >= 0),
    status TEXT NOT NULL DEFAULT 'UNPAID' CHECK (status IN ('UNPAID', 'PAID', 'CANCELLED')),
    paid_at TIMESTAMPTZ,
    paid_amount NUMERIC(14,2) CHECK (paid_amount IS NULL OR paid_amount >= 0),
    payment_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT unique_loan_due_date UNIQUE (loan_id, due_date)
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id UUID NOT NULL,
    old_data JSONB,
    new_data JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- ------------------------------------------------------------------------------
-- PART 2: ROW LEVEL SECURITY (RLS)
-- ------------------------------------------------------------------------------
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.borrowers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interest_dues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.user_has_org_access(check_org_id UUID, allowed_roles TEXT[] DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT (
        EXISTS (
            SELECT 1 
            FROM public.organization_members
            WHERE organization_id = check_org_id
              AND user_id = auth.uid()
              AND (allowed_roles IS NULL OR role = ANY(allowed_roles))
        )
        OR EXISTS (
            SELECT 1 
            FROM public.organizations
            WHERE id = check_org_id
              AND owner_id = auth.uid()
        )
    );
$$;

DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Members can view their organizations" ON public.organizations;
CREATE POLICY "Members can view their organizations" ON public.organizations FOR SELECT USING (public.user_has_org_access(id) OR owner_id = auth.uid());

DROP POLICY IF EXISTS "Authenticated users can create organizations" ON public.organizations;
CREATE POLICY "Authenticated users can create organizations" ON public.organizations FOR INSERT WITH CHECK (auth.uid() = owner_id);

-- Organization Members Policies
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view fellow members in same org" ON public.organization_members;
CREATE POLICY "Members can view fellow members in same org"
    ON public.organization_members FOR SELECT
    USING (public.user_has_org_access(organization_id) OR user_id = auth.uid());

DROP POLICY IF EXISTS "Owners can manage organization members" ON public.organization_members;
CREATE POLICY "Owners can manage organization members"
    ON public.organization_members FOR ALL
    USING (
        public.user_has_org_access(organization_id, ARRAY['OWNER'])
        OR EXISTS (SELECT 1 FROM public.organizations WHERE id = organization_id AND owner_id = auth.uid())
    )
    WITH CHECK (
        public.user_has_org_access(organization_id, ARRAY['OWNER'])
        OR EXISTS (SELECT 1 FROM public.organizations WHERE id = organization_id AND owner_id = auth.uid())
    );

DROP POLICY IF EXISTS "Org members can view borrowers" ON public.borrowers;
CREATE POLICY "Org members can view borrowers" ON public.borrowers FOR SELECT USING (public.user_has_org_access(organization_id));

DROP POLICY IF EXISTS "Org members can create borrowers" ON public.borrowers;
CREATE POLICY "Org members can create borrowers" ON public.borrowers FOR INSERT WITH CHECK (public.user_has_org_access(organization_id, ARRAY['OWNER', 'ADMIN', 'COLLECTOR']));

DROP POLICY IF EXISTS "Org members can update borrowers" ON public.borrowers;
CREATE POLICY "Org members can update borrowers" ON public.borrowers FOR UPDATE USING (public.user_has_org_access(organization_id, ARRAY['OWNER', 'ADMIN', 'COLLECTOR']));

DROP POLICY IF EXISTS "Org members can delete borrowers" ON public.borrowers;
CREATE POLICY "Org members can delete borrowers" ON public.borrowers FOR DELETE USING (public.user_has_org_access(organization_id, ARRAY['OWNER', 'ADMIN']));

DROP POLICY IF EXISTS "Org members can view loans" ON public.loans;
CREATE POLICY "Org members can view loans" ON public.loans FOR SELECT USING (public.user_has_org_access(organization_id));

DROP POLICY IF EXISTS "Org members can insert loans" ON public.loans;
CREATE POLICY "Org members can insert loans" ON public.loans FOR INSERT WITH CHECK (public.user_has_org_access(organization_id, ARRAY['OWNER', 'ADMIN', 'COLLECTOR']));

DROP POLICY IF EXISTS "Org members can update loans" ON public.loans;
CREATE POLICY "Org members can update loans" ON public.loans FOR UPDATE USING (public.user_has_org_access(organization_id, ARRAY['OWNER', 'ADMIN', 'COLLECTOR']));

DROP POLICY IF EXISTS "Org members can delete loans" ON public.loans;
CREATE POLICY "Org members can delete loans" ON public.loans FOR DELETE USING (public.user_has_org_access(organization_id, ARRAY['OWNER', 'ADMIN']));

DROP POLICY IF EXISTS "Org members can view interest dues" ON public.interest_dues;
CREATE POLICY "Org members can view interest dues" ON public.interest_dues FOR SELECT USING (public.user_has_org_access(organization_id));

DROP POLICY IF EXISTS "Org members can manage interest dues" ON public.interest_dues;
CREATE POLICY "Org members can manage interest dues" ON public.interest_dues FOR ALL USING (public.user_has_org_access(organization_id, ARRAY['OWNER', 'ADMIN', 'COLLECTOR']));

DROP POLICY IF EXISTS "Org members can view audit logs" ON public.audit_logs;
CREATE POLICY "Org members can view audit logs" ON public.audit_logs FOR SELECT USING (public.user_has_org_access(organization_id));

DROP POLICY IF EXISTS "System can insert audit logs" ON public.audit_logs;
CREATE POLICY "System can insert audit logs" ON public.audit_logs FOR INSERT WITH CHECK (public.user_has_org_access(organization_id));

-- ------------------------------------------------------------------------------
-- PART 3: CENTRALIZED POSTGRESQL FUNCTIONS
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.calculate_interest_amount(
    p_principal NUMERIC,
    p_rate NUMERIC
)
RETURNS NUMERIC(14,2)
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
    IF p_principal IS NULL OR p_rate IS NULL OR p_principal <= 0 OR p_rate < 0 THEN
        RETURN 0.00;
    END IF;
    RETURN ROUND((p_principal * p_rate / 100.0)::NUMERIC, 2);
END;
$$;

CREATE OR REPLACE FUNCTION public.calculate_next_due_date(
    p_current_due DATE,
    p_interval_days INTEGER,
    p_interest_type TEXT DEFAULT 'SIMPLE'
)
RETURNS DATE
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
    IF p_interest_type = 'MONTHLY_CALENDAR' THEN
        RETURN (p_current_due + INTERVAL '1 month')::DATE;
    ELSE
        RETURN p_current_due + p_interval_days;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_due_interest_records(
    p_as_of_date DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_loan RECORD;
    v_next_due DATE;
    v_period_start DATE;
    v_interest_amount NUMERIC(14,2);
    v_due_number INTEGER;
    v_records_generated INTEGER := 0;
    v_loans_processed INTEGER := 0;
    v_new_due_id UUID;
    v_last_due_date DATE;
BEGIN
    FOR v_loan IN
        SELECT 
            l.id,
            l.organization_id,
            l.borrower_id,
            l.principal_amount,
            l.interest_rate,
            l.interest_type,
            l.interest_interval_days,
            l.loan_start_date,
            l.first_interest_due_date,
            l.next_interest_due_date
        FROM public.loans l
        WHERE l.loan_status = 'ACTIVE'
          AND l.principal_status = 'ACTIVE'
          AND l.next_interest_due_date <= p_as_of_date
        ORDER BY l.next_interest_due_date ASC
        FOR UPDATE OF l
    LOOP
        v_loans_processed := v_loans_processed + 1;
        v_next_due := v_loan.next_interest_due_date;

        WHILE v_next_due <= p_as_of_date LOOP
            SELECT 
                COALESCE(MAX(due_number), 0) + 1,
                MAX(due_date)
            INTO v_due_number, v_last_due_date
            FROM public.interest_dues
            WHERE loan_id = v_loan.id;

            IF v_last_due_date IS NOT NULL THEN
                v_period_start := v_last_due_date;
            ELSE
                v_period_start := v_loan.loan_start_date;
            END IF;

            v_interest_amount := public.calculate_interest_amount(v_loan.principal_amount, v_loan.interest_rate);

            INSERT INTO public.interest_dues (
                organization_id,
                loan_id,
                borrower_id,
                due_number,
                period_start_date,
                due_date,
                principal_amount,
                interest_rate,
                interest_amount,
                status
            ) VALUES (
                v_loan.organization_id,
                v_loan.id,
                v_loan.borrower_id,
                v_due_number,
                v_period_start,
                v_next_due,
                v_loan.principal_amount,
                v_loan.interest_rate,
                v_interest_amount,
                'UNPAID'
            )
            ON CONFLICT (loan_id, due_date) DO NOTHING
            RETURNING id INTO v_new_due_id;

            IF v_new_due_id IS NOT NULL THEN
                v_records_generated := v_records_generated + 1;

                INSERT INTO public.audit_logs (
                    organization_id,
                    user_id,
                    action,
                    entity_type,
                    entity_id,
                    new_data
                ) VALUES (
                    v_loan.organization_id,
                    NULL,
                    'INTEREST_GENERATED',
                    'interest_due',
                    v_new_due_id,
                    jsonb_build_object(
                        'loan_id', v_loan.id,
                        'due_number', v_due_number,
                        'due_date', v_next_due,
                        'interest_amount', v_interest_amount,
                        'as_of_date', p_as_of_date
                    )
                );
            END IF;

            v_next_due := public.calculate_next_due_date(v_next_due, v_loan.interest_interval_days, v_loan.interest_type);
        END LOOP;

        UPDATE public.loans
        SET next_interest_due_date = v_next_due,
            updated_at = clock_timestamp()
        WHERE id = v_loan.id;

    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'as_of_date', p_as_of_date,
        'loans_processed', v_loans_processed,
        'records_generated', v_records_generated
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_interest_paid(
    p_due_id UUID,
    p_paid_amount NUMERIC DEFAULT NULL,
    p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_due RECORD;
    v_effective_amount NUMERIC(14,2);
    v_user_id UUID := auth.uid();
BEGIN
    SELECT * INTO v_due
    FROM public.interest_dues
    WHERE id = p_due_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Interest due record % not found', p_due_id;
    END IF;

    IF v_due.status = 'PAID' THEN
        RAISE EXCEPTION 'Interest due record is already marked as PAID';
    END IF;

    v_effective_amount := COALESCE(p_paid_amount, v_due.interest_amount);

    UPDATE public.interest_dues
    SET status = 'PAID',
        paid_at = clock_timestamp(),
        paid_amount = v_effective_amount,
        payment_note = COALESCE(p_note, payment_note),
        updated_at = clock_timestamp()
    WHERE id = p_due_id;

    INSERT INTO public.audit_logs (
        organization_id,
        user_id,
        action,
        entity_type,
        entity_id,
        old_data,
        new_data
    ) VALUES (
        v_due.organization_id,
        v_user_id,
        'INTEREST_MARKED_PAID',
        'interest_due',
        p_due_id,
        jsonb_build_object('status', v_due.status, 'paid_at', v_due.paid_at, 'paid_amount', v_due.paid_amount),
        jsonb_build_object('status', 'PAID', 'paid_at', clock_timestamp(), 'paid_amount', v_effective_amount, 'payment_note', p_note)
    );

    RETURN jsonb_build_object(
        'success', true,
        'id', p_due_id,
        'status', 'PAID',
        'paid_amount', v_effective_amount,
        'paid_at', clock_timestamp()
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.reverse_interest_payment(
    p_due_id UUID,
    p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_due RECORD;
    v_user_id UUID := auth.uid();
BEGIN
    SELECT * INTO v_due
    FROM public.interest_dues
    WHERE id = p_due_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Interest due record % not found', p_due_id;
    END IF;

    IF v_due.status != 'PAID' THEN
        RAISE EXCEPTION 'Only PAID records can be reversed (current status: %)', v_due.status;
    END IF;

    UPDATE public.interest_dues
    SET status = 'UNPAID',
        paid_at = NULL,
        paid_amount = NULL,
        payment_note = CASE 
            WHEN p_note IS NOT NULL THEN COALESCE(payment_note || ' | Reversal: ' || p_note, 'Reversal: ' || p_note)
            ELSE payment_note 
        END,
        updated_at = clock_timestamp()
    WHERE id = p_due_id;

    INSERT INTO public.audit_logs (
        organization_id,
        user_id,
        action,
        entity_type,
        entity_id,
        old_data,
        new_data
    ) VALUES (
        v_due.organization_id,
        v_user_id,
        'INTEREST_PAYMENT_REVERSED',
        'interest_due',
        p_due_id,
        jsonb_build_object('status', 'PAID', 'paid_at', v_due.paid_at, 'paid_amount', v_due.paid_amount),
        jsonb_build_object('status', 'UNPAID', 'paid_at', NULL, 'paid_amount', NULL, 'note', p_note)
    );

    RETURN jsonb_build_object(
        'success', true,
        'id', p_due_id,
        'status', 'UNPAID'
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.close_loan(
    p_loan_id UUID,
    p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_loan RECORD;
    v_user_id UUID := auth.uid();
    v_closed_at TIMESTAMPTZ := clock_timestamp();
BEGIN
    SELECT * INTO v_loan
    FROM public.loans
    WHERE id = p_loan_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Loan % not found', p_loan_id;
    END IF;

    UPDATE public.loans
    SET principal_status = 'FULLY_PAID',
        loan_status = 'CLOSED',
        closed_at = v_closed_at,
        notes = CASE 
            WHEN p_note IS NOT NULL THEN COALESCE(notes || E'\n' || p_note, p_note)
            ELSE notes 
        END,
        updated_at = v_closed_at
    WHERE id = p_loan_id;

    INSERT INTO public.audit_logs (
        organization_id,
        user_id,
        action,
        entity_type,
        entity_id,
        old_data,
        new_data
    ) VALUES (
        v_loan.organization_id,
        v_user_id,
        'LOAN_CLOSED',
        'loan',
        p_loan_id,
        jsonb_build_object('loan_status', v_loan.loan_status, 'principal_status', v_loan.principal_status, 'closed_at', v_loan.closed_at),
        jsonb_build_object('loan_status', 'CLOSED', 'principal_status', 'FULLY_PAID', 'closed_at', v_closed_at, 'note', p_note)
    );

    RETURN jsonb_build_object(
        'success', true,
        'id', p_loan_id,
        'loan_status', 'CLOSED',
        'principal_status', 'FULLY_PAID',
        'closed_at', v_closed_at
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.reopen_loan(
    p_loan_id UUID,
    p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_loan RECORD;
    v_user_id UUID := auth.uid();
BEGIN
    SELECT * INTO v_loan
    FROM public.loans
    WHERE id = p_loan_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Loan % not found', p_loan_id;
    END IF;

    UPDATE public.loans
    SET principal_status = 'ACTIVE',
        loan_status = 'ACTIVE',
        closed_at = NULL,
        notes = CASE 
            WHEN p_note IS NOT NULL THEN COALESCE(notes || E'\n' || 'Reopened: ' || p_note, 'Reopened: ' || p_note)
            ELSE notes 
        END,
        updated_at = clock_timestamp()
    WHERE id = p_loan_id;

    INSERT INTO public.audit_logs (
        organization_id,
        user_id,
        action,
        entity_type,
        entity_id,
        old_data,
        new_data
    ) VALUES (
        v_loan.organization_id,
        v_user_id,
        'LOAN_REOPENED',
        'loan',
        p_loan_id,
        jsonb_build_object('loan_status', v_loan.loan_status, 'principal_status', v_loan.principal_status, 'closed_at', v_loan.closed_at),
        jsonb_build_object('loan_status', 'ACTIVE', 'principal_status', 'ACTIVE', 'closed_at', NULL, 'note', p_note)
    );

    RETURN jsonb_build_object(
        'success', true,
        'id', p_loan_id,
        'loan_status', 'ACTIVE',
        'principal_status', 'ACTIVE',
        'next_interest_due_date', v_loan.next_interest_due_date
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_dashboard_summary(
    p_org_id UUID,
    p_today DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
    v_total_active_loans BIGINT;
    v_total_closed_loans BIGINT;
    v_total_principal_active NUMERIC(14,2);
    v_total_principal_given NUMERIC(14,2);
    v_total_interest_generated NUMERIC(14,2);
    v_total_interest_collected NUMERIC(14,2);
    v_total_interest_outstanding NUMERIC(14,2);
    v_interest_due_today NUMERIC(14,2);
    v_overdue_interest NUMERIC(14,2);
    v_active_borrowers BIGINT;
BEGIN
    SELECT 
        COUNT(*) FILTER (WHERE loan_status = 'ACTIVE' AND principal_status = 'ACTIVE'),
        COUNT(*) FILTER (WHERE loan_status = 'CLOSED' OR principal_status = 'FULLY_PAID'),
        COALESCE(SUM(principal_amount) FILTER (WHERE loan_status = 'ACTIVE' AND principal_status = 'ACTIVE'), 0),
        COALESCE(SUM(principal_amount), 0)
    INTO 
        v_total_active_loans,
        v_total_closed_loans,
        v_total_principal_active,
        v_total_principal_given
    FROM public.loans
    WHERE organization_id = p_org_id;

    SELECT
        COALESCE(SUM(interest_amount), 0),
        COALESCE(SUM(COALESCE(paid_amount, interest_amount)) FILTER (WHERE status = 'PAID'), 0),
        COALESCE(SUM(interest_amount) FILTER (WHERE status = 'UNPAID'), 0),
        COALESCE(SUM(interest_amount) FILTER (WHERE status = 'UNPAID' AND due_date = p_today), 0),
        COALESCE(SUM(interest_amount) FILTER (WHERE status = 'UNPAID' AND due_date < p_today), 0)
    INTO
        v_total_interest_generated,
        v_total_interest_collected,
        v_total_interest_outstanding,
        v_interest_due_today,
        v_overdue_interest
    FROM public.interest_dues
    WHERE organization_id = p_org_id;

    SELECT COUNT(DISTINCT borrower_id)
    INTO v_active_borrowers
    FROM public.loans
    WHERE organization_id = p_org_id
      AND loan_status = 'ACTIVE'
      AND principal_status = 'ACTIVE';

    RETURN jsonb_build_object(
        'total_active_loans', v_total_active_loans,
        'total_closed_loans', v_total_closed_loans,
        'total_principal_active', v_total_principal_active,
        'total_principal_given', v_total_principal_given,
        'total_interest_generated', v_total_interest_generated,
        'total_interest_collected', v_total_interest_collected,
        'total_interest_outstanding', v_total_interest_outstanding,
        'interest_due_today', v_interest_due_today,
        'overdue_interest', v_overdue_interest,
        'active_borrowers', v_active_borrowers
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- PART 4: INDEXES
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_borrowers_org_id ON public.borrowers(organization_id);
CREATE INDEX IF NOT EXISTS idx_borrowers_mobile ON public.borrowers(mobile_number);
CREATE INDEX IF NOT EXISTS idx_borrowers_city ON public.borrowers(city);
CREATE INDEX IF NOT EXISTS idx_borrowers_created_at ON public.borrowers(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_loans_org_id ON public.loans(organization_id);
CREATE INDEX IF NOT EXISTS idx_loans_borrower_id ON public.loans(borrower_id);
CREATE INDEX IF NOT EXISTS idx_loans_next_due ON public.loans(next_interest_due_date);
CREATE INDEX IF NOT EXISTS idx_loans_scheduler_lookup ON public.loans(loan_status, principal_status, next_interest_due_date)
    WHERE loan_status = 'ACTIVE' AND principal_status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS idx_interest_dues_org_id ON public.interest_dues(organization_id);
CREATE INDEX IF NOT EXISTS idx_interest_dues_loan_id ON public.interest_dues(loan_id);
CREATE INDEX IF NOT EXISTS idx_interest_dues_due_date ON public.interest_dues(due_date);
CREATE INDEX IF NOT EXISTS idx_interest_dues_status ON public.interest_dues(status);
CREATE INDEX IF NOT EXISTS idx_interest_dues_org_status_due ON public.interest_dues(organization_id, status, due_date);

CREATE INDEX IF NOT EXISTS idx_audit_logs_org_created ON public.audit_logs(organization_id, created_at DESC);

-- ------------------------------------------------------------------------------
-- PART 5: PG_CRON SCHEDULER
-- ------------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily_generate_interest_dues') THEN
        PERFORM cron.unschedule('daily_generate_interest_dues');
    END IF;
END $$;

SELECT cron.schedule(
    'daily_generate_interest_dues',
    '5 0 * * *',
    $$SELECT public.generate_due_interest_records(CURRENT_DATE);$$
);
