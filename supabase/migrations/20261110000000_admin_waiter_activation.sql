-- ============================================================================
-- Rekik Café — Admin-Controlled Waiter Activation & RLS Enforcement
-- Migration: supabase/migrations/20261110000000_admin_waiter_activation.sql
-- ============================================================================
-- Purpose:
-- 1. Enforces that ONLY the authorized administrator can activate or deactivate
--    waiter accounts in public.staff_profiles.
-- 2. Strictly forbids waiters, cashiers, customers, or anonymous users from
--    mutating staff activation status (is_active).
-- 3. Optimizes active waiter lookups for customer floor selection via index.
-- ============================================================================

-- 1. Composite index for active waiter lookup performance
CREATE INDEX IF NOT EXISTS idx_staff_profiles_waiter_active
  ON public.staff_profiles (role, is_active);

-- 2. Enable Row-Level Security on public.staff_profiles
ALTER TABLE public.staff_profiles ENABLE ROW LEVEL SECURITY;

-- 3. Policy: Staff can read directory, customers cannot directly enumerate
DROP POLICY IF EXISTS "Staff can read staff profiles" ON public.staff_profiles;
CREATE POLICY "Staff can read staff profiles"
  ON public.staff_profiles FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_admin_or_staff()
  );

-- 4. Policy: ONLY designated Administrator can UPDATE staff profiles (is_active)
DROP POLICY IF EXISTS "Admins can update staff profiles" ON public.staff_profiles;
CREATE POLICY "Admins can update staff profiles"
  ON public.staff_profiles FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 5. Policy: ONLY designated Administrator can INSERT staff profiles
DROP POLICY IF EXISTS "Admins can insert staff profiles" ON public.staff_profiles;
CREATE POLICY "Admins can insert staff profiles"
  ON public.staff_profiles FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

-- 6. Policy: ONLY designated Administrator can DELETE staff profiles
DROP POLICY IF EXISTS "Admins can delete staff profiles" ON public.staff_profiles;
CREATE POLICY "Admins can delete staff profiles"
  ON public.staff_profiles FOR DELETE
  TO authenticated
  USING (public.is_admin());

COMMENT ON TABLE public.staff_profiles IS 'Authoritative staff directory. Active status (is_active) is strictly controlled by the Admin and determines customer order assignment eligibility.';

