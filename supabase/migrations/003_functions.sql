-- ==============================================================================
-- 003_functions.sql: Centralized PostgreSQL Functions and RPCs
-- Financial calculations, idempotent generation, state management, audit logging
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Financial Calculation Helper: Interest Amount
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
    -- Standard simple interest for the period: Principal * Rate / 100
    RETURN ROUND((p_principal * p_rate / 100.0)::NUMERIC, 2);
END;
$$;

-- ------------------------------------------------------------------------------
-- 2. Due Date Calculation Helper
-- ------------------------------------------------------------------------------
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

-- ------------------------------------------------------------------------------
-- 3. Automatic Interest Due Generation Function
-- Idempotent, safe for multiple runs, handles overdue catches, atomic
-- ------------------------------------------------------------------------------
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
    -- Loop through active loans whose next due date is on or before p_as_of_date
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

        -- Process up to p_as_of_date (handles missed/accumulated intervals)
        WHILE v_next_due <= p_as_of_date LOOP
            -- Determine due_number and period_start_date
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

            -- Attempt insert with ON CONFLICT DO NOTHING for complete idempotency
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

                -- Log in audit
                INSERT INTO public.audit_logs (
                    organization_id,
                    user_id,
                    action,
                    entity_type,
                    entity_id,
                    new_data
                ) VALUES (
                    v_loan.organization_id,
                    NULL, -- System generated
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

            -- Advance next due date
            v_next_due := public.calculate_next_due_date(v_next_due, v_loan.interest_interval_days, v_loan.interest_type);
        END LOOP;

        -- Update loan's next_interest_due_date to the first future due date
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

-- ------------------------------------------------------------------------------
-- 4. Mark Interest as Paid (RPC)
-- ------------------------------------------------------------------------------
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

    -- Audit log
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

-- ------------------------------------------------------------------------------
-- 5. Reverse Interest Payment (RPC)
-- ------------------------------------------------------------------------------
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

    -- Audit log
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

-- ------------------------------------------------------------------------------
-- 6. Close Loan (Principal Fully Paid) (RPC)
-- ------------------------------------------------------------------------------
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

    IF v_loan.loan_status = 'CLOSED' AND v_loan.principal_status = 'FULLY_PAID' THEN
        RAISE EXCEPTION 'Loan is already closed and fully paid';
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

    -- Audit log
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

-- ------------------------------------------------------------------------------
-- 7. Reopen Loan (RPC)
-- ------------------------------------------------------------------------------
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

    IF v_loan.loan_status = 'ACTIVE' AND v_loan.principal_status = 'ACTIVE' THEN
        RAISE EXCEPTION 'Loan is already active';
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

    -- Audit log
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

-- ------------------------------------------------------------------------------
-- 8. Dashboard Summary RPC
-- ------------------------------------------------------------------------------
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
    -- Loan counts & principals
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

    -- Interest dues aggregate
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

    -- Active borrowers count (borrowers with at least one active loan)
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
-- 9. Automatic Profile & Org creation on User Signup
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_org_id UUID;
    v_full_name TEXT;
BEGIN
    v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1), 'Lender');

    -- Create default organization
    INSERT INTO public.organizations (name, owner_id)
    VALUES (v_full_name || '''s Lending', NEW.id)
    RETURNING id INTO v_org_id;

    -- Add as owner member
    INSERT INTO public.organization_members (organization_id, user_id, role)
    VALUES (v_org_id, NEW.id, 'OWNER');

    -- Create profile
    INSERT INTO public.profiles (id, full_name, email, phone, default_organization_id)
    VALUES (NEW.id, v_full_name, NEW.email, NEW.phone, v_org_id);

    RETURN NEW;
END;
$$;

-- Create trigger on auth.users if possible
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
