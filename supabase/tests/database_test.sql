-- ==============================================================================
-- database_test.sql: Automated test suite for LendFlow PostgreSQL functions
-- Tests: Interest calculation, Idempotent generation, Duplicate prevention,
--        Mark Paid, Reverse Payment, Close Loan, Reopen Loan.
-- ==============================================================================

DO $$
DECLARE
    v_calc NUMERIC;
    v_org_id UUID;
    v_user_id UUID;
    v_borrower_id UUID;
    v_loan_id UUID;
    v_gen_result JSONB;
    v_due_count INT;
    v_due_id UUID;
    v_due_status TEXT;
    v_paid_amt NUMERIC;
    v_loan_status TEXT;
    v_principal_status TEXT;
BEGIN
    RAISE NOTICE '---------------------------------------------------------';
    RAISE NOTICE 'STARTING LENDFLOW DATABASE TEST SUITE';
    RAISE NOTICE '---------------------------------------------------------';

    -- TEST 1: Interest Calculation Function
    v_calc := public.calculate_interest_amount(10000.00, 5.00);
    ASSERT v_calc = 500.00, 'Test 1 Failed: ₹10,000 at 5% should equal ₹500.00, got ' || v_calc;
    
    v_calc := public.calculate_interest_amount(25000.00, 3.50);
    ASSERT v_calc = 875.00, 'Test 1b Failed: ₹25,000 at 3.5% should equal ₹875.00, got ' || v_calc;
    RAISE NOTICE '✓ TEST 1 PASSED: calculate_interest_amount is exact and accurate';

    -- Setup mock environment for functional tests
    v_user_id := gen_random_uuid();
    v_org_id := gen_random_uuid();
    
    INSERT INTO public.organizations (id, name, owner_id)
    VALUES (v_org_id, 'Test Org', v_user_id);

    INSERT INTO public.borrowers (
        id, organization_id, full_name, mobile_number, government_id_last4, government_id_masked
    ) VALUES (
        gen_random_uuid(), v_org_id, 'Test Borrower Arun', '9840011111', '4321', 'XXXX-XXXX-4321'
    ) RETURNING id INTO v_borrower_id;

    -- Create loan: 10,000 @ 5% for 30 days, start 2026-09-25, first due 2026-10-25
    INSERT INTO public.loans (
        id, organization_id, borrower_id, principal_amount, interest_rate,
        interest_interval_days, loan_start_date, first_interest_due_date,
        next_interest_due_date, principal_status, loan_status
    ) VALUES (
        gen_random_uuid(), v_org_id, v_borrower_id, 10000.00, 5.00,
        30, '2026-09-25', '2026-10-25', '2026-10-25', 'ACTIVE', 'ACTIVE'
    ) RETURNING id INTO v_loan_id;

    -- TEST 2: Automated generation as of 2026-10-25
    v_gen_result := public.generate_due_interest_records('2026-10-25');
    
    SELECT COUNT(*), id, status INTO v_due_count, v_due_id, v_due_status
    FROM public.interest_dues
    WHERE loan_id = v_loan_id
    GROUP BY id, status;

    ASSERT v_due_count = 1, 'Test 2 Failed: exactly 1 due record should be created';
    ASSERT v_due_status = 'UNPAID', 'Test 2 Failed: initial due record status should be UNPAID';
    RAISE NOTICE '✓ TEST 2 PASSED: 1 due record created with status UNPAID as of 2026-10-25';

    -- TEST 3: Duplicate Prevention / Idempotency Test
    -- Run scheduler again for same date
    v_gen_result := public.generate_due_interest_records('2026-10-25');

    SELECT COUNT(*) INTO v_due_count
    FROM public.interest_dues
    WHERE loan_id = v_loan_id;

    ASSERT v_due_count = 1, 'Test 3 Failed: duplicate due records were created on repeated scheduler run!';
    RAISE NOTICE '✓ TEST 3 PASSED: Idempotency verified. Zero duplicates created on repeated execution.';

    -- TEST 4: Mark Interest as Paid
    PERFORM public.mark_interest_paid(v_due_id, 500.00, 'UPI Ref #123456');

    SELECT status, paid_amount INTO v_due_status, v_paid_amt
    FROM public.interest_dues
    WHERE id = v_due_id;

    ASSERT v_due_status = 'PAID', 'Test 4 Failed: status should be PAID';
    ASSERT v_paid_amt = 500.00, 'Test 4 Failed: paid_amount should be 500.00';
    RAISE NOTICE '✓ TEST 4 PASSED: Mark interest as paid confirmed with correct amount';

    -- TEST 5: Reverse Payment
    PERFORM public.reverse_interest_payment(v_due_id, 'Mistaken entry');

    SELECT status, paid_amount INTO v_due_status, v_paid_amt
    FROM public.interest_dues
    WHERE id = v_due_id;

    ASSERT v_due_status = 'UNPAID', 'Test 5 Failed: status should be reverted to UNPAID';
    ASSERT v_paid_amt IS NULL, 'Test 5 Failed: paid_amount should be cleared to NULL';
    RAISE NOTICE '✓ TEST 5 PASSED: Reversal safely restored record to UNPAID without deleting';

    -- TEST 6: Close Loan (Principal Fully Paid)
    PERFORM public.close_loan(v_loan_id, 'Closed by lender');

    SELECT loan_status, principal_status INTO v_loan_status, v_principal_status
    FROM public.loans
    WHERE id = v_loan_id;

    ASSERT v_loan_status = 'CLOSED', 'Test 6 Failed: loan_status should be CLOSED';
    ASSERT v_principal_status = 'FULLY_PAID', 'Test 6 Failed: principal_status should be FULLY_PAID';

    -- Run scheduler on future date (2026-11-25) to verify no future records are generated for closed loan
    PERFORM public.generate_due_interest_records('2026-11-25');

    SELECT COUNT(*) INTO v_due_count
    FROM public.interest_dues
    WHERE loan_id = v_loan_id;

    ASSERT v_due_count = 1, 'Test 6b Failed: scheduler generated interest on a CLOSED loan!';
    RAISE NOTICE '✓ TEST 6 PASSED: Loan closed; scheduler stopped generating future interest records';

    -- TEST 7: Reopen Loan
    PERFORM public.reopen_loan(v_loan_id, 'Reopened');

    SELECT loan_status, principal_status INTO v_loan_status, v_principal_status
    FROM public.loans
    WHERE id = v_loan_id;

    ASSERT v_loan_status = 'ACTIVE', 'Test 7 Failed: loan_status should be ACTIVE';
    ASSERT v_principal_status = 'ACTIVE', 'Test 7 Failed: principal_status should be ACTIVE';

    -- Now run scheduler on 2026-11-25
    PERFORM public.generate_due_interest_records('2026-11-25');

    SELECT COUNT(*) INTO v_due_count
    FROM public.interest_dues
    WHERE loan_id = v_loan_id;

    ASSERT v_due_count = 2, 'Test 7b Failed: reopened loan should generate the next due record (expected 2 records, got ' || v_due_count || ')';
    RAISE NOTICE '✓ TEST 7 PASSED: Reopened loan safely resumed interest generation from next due date';

    RAISE NOTICE '---------------------------------------------------------';
    RAISE NOTICE 'ALL LENDFLOW DATABASE TESTS COMPLETED SUCCESSFULLY!';
    RAISE NOTICE '---------------------------------------------------------';

    -- Cleanup test data
    DELETE FROM public.organizations WHERE id = v_org_id;
END $$;
