-- ============================================================================
-- Rekik Café — Phase 2: Secure Product Management & Granular RLS
-- Migration: 20261020010000_secure_product_management.sql
-- ============================================================================
-- Deployment Dependency:
-- Requires 20261020000000_secure_staff_authorization.sql (Phase 1)
-- which defines the hardened, SECURITY DEFINER public.is_admin_or_staff() function.
-- This migration DOES NOT redefine public.is_admin_or_staff().
--
-- Objective:
-- 1. Enforce verified constraints on public.products:
--    a. ALTER COLUMN category_id SET NOT NULL (all products require an active category).
--    b. CHECK (length(trim(name)) > 0) to reject whitespace-only or empty product names.
--    c. CHECK (length(trim(slug)) > 0) to reject whitespace-only or empty product slugs.
--    d. Reuses existing verified products_price_check (CHECK price >= 0) without duplication.
-- 2. Restrict PostgreSQL table privileges:
--    a. Revoke INSERT, UPDATE, DELETE from anon and PUBLIC.
--    b. Grant SELECT to anon and authenticated.
--    c. Grant INSERT, UPDATE, DELETE to authenticated.
-- 3. Eliminate permissive policy OR-bypass:
--    Explicitly drop the broad "Staff can manage products" (FOR ALL) policy and legacy templates.
-- 4. Establish granular Row-Level Security policies on public.products:
--    - "Public can view products" (FOR SELECT TO anon, authenticated)
--    - "Staff can insert products" (FOR INSERT TO authenticated)
--    - "Staff can update products" (FOR UPDATE TO authenticated)
--    - "Staff can delete products" (FOR DELETE TO authenticated)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Table Constraints on public.products
-- ----------------------------------------------------------------------------
-- Ensure all products belong to a valid category
ALTER TABLE public.products
  ALTER COLUMN category_id SET NOT NULL;

-- Disallow empty or whitespace-only product names
ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_name_not_empty;
ALTER TABLE public.products
  ADD CONSTRAINT products_name_not_empty
  CHECK (length(trim(name)) > 0);

-- Disallow empty or whitespace-only product slugs
ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_slug_not_empty;
ALTER TABLE public.products
  ADD CONSTRAINT products_slug_not_empty
  CHECK (length(trim(slug)) > 0);

-- Note: products_price_check (CHECK (price >= (0)::numeric)) is preserved and reused.

-- ----------------------------------------------------------------------------
-- 2. Explicit PostgreSQL Table Privileges
-- ----------------------------------------------------------------------------
REVOKE ALL ON TABLE public.products FROM PUBLIC;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.products FROM anon;

GRANT SELECT ON TABLE public.products TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.products TO authenticated;

-- ----------------------------------------------------------------------------
-- 3. Drop Broad and Legacy Permissive Policies on public.products
-- ----------------------------------------------------------------------------
-- Dropping "Staff can manage products" prevents PostgreSQL from evaluating
-- permissive policies with OR-semantics, which would undermine granular checks.
DROP POLICY IF EXISTS "Staff can manage products" ON public.products;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.products;
DROP POLICY IF EXISTS "Enable update for users based on email" ON public.products;
DROP POLICY IF EXISTS "Enable delete for users based on email" ON public.products;
DROP POLICY IF EXISTS "Allow all" ON public.products;

-- ----------------------------------------------------------------------------
-- 4. Granular Row-Level Security Policies on public.products
-- ----------------------------------------------------------------------------
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- Public (anonymous diners and authenticated users) can view active menu items
DROP POLICY IF EXISTS "Public can view products" ON public.products;
CREATE POLICY "Public can view products"
  ON public.products FOR SELECT
  TO anon, authenticated
  USING (true);

-- Authorized active staff can insert new products
DROP POLICY IF EXISTS "Staff can insert products" ON public.products;
CREATE POLICY "Staff can insert products"
  ON public.products FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin_or_staff());

-- Authorized active staff can update existing products
DROP POLICY IF EXISTS "Staff can update products" ON public.products;
CREATE POLICY "Staff can update products"
  ON public.products FOR UPDATE
  TO authenticated
  USING (public.is_admin_or_staff())
  WITH CHECK (public.is_admin_or_staff());

-- Authorized active staff can delete existing products
DROP POLICY IF EXISTS "Staff can delete products" ON public.products;
CREATE POLICY "Staff can delete products"
  ON public.products FOR DELETE
  TO authenticated
  USING (public.is_admin_or_staff());
