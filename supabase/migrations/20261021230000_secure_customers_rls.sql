-- ============================================================================
-- Rekik Café — Secure Customers Table RLS Policies
-- Migration: 20261021230000_secure_customers_rls.sql
-- ============================================================================
-- Ensures:
-- 1. Authenticated customers can read, insert, and update ONLY their own record
--    linked to their auth.uid() (user_id = auth.uid()).
-- 2. Prevents customers from creating profiles owned by another user.
-- 3. Anonymous direct INSERT/SELECT/UPDATE on customers remains disabled.
--    Guest orders are securely processed through the validated backend API.
-- ============================================================================

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

-- 1. SELECT Policy
DROP POLICY IF EXISTS "Customers can read own record" ON public.customers;
CREATE POLICY "Customers can read own record"
  ON public.customers FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_admin_or_staff()
  );

-- 2. INSERT Policy
DROP POLICY IF EXISTS "Customers can insert own record" ON public.customers;
DROP POLICY IF EXISTS "Allow guest and customer insert" ON public.customers;
CREATE POLICY "Customers can insert own record"
  ON public.customers FOR INSERT
  TO authenticated
  WITH CHECK (
    (user_id IS NOT NULL AND user_id = auth.uid())
    OR public.is_admin_or_staff()
  );

-- 3. UPDATE Policy
DROP POLICY IF EXISTS "Customers can update own record" ON public.customers;
CREATE POLICY "Customers can update own record"
  ON public.customers FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_admin_or_staff()
  )
  WITH CHECK (
    user_id = auth.uid()
    OR public.is_admin_or_staff()
  );
