-- ============================================================================
-- Rekik Café — Phase 3: Secure Staff Registration, Role Hierarchy & Management
-- Migration: 20261020030000_secure_staff_registration.sql
-- ============================================================================
-- Objectives:
-- 1. Create a hardened, SECURITY DEFINER public.is_admin() helper function:
--    a. Strictly rejects unauthenticated callers (auth.uid() IS NULL).
--    b. Primary check: public.staff_profiles for the authenticated caller:
--       - Inactive accounts (is_active IS NOT TRUE) are IMMEDIATELY DENIED (return false).
--       - Active accounts with role IN ('admin', 'owner', 'manager') are GRANTED (return true).
--       - Waiters, cashiers, kitchen staff, and others are DENIED (return false).
--    c. Fallback check: public.users is checked ONLY if no staff profile exists:
--       - Users with role 'ADMIN' are GRANTED (return true).
--       - Users with role 'STAFF' or 'CUSTOMER' are DENIED (return false).
--    d. Fixed search_path = public, pg_temp prevents search path manipulation.
-- 2. Schema enhancements to public.staff_profiles:
--    a. Add email column (nullable, text) if not exists to support direct staff listing.
--    b. Backfill existing staff emails from public.users.
--    c. Add foreign key from staff_profiles(user_id) to auth.users(id) if not present.
--    d. Add performance indexes on user_id, role, is_active, and email.
-- 3. Granular, least-privilege Row-Level Security (RLS) policies on public.staff_profiles:
--    - SELECT: Allowed for active staff/admins via public.is_admin_or_staff() OR own profile.
--    - INSERT: Restricted strictly to authorized administrators via public.is_admin().
--    - UPDATE: Restricted strictly to authorized administrators via public.is_admin().
--    - DELETE: Restricted strictly to authorized administrators via public.is_admin().
--    - Completely blocks anonymous users, ordinary customers, active waiters, and cashiers
--      from registering staff or changing active statuses.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Hardened SECURITY DEFINER Helper: public.is_admin()
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
  -- 1. Strictly reject unauthenticated / anonymous callers
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  -- 2. Inspect public.staff_profiles for authenticated user
  SELECT sp.is_active, LOWER(sp.role::text)
  INTO v_is_active, v_staff_role
  FROM public.staff_profiles sp
  WHERE sp.user_id = auth.uid()
  LIMIT 1;

  -- 3. If a staff profile exists:
  IF FOUND THEN
    -- Inactive staff must never possess administrative authority
    IF v_is_active IS NOT TRUE THEN
      RETURN false;
    END IF;

    -- Only explicitly authorized administrative tiers
    IF v_staff_role IN ('admin', 'owner', 'manager') THEN
      RETURN true;
    END IF;

    -- Operational staff (waiters, cashiers, kitchen) are strictly NOT administrators
    RETURN false;
  END IF;

  -- 4. Fallback: inspect public.users ONLY if no staff profile exists
  SELECT UPPER(u.role::text)
  INTO v_user_role
  FROM public.users u
  WHERE u.id = auth.uid()
  LIMIT 1;

  IF FOUND AND v_user_role = 'ADMIN' THEN
    RETURN true;
  END IF;

  -- 5. Default deny for customers, staff, and unknown users
  RETURN false;
END;
$$;

-- Grant execution privileges
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 2. Schema Enhancements & Foreign Key Integrity on public.staff_profiles
-- ----------------------------------------------------------------------------
-- Ensure email column exists on public.staff_profiles
ALTER TABLE public.staff_profiles
  ADD COLUMN IF NOT EXISTS email text;

-- Backfill email from public.users where available
UPDATE public.staff_profiles sp
SET email = u.email
FROM public.users u
WHERE sp.user_id = u.id
  AND (sp.email IS NULL OR sp.email = '');

-- Ensure foreign key constraint from public.staff_profiles(user_id) to auth.users(id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'staff_profiles_user_id_auth_fkey'
  ) THEN
    -- Wrap in exception block in case of orphaned test records in developer instances
    BEGIN
      ALTER TABLE public.staff_profiles
        ADD CONSTRAINT staff_profiles_user_id_auth_fkey
        FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Skipping staff_profiles_user_id_auth_fkey constraint creation: %', SQLERRM;
    END;
  END IF;
END $$;

-- Indexes for staff profile query performance and role lookups
CREATE INDEX IF NOT EXISTS idx_staff_profiles_user_id
  ON public.staff_profiles(user_id);

CREATE INDEX IF NOT EXISTS idx_staff_profiles_role
  ON public.staff_profiles(role);

CREATE INDEX IF NOT EXISTS idx_staff_profiles_is_active
  ON public.staff_profiles(is_active);

CREATE INDEX IF NOT EXISTS idx_staff_profiles_email
  ON public.staff_profiles(email);

-- ----------------------------------------------------------------------------
-- 3. Least-Privilege Row-Level Security Policies on public.staff_profiles
-- ----------------------------------------------------------------------------
ALTER TABLE public.staff_profiles ENABLE ROW LEVEL SECURITY;

-- 3a. SELECT: Staff can read their own profile, and active staff/admins can view directory
DROP POLICY IF EXISTS "Staff can read staff profiles" ON public.staff_profiles;
CREATE POLICY "Staff can read staff profiles"
  ON public.staff_profiles FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_admin_or_staff()
  );

-- 3b. INSERT: Only authorized active administrators can register staff accounts
DROP POLICY IF EXISTS "Admins can insert staff profiles" ON public.staff_profiles;
CREATE POLICY "Admins can insert staff profiles"
  ON public.staff_profiles FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

-- 3c. UPDATE: Only authorized active administrators can modify staff profiles or statuses
DROP POLICY IF EXISTS "Admins can update staff profiles" ON public.staff_profiles;
CREATE POLICY "Admins can update staff profiles"
  ON public.staff_profiles FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 3d. DELETE: Only authorized active administrators can delete staff records
DROP POLICY IF EXISTS "Admins can delete staff profiles" ON public.staff_profiles;
CREATE POLICY "Admins can delete staff profiles"
  ON public.staff_profiles FOR DELETE
  TO authenticated
  USING (public.is_admin());
