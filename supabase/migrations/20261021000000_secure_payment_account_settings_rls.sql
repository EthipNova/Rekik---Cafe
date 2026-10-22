-- ============================================================================
-- Rekik Café / Rekik Coffee — Secure Payment Account Settings RLS & Initial Seed
-- Migration: 20261021000000_secure_payment_account_settings_rls.sql
-- ============================================================================
-- Objective:
-- 1. Ensure public.is_admin() helper exists for strict administrator privilege checks.
-- 2. Enforce Row-Level Security on public.payment_account_settings:
--    - Public / Customers / Checkout: can read active payment accounts (is_active = true).
--    - Waiters & Cashiers: cannot modify payment account settings.
--    - Authorized Administrators: can SELECT, INSERT, UPDATE, and DELETE settings.
-- 3. Provide non-destructive initial setup if table is currently empty.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Ensure public.is_admin() Security Definer Function Exists
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_is_active boolean;
  v_staff_role text;
  v_user_role text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  -- 1. Check public.staff_profiles
  SELECT sp.is_active, LOWER(sp.role::text)
  INTO v_is_active, v_staff_role
  FROM public.staff_profiles sp
  WHERE sp.user_id = auth.uid()
  LIMIT 1;

  IF FOUND THEN
    IF v_is_active IS NOT TRUE THEN
      RETURN false;
    END IF;
    IF v_staff_role IN ('admin', 'manager', 'owner') THEN
      RETURN true;
    END IF;
    RETURN false;
  END IF;

  -- 2. Fallback check: public.users
  SELECT UPPER(u.role::text)
  INTO v_user_role
  FROM public.users u
  WHERE u.id = auth.uid()
  LIMIT 1;

  IF FOUND AND v_user_role = 'ADMIN' THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 2. Row-Level Security on public.payment_account_settings
-- ----------------------------------------------------------------------------
ALTER TABLE public.payment_account_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view active payment accounts" ON public.payment_account_settings;
DROP POLICY IF EXISTS "Staff and admin can view all payment accounts" ON public.payment_account_settings;
DROP POLICY IF EXISTS "Admins can manage payment account settings" ON public.payment_account_settings;

-- 2.1 Public read policy: Anyone (including customers & checkout) can read active accounts
CREATE POLICY "Public can view active payment accounts"
  ON public.payment_account_settings FOR SELECT
  TO anon, authenticated
  USING (is_active = true OR public.is_admin());

-- 2.2 Admin management policy: Only authorized administrators can insert/update/delete
CREATE POLICY "Admins can manage payment account settings"
  ON public.payment_account_settings FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ----------------------------------------------------------------------------
-- 3. Initial Seed: Insert default accounts only if table is empty
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.payment_account_settings LIMIT 1) THEN
    INSERT INTO public.payment_account_settings (
      payment_method,
      account_number,
      account_owner_name,
      is_active,
      created_at,
      updated_at
    ) VALUES
      ('telebirr', '0911 234 567', 'Rekik Coffee', true, now(), now()),
      ('cbe', '1000 2345 67890', 'Rekik Coffee', true, now(), now())
    ON CONFLICT (payment_method) DO NOTHING;
  END IF;
END $$;
