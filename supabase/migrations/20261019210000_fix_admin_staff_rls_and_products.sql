-- ============================================================================
-- Rekik Café — Fix Admin & Staff Authorization Helper & Products RLS
-- File: supabase/migrations/20261019210000_fix_admin_staff_rls_and_products.sql
-- ============================================================================
-- Problem Addressed:
-- 1. public.is_admin_or_staff() previously only checked public.users where role
--    IN ('ADMIN'::public.user_role, 'STAFF'::public.user_role). Because
--    public.users.role is typed as TEXT, comparing with the enum triggered
--    "operator does not exist: text = user_role" (error 42883).
-- 2. In Rekik Café, active staff accounts (such as cashier@rekikcafe.com)
--    are maintained in public.staff_profiles, while their public.users.role
--    is 'CUSTOMER'.
-- 3. Inline queries to staff_profiles failed because staff_profiles had RLS
--    enabled with 0 policies, denying all reads to authenticated users.
-- 4. These caused "new row violates row-level security policy" on public.products,
--    storage.objects, and public.categories whenever staff created products.
--
-- Solution:
-- 1. Re-implement public.is_admin_or_staff() as a SECURITY DEFINER function to
--    cleanly check both public.staff_profiles (active accounts with role
--    'admin', 'manager', 'staff', 'cashier', or 'owner') AND public.users
--    (UPPER(role::text) IN ('ADMIN', 'STAFF')) using safe text comparisons.
-- 2. Provide a SELECT policy on public.staff_profiles so authenticated staff
--    can read their own and operational profiles.
-- 3. Enforce granular RLS on public.products (Public SELECT, Staff ALL).
-- 4. Align storage.objects policies for 'product-images' with is_admin_or_staff().
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Upgrade public.is_admin_or_staff() Security Definer Function
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin_or_staff()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
BEGIN
  -- 1. Allow service_role API requests unconditionally
  IF (COALESCE(auth.jwt() ->> 'role', '') = 'service_role')
     OR (COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role') THEN
    RETURN true;
  END IF;

  -- 2. Reject unauthenticated / anonymous callers
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  -- 3. Check active staff in staff_profiles OR ADMIN/STAFF role in users
  RETURN (
    EXISTS (
      SELECT 1 FROM public.staff_profiles sp
      WHERE sp.user_id = auth.uid()
        AND sp.is_active = true
        AND LOWER(sp.role::text) IN ('admin', 'manager', 'staff', 'cashier', 'owner')
    )
    OR
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND UPPER(u.role::text) IN ('ADMIN', 'STAFF')
    )
  );
END;
$$;

-- Grant execution to API roles
REVOKE ALL ON FUNCTION public.is_admin_or_staff() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin_or_staff() TO anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 2. Row Level Security on public.staff_profiles
-- ----------------------------------------------------------------------------
ALTER TABLE public.staff_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can read staff profiles" ON public.staff_profiles;
CREATE POLICY "Staff can read staff profiles"
  ON public.staff_profiles FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_admin_or_staff()
  );

-- ----------------------------------------------------------------------------
-- 3. Row Level Security on public.products
-- ----------------------------------------------------------------------------
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- Public read access so customers, visitors, and admin can view menu items
DROP POLICY IF EXISTS "Public can view products" ON public.products;
CREATE POLICY "Public can view products"
  ON public.products FOR SELECT
  TO anon, authenticated
  USING (true);

-- Authorized staff/admin management access (insert, update, delete)
DROP POLICY IF EXISTS "Staff can manage products" ON public.products;
CREATE POLICY "Staff can manage products"
  ON public.products FOR ALL
  TO authenticated
  USING (public.is_admin_or_staff())
  WITH CHECK (public.is_admin_or_staff());

-- ----------------------------------------------------------------------------
-- 4. Align Storage Objects Policies for 'product-images'
-- ----------------------------------------------------------------------------
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
