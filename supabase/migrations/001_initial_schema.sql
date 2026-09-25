-- ==============================================================================
-- 001_initial_schema.sql: Core schema for LendFlow
-- Multi-tenant private lending & interest collection management
-- ==============================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ------------------------------------------------------------------------------
-- 1. ORGANIZATIONS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    currency TEXT NOT NULL DEFAULT 'INR',
    timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- ------------------------------------------------------------------------------
-- 2. ORGANIZATION MEMBERS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organization_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'OWNER' CHECK (role IN ('OWNER', 'ADMIN', 'COLLECTOR', 'VIEWER')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    UNIQUE(organization_id, user_id)
);

-- ------------------------------------------------------------------------------
-- 3. PROFILES / USER METADATA
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    default_organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- ------------------------------------------------------------------------------
-- 4. BORROWERS
-- ------------------------------------------------------------------------------
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

-- ------------------------------------------------------------------------------
-- 5. LOANS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.loans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    borrower_id UUID NOT NULL REFERENCES public.borrowers(id) ON DELETE RESTRICT,
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

-- ------------------------------------------------------------------------------
-- 6. INTEREST DUES
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.interest_dues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    loan_id UUID NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
    borrower_id UUID NOT NULL REFERENCES public.borrowers(id) ON DELETE RESTRICT,
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

-- ------------------------------------------------------------------------------
-- 7. AUDIT LOGS
-- ------------------------------------------------------------------------------
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
