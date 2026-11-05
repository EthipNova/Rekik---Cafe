-- ============================================================================
-- Rekik Café — Single Admin Access Control & Expense Management Migration
-- File: supabase/migrations/20261030180000_single_admin_and_expenses.sql
-- ============================================================================
-- 1. Strictly enforce single-admin architecture for Rekik Café:
--    - Exactly ONE designated administrator account:
--        UUID:  e145d152-0ecb-43d6-863c-06fa40c12db4
--        Email: kbstar77sisay@gmail.com
--    - Hardened public.is_admin() Security Definer function that permits ONLY
--      the designated administrator account.
--    - Database-level unique partial indexes and triggers preventing creation,
--      promotion, or registration of any second administrator account.
-- 2. Expense Management Module:
--    - public.expenses table with categorization, amounts, dates, payment methods,
--      receipt proofs, and audit timestamps.
--    - Row-Level Security policies restricting expense management strictly to
--      the designated administrator (via public.is_admin()).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Hardened Single-Admin Authorization Function: public.is_admin()
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_designated_admin_id CONSTANT uuid := 'e145d152-0ecb-43d6-863c-06fa40c12db4'::uuid;
  v_is_active boolean;
  v_staff_role text;
  v_user_role text;
BEGIN
  -- Strict guard 1: Reject unauthenticated callers
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  -- Strict guard 2: Only the designated admin UUID can ever evaluate as admin
  IF auth.uid() <> v_designated_admin_id THEN
    RETURN false;
  END IF;

  -- Verify active profile in staff_profiles
  SELECT sp.is_active, LOWER(sp.role::text)
  INTO v_is_active, v_staff_role
  FROM public.staff_profiles sp
  WHERE sp.user_id = auth.uid()
  LIMIT 1;

  IF FOUND THEN
    IF v_is_active IS TRUE AND v_staff_role = 'admin' THEN
      RETURN true;
    END IF;
    RETURN false;
  END IF;

  -- Fallback check in public.users
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
-- 2. Database Constraints & Triggers to Enforce Single-Admin Invariant
-- ----------------------------------------------------------------------------

-- Unique partial index on staff_profiles ensuring at most ONE row can have role = 'admin'
CREATE UNIQUE INDEX IF NOT EXISTS idx_single_admin_staff_unique
  ON public.staff_profiles ((role = 'admin'))
  WHERE role = 'admin';

-- Unique partial index on users ensuring at most ONE row can have role = 'ADMIN'
CREATE UNIQUE INDEX IF NOT EXISTS idx_single_admin_users_unique
  ON public.users ((role = 'ADMIN'))
  WHERE role = 'ADMIN';

-- Trigger function to prohibit any non-designated user from receiving the admin role
CREATE OR REPLACE FUNCTION public.prevent_additional_admin_accounts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_designated_admin_id CONSTANT uuid := 'e145d152-0ecb-43d6-863c-06fa40c12db4'::uuid;
BEGIN
  IF TG_TABLE_NAME = 'staff_profiles' THEN
    IF LOWER(NEW.role::text) = 'admin' AND NEW.user_id <> v_designated_admin_id THEN
      RAISE EXCEPTION 'Single Admin Policy: Only the designated administrator account (%) may hold the admin role.', v_designated_admin_id;
    END IF;
  ELSIF TG_TABLE_NAME = 'users' THEN
    IF UPPER(NEW.role::text) = 'ADMIN' AND NEW.id <> v_designated_admin_id THEN
      RAISE EXCEPTION 'Single Admin Policy: Only the designated administrator account (%) may hold the ADMIN role.', v_designated_admin_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_single_admin_staff ON public.staff_profiles;
CREATE TRIGGER trg_enforce_single_admin_staff
  BEFORE INSERT OR UPDATE OF role ON public.staff_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_additional_admin_accounts();

DROP TRIGGER IF EXISTS trg_enforce_single_admin_users ON public.users;
CREATE TRIGGER trg_enforce_single_admin_users
  BEFORE INSERT OR UPDATE OF role ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_additional_admin_accounts();

-- ----------------------------------------------------------------------------
-- 3. Expense Management Table: public.expenses
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  description text NOT NULL,
  category text NOT NULL,
  amount numeric(12, 2) NOT NULL CHECK (amount >= 0),
  expense_date date NOT NULL DEFAULT CURRENT_DATE,
  payment_method text NOT NULL DEFAULT 'Cash',
  receipt_url text,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_expenses_date ON public.expenses(expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON public.expenses(category);
CREATE INDEX IF NOT EXISTS idx_expenses_created_at ON public.expenses(created_at DESC);

COMMENT ON TABLE public.expenses IS 'Authoritative café operational expenses recorded by the designated administrator.';

-- Row-Level Security for public.expenses
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view expenses" ON public.expenses;
CREATE POLICY "Admins can view expenses"
  ON public.expenses FOR SELECT
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can insert expenses" ON public.expenses;
CREATE POLICY "Admins can insert expenses"
  ON public.expenses FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can update expenses" ON public.expenses;
CREATE POLICY "Admins can update expenses"
  ON public.expenses FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can delete expenses" ON public.expenses;
CREATE POLICY "Admins can delete expenses"
  ON public.expenses FOR DELETE
  TO authenticated
  USING (public.is_admin());
