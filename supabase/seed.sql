-- ==============================================================================
-- seed.sql: Demo Seed Data for LendFlow
-- Includes the exact acceptance test scenario: Arun Kumar ₹10,000 @ 5% every 30 days
-- ==============================================================================

DO $$
DECLARE
    v_user_id UUID := '00000000-0000-0000-0000-000000000001';
    v_org_id UUID := '11111111-1111-1111-1111-111111111111';
    v_borrower_arun UUID := '22222222-2222-2222-2222-222222222221';
    v_borrower_priya UUID := '22222222-2222-2222-2222-222222222222';
    v_borrower_rajesh UUID := '22222222-2222-2222-2222-222222222223';
    v_loan_arun UUID := '33333333-3333-3333-3333-333333333331';
    v_loan_priya UUID := '33333333-3333-3333-3333-333333333332';
    v_loan_rajesh UUID := '33333333-3333-3333-3333-333333333333';
BEGIN
    -- 1. Insert Demo Profile and Org (assuming auth user exists or mock)
    -- In Supabase local or dev, insert dummy auth user if allowed
    BEGIN
        INSERT INTO auth.users (id, email, raw_user_meta_data)
        VALUES (v_user_id, 'demo@lendflow.app', '{"full_name": "Mukesh Murugaiyan"}'::jsonb)
        ON CONFLICT (id) DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
        NULL; -- auth schema might be restricted in some managed contexts
    END;

    INSERT INTO public.organizations (id, name, owner_id, currency, timezone)
    VALUES (v_org_id, 'Murugaiyan Capital', v_user_id, 'INR', 'Asia/Kolkata')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.organization_members (organization_id, user_id, role)
    VALUES (v_org_id, v_user_id, 'OWNER')
    ON CONFLICT (organization_id, user_id) DO NOTHING;

    INSERT INTO public.profiles (id, full_name, email, phone, default_organization_id)
    VALUES (v_user_id, 'Mukesh Murugaiyan', 'demo@lendflow.app', '+919876543210', v_org_id)
    ON CONFLICT (id) DO UPDATE SET default_organization_id = v_org_id;

    -- 2. Insert Borrowers
    -- Arun Kumar (Acceptance Scenario)
    INSERT INTO public.borrowers (
        id, organization_id, full_name, mobile_number, alternate_mobile_number,
        address, city, state, pincode, government_id_last4, government_id_masked,
        occupation, reference_name, reference_mobile, notes, created_by
    ) VALUES (
        v_borrower_arun, v_org_id, 'Arun Kumar', '+91 98401 23456', '+91 94440 12345',
        '12/4 Gandhi Street, T. Nagar', 'Chennai', 'Tamil Nadu', '600017',
        '4321', 'XXXX-XXXX-4321', 'Small Business Owner (Grocery)',
        'Ramesh Sundaram', '+91 98409 87654', 'Reliable monthly payer, operates provision store',
        v_user_id
    ) ON CONFLICT (id) DO NOTHING;

    -- Priya Sharma
    INSERT INTO public.borrowers (
        id, organization_id, full_name, mobile_number, alternate_mobile_number,
        address, city, state, pincode, government_id_last4, government_id_masked,
        occupation, reference_name, reference_mobile, notes, created_by
    ) VALUES (
        v_borrower_priya, v_org_id, 'Priya Sharma', '+91 98112 34567', NULL,
        '45 Indiranagar, 100ft Road', 'Bengaluru', 'Karnataka', '560038',
        '8899', 'XXXX-XXXX-8899', 'Tailoring Shop Owner',
        'Suresh Sharma', '+91 98119 99999', 'Excellent repayment history',
        v_user_id
    ) ON CONFLICT (id) DO NOTHING;

    -- Rajesh Patel (Fully paid example)
    INSERT INTO public.borrowers (
        id, organization_id, full_name, mobile_number, alternate_mobile_number,
        address, city, state, pincode, government_id_last4, government_id_masked,
        occupation, reference_name, reference_mobile, notes, created_by
    ) VALUES (
        v_borrower_rajesh, v_org_id, 'Rajesh Patel', '+91 98223 45678', NULL,
        '78 Navrangpura', 'Ahmedabad', 'Gujarat', '380009',
        '1122', 'XXXX-XXXX-1122', 'Wholesale Merchant',
        'Kiran Patel', '+91 98220 00000', 'Loan fully cleared',
        v_user_id
    ) ON CONFLICT (id) DO NOTHING;

    -- 3. Insert Loans
    -- Arun Kumar Loan: ₹10,000, 5%, 30 days, start 2026-09-25, first due 2026-10-25
    INSERT INTO public.loans (
        id, organization_id, borrower_id, principal_amount, interest_rate,
        interest_type, interest_interval_days, loan_start_date, first_interest_due_date,
        next_interest_due_date, principal_status, loan_status, created_by, notes
    ) VALUES (
        v_loan_arun, v_org_id, v_borrower_arun, 10000.00, 5.0000,
        'SIMPLE', 30, '2026-09-25', '2026-10-25',
        '2026-10-25', 'ACTIVE', 'ACTIVE', v_user_id,
        'Acceptance test loan. Monthly ₹500 interest.'
    ) ON CONFLICT (id) DO NOTHING;

    -- Priya Sharma Loan: ₹50,000, 3%, 30 days, started 2026-06-01
    INSERT INTO public.loans (
        id, organization_id, borrower_id, principal_amount, interest_rate,
        interest_type, interest_interval_days, loan_start_date, first_interest_due_date,
        next_interest_due_date, principal_status, loan_status, created_by, notes
    ) VALUES (
        v_loan_priya, v_org_id, v_borrower_priya, 50000.00, 3.0000,
        'SIMPLE', 30, '2026-06-01', '2026-07-01',
        '2026-10-01', 'ACTIVE', 'ACTIVE', v_user_id,
        '3 periods paid, upcoming October due'
    ) ON CONFLICT (id) DO NOTHING;

    -- Rajesh Patel Loan: ₹25,000, CLOSED / FULLY_PAID
    INSERT INTO public.loans (
        id, organization_id, borrower_id, principal_amount, interest_rate,
        interest_type, interest_interval_days, loan_start_date, first_interest_due_date,
        next_interest_due_date, principal_status, loan_status, closed_at, created_by, notes
    ) VALUES (
        v_loan_rajesh, v_org_id, v_borrower_rajesh, 25000.00, 4.0000,
        'SIMPLE', 30, '2026-01-10', '2026-02-10',
        '2026-05-10', 'FULLY_PAID', 'CLOSED', '2026-05-12 10:30:00+05:30', v_user_id,
        'Principal received via NEFT. Account closed.'
    ) ON CONFLICT (id) DO NOTHING;

    -- 4. Sample Interest Dues for Priya Sharma
    INSERT INTO public.interest_dues (
        organization_id, loan_id, borrower_id, due_number, period_start_date, due_date,
        principal_amount, interest_rate, interest_amount, status, paid_at, paid_amount, payment_note
    ) VALUES
    (v_org_id, v_loan_priya, v_borrower_priya, 1, '2026-06-01', '2026-07-01', 50000.00, 3.00, 1500.00, 'PAID', '2026-07-01 14:00:00+05:30', 1500.00, 'Paid via UPI'),
    (v_org_id, v_loan_priya, v_borrower_priya, 2, '2026-07-01', '2026-07-31', 50000.00, 3.00, 1500.00, 'PAID', '2026-08-01 11:20:00+05:30', 1500.00, 'Cash collection'),
    (v_org_id, v_loan_priya, v_borrower_priya, 3, '2026-07-31', '2026-08-30', 50000.00, 3.00, 1500.00, 'PAID', '2026-08-30 18:45:00+05:30', 1500.00, 'GPay transfer')
    ON CONFLICT (loan_id, due_date) DO NOTHING;

END $$;
