-- ============================================================================
-- Rekik Café — Phase 1: Secure Staff Authorization & Product Creation
-- Migration: 20261020000000_secure_staff_authorization.sql
-- ============================================================================
-- Objective:
-- 1. Upgrade public.is_admin_or_staff() as a hardened SECURITY DEFINER function:
--    a. Rejects unauthenticated callers immediately (auth.uid() IS NULL).
--    b. Primary check: public.staff_profiles for the authenticated user.
--       - If a staff profile exists and is_active is FALSE or NULL, access is
--         STRICTLY DENIED (RETURN false). It NEVER falls through to public.users.
--         This guarantees deactivated staff cannot regain access through a legacy role.
--       - If a staff profile exists and is active, access is granted ONLY for
--         explicitly approved operational roles ('admin', 'manager', 'owner',
--         'cashier', 'waiter', 'kitchen', 'staff').
--       - If a staff profile exists with an unknown/unapproved role, access is DENIED.
--    c. Fallback check: public.users is inspected ONLY when NO staff profile exists.
--       - If users.role is 'ADMIN' or 'STAFF', access is granted for legacy/unmigrated admins.
--       - Otherwise (e.g. 'CUSTOMER' or unrecognized), access is denied.
--    d. Does not rely on service_role bypass inside the function; backend service-role
--       operations already bypass RLS at the database engine level (BYPASSRLS).
-- 2. Fixed search_path = public, pg_temp and SECURITY DEFINER prevent search-path
--    hijacking and recursive RLS evaluations.
-- 3. Granular, non-destructive RLS policies on public.products, public.staff_profiles,
--    and storage.objects for 'product-images'.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Secure Forward-Only Definition of public.is_admin_or_staff()
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin_or_staff()
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

  -- 2. Inspect public.staff_profiles for the authenticated user
  SELECT sp.is_active, LOWER(sp.role::text)
  INTO v_is_active, v_staff_role
  FROM public.staff_profiles sp
  WHERE sp.user_id = auth.uid()
  LIMIT 1;

  -- 3. If a staff profile exists:
  IF FOUND THEN
    -- If marked inactive (or NULL), access is denied immediately.
    -- Strict guard: do NOT fall through to public.users.
    IF v_is_active IS NOT TRUE THEN
      RETURN false;
    END IF;

    -- If active, allow only explicitly authorized operational roles
    IF v_staff_role IN ('admin', 'manager', 'owner', 'cashier', 'waiter', 'kitchen', 'staff') THEN
      RETURN true;
    END IF;

    -- Unapproved / unrecognized staff role: deny immediately
    RETURN false;
  END IF;

  -- 4. Fallback: inspect public.users ONLY if no staff profile exists
  SELECT UPPER(u.role::text)
  INTO v_user_role
  FROM public.users u
  WHERE u.id = auth.uid()
  LIMIT 1;

  IF FOUND AND v_user_role IN ('ADMIN', 'STAFF') THEN
    RETURN true;
  END IF;

  -- 5. Default deny for ordinary customers and unrecognized callers
  RETURN false;
END;
$$;

-- Grant execution privileges to API roles
REVOKE ALL ON FUNCTION public.is_admin_or_staff() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin_or_staff() TO anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 2. Row-Level Security Policies on public.products
-- ----------------------------------------------------------------------------
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- Public can view active menu items
DROP POLICY IF EXISTS "Public can view products" ON public.products;
CREATE POLICY "Public can view products"
  ON public.products FOR SELECT
  TO anon, authenticated
  USING (true);

-- Authorized active staff can create, update, and delete products
DROP POLICY IF EXISTS "Staff can manage products" ON public.products;
CREATE POLICY "Staff can manage products"
  ON public.products FOR ALL
  TO authenticated
  USING (public.is_admin_or_staff())
  WITH CHECK (public.is_admin_or_staff());

-- ----------------------------------------------------------------------------
-- 3. Row-Level Security Policies on public.staff_profiles
-- ----------------------------------------------------------------------------
ALTER TABLE public.staff_profiles ENABLE ROW LEVEL SECURITY;

-- Staff can view their own profile, and authorized active staff can view staff directory
DROP POLICY IF EXISTS "Staff can read staff profiles" ON public.staff_profiles;
CREATE POLICY "Staff can read staff profiles"
  ON public.staff_profiles FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_admin_or_staff()
  );

-- ----------------------------------------------------------------------------
-- 4. Storage Objects Policies for 'product-images' (Scope bounded to bucket)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public can view product images" ON storage.objects;
CREATE POLICY "Public can view product images"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'product-images');

DROP POLICY IF EXISTS "Staff can upload product images" ON storage.objects;
CREATE POLICY "Staff can upload product images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'product-images'
    AND public.is_admin_or_staff()
  );

DROP POLICY IF EXISTS "Staff can update product images" ON storage.objects;
CREATE POLICY "Staff can update product images"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'product-images'
    AND public.is_admin_or_staff()
  )
  WITH CHECK (
    bucket_id = 'product-images'
    AND public.is_admin_or_staff()
  );

DROP POLICY IF EXISTS "Staff can delete product images" ON storage.objects;
CREATE POLICY "Staff can delete product images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'product-images'
    AND public.is_admin_or_staff()
  );