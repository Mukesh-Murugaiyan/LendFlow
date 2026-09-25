-- ==============================================================================
-- 002_rls.sql: Row Level Security (RLS) Policies
-- Strict multi-tenant security for LendFlow
-- ==============================================================================

-- Enable RLS on all tables
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.borrowers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interest_dues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- Helper function to check organization membership securely
-- ------------------------------------------------------------------------------
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

-- ------------------------------------------------------------------------------
-- 1. PROFILES POLICIES
-- ------------------------------------------------------------------------------
CREATE POLICY "Users can view their own profile"
    ON public.profiles
    FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
    ON public.profiles
    FOR UPDATE
    USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile"
    ON public.profiles
    FOR INSERT
    WITH CHECK (auth.uid() = id);

-- ------------------------------------------------------------------------------
-- 2. ORGANIZATIONS POLICIES
-- ------------------------------------------------------------------------------
CREATE POLICY "Members can view their organizations"
    ON public.organizations
    FOR SELECT
    USING (public.user_has_org_access(id) OR owner_id = auth.uid());

CREATE POLICY "Authenticated users can create organizations"
    ON public.organizations
    FOR INSERT
    WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Owners and Admins can update their organization"
    ON public.organizations
    FOR UPDATE
    USING (public.user_has_org_access(id, ARRAY['OWNER', 'ADMIN']) OR owner_id = auth.uid());

-- ------------------------------------------------------------------------------
-- 3. ORGANIZATION MEMBERS POLICIES
-- ------------------------------------------------------------------------------
CREATE POLICY "Members can view fellow members in same org"
    ON public.organization_members
    FOR SELECT
    USING (public.user_has_org_access(organization_id));

CREATE POLICY "Owners can manage organization members"
    ON public.organization_members
    FOR ALL
    USING (public.user_has_org_access(organization_id, ARRAY['OWNER']));

-- ------------------------------------------------------------------------------
-- 4. BORROWERS POLICIES
-- ------------------------------------------------------------------------------
CREATE POLICY "Org members can view borrowers"
    ON public.borrowers
    FOR SELECT
    USING (public.user_has_org_access(organization_id));

CREATE POLICY "Org members can create borrowers"
    ON public.borrowers
    FOR INSERT
    WITH CHECK (public.user_has_org_access(organization_id, ARRAY['OWNER', 'ADMIN', 'COLLECTOR']));

CREATE POLICY "Org members can update borrowers"
    ON public.borrowers
    FOR UPDATE
    USING (public.user_has_org_access(organization_id, ARRAY['OWNER', 'ADMIN', 'COLLECTOR']));

CREATE POLICY "Org admins/owners can delete borrowers"
    ON public.borrowers
    FOR DELETE
    USING (public.user_has_org_access(organization_id, ARRAY['OWNER', 'ADMIN']));

-- ------------------------------------------------------------------------------
-- 5. LOANS POLICIES
-- ------------------------------------------------------------------------------
CREATE POLICY "Org members can view loans"
    ON public.loans
    FOR SELECT
    USING (public.user_has_org_access(organization_id));

CREATE POLICY "Org members can insert loans"
    ON public.loans
    FOR INSERT
    WITH CHECK (public.user_has_org_access(organization_id, ARRAY['OWNER', 'ADMIN', 'COLLECTOR']));

CREATE POLICY "Org members can update loans"
    ON public.loans
    FOR UPDATE
    USING (public.user_has_org_access(organization_id, ARRAY['OWNER', 'ADMIN', 'COLLECTOR']));

-- ------------------------------------------------------------------------------
-- 6. INTEREST DUES POLICIES
-- ------------------------------------------------------------------------------
CREATE POLICY "Org members can view interest dues"
    ON public.interest_dues
    FOR SELECT
    USING (public.user_has_org_access(organization_id));

CREATE POLICY "Org members can insert/update interest dues"
    ON public.interest_dues
    FOR ALL
    USING (public.user_has_org_access(organization_id, ARRAY['OWNER', 'ADMIN', 'COLLECTOR']));

-- ------------------------------------------------------------------------------
-- 7. AUDIT LOGS POLICIES
-- ------------------------------------------------------------------------------
CREATE POLICY "Org members can view audit logs"
    ON public.audit_logs
    FOR SELECT
    USING (public.user_has_org_access(organization_id));

CREATE POLICY "System can insert audit logs"
    ON public.audit_logs
    FOR INSERT
    WITH CHECK (public.user_has_org_access(organization_id));
