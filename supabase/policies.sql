-- ============================================================================
-- NEBA Café — Row-Level Security (RLS) Policies & Customer Auth
-- File: supabase/policies.sql
-- ============================================================================
--
-- HOW TO APPLY IN SUPABASE SQL EDITOR
-- ────────────────────────────────────
-- In PostgreSQL, ALTER TYPE ... ADD VALUE must be committed before expressions
-- referencing the new enum value can compile.
--
-- STEP 1: Paste and run ONLY this line first:
--   ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'CUSTOMER';
--
-- STEP 2: Paste and run the remainder of this file.
--
-- (If running migrations via Supabase CLI, run 20260918155900_add_customer_role_enum.sql
--  followed by 20260918160000_customer_authentication.sql)
-- ============================================================================

-- 1. Extend user_role enum to include 'CUSTOMER'
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'CUSTOMER';

-- 2. Add user_id to public.customers linking to auth.users(id)
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_user_id
  ON public.customers(user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_customers_email ON public.customers(email);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON public.customers(phone);
CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON public.orders(customer_id);

-- 3. Trigger Function: Sync auth.users -> public.users & public.customers
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  assigned_role public.user_role;
  raw_role text;
  meta_name text;
  meta_phone text;
BEGIN
  raw_role := NEW.raw_user_meta_data->>'role';
  meta_name := COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1));
  meta_phone := NEW.raw_user_meta_data->>'phone';

  IF raw_role = 'ADMIN' THEN
    assigned_role := 'ADMIN'::public.user_role;
  ELSIF raw_role = 'STAFF' THEN
    assigned_role := 'STAFF'::public.user_role;
  ELSE
    assigned_role := 'CUSTOMER'::public.user_role;
  END IF;

  INSERT INTO public.users (id, email, role, full_name, phone, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    assigned_role,
    meta_name,
    meta_phone,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(EXCLUDED.full_name, public.users.full_name),
    phone = COALESCE(EXCLUDED.phone, public.users.phone),
    updated_at = NOW();

  IF assigned_role = 'CUSTOMER'::public.user_role THEN
    INSERT INTO public.customers (id, user_id, name, email, phone, created_at, updated_at)
    VALUES (
      gen_random_uuid(),
      NEW.id,
      meta_name,
      NEW.email,
      meta_phone,
      NOW(),
      NOW()
    )
    ON CONFLICT (user_id) WHERE user_id IS NOT NULL DO UPDATE SET
      email = EXCLUDED.email,
      name = COALESCE(EXCLUDED.name, public.customers.name),
      phone = COALESCE(EXCLUDED.phone, public.customers.phone),
      updated_at = NOW();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 4. Enable RLS on all relevant tables
ALTER TABLE public.users              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_addresses ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_admin_or_staff()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid()
      AND role IN ('ADMIN'::public.user_role, 'STAFF'::public.user_role)
  );
END;
$$;

-- 5. Drop old overly permissive policies
DROP POLICY IF EXISTS "Allow anon insert on orders"      ON public.orders;
DROP POLICY IF EXISTS "Allow anon select on orders"      ON public.orders;
DROP POLICY IF EXISTS "Allow anon update on orders"      ON public.orders;
DROP POLICY IF EXISTS "Customers can read own orders"    ON public.orders;
DROP POLICY IF EXISTS "Staff can manage all orders"      ON public.orders;
DROP POLICY IF EXISTS "Allow order creation"             ON public.orders;
DROP POLICY IF EXISTS "Allow order updates"              ON public.orders;

DROP POLICY IF EXISTS "Allow anon insert on order_items" ON public.order_items;
DROP POLICY IF EXISTS "Allow anon select on order_items" ON public.order_items;
DROP POLICY IF EXISTS "Customers can read own order items" ON public.order_items;
DROP POLICY IF EXISTS "Allow order items creation"       ON public.order_items;

DROP POLICY IF EXISTS "Allow anon insert on payments"    ON public.payments;
DROP POLICY IF EXISTS "Allow anon select on payments"    ON public.payments;
DROP POLICY IF EXISTS "Allow anon update on payments"    ON public.payments;
DROP POLICY IF EXISTS "Customers can read own payments"  ON public.payments;
DROP POLICY IF EXISTS "Allow payments creation"          ON public.payments;
DROP POLICY IF EXISTS "Allow payments update"            ON public.payments;

DROP POLICY IF EXISTS "Allow anon select on customers"   ON public.customers;
DROP POLICY IF EXISTS "Allow anon insert on customers"   ON public.customers;
DROP POLICY IF EXISTS "Allow anon update on customers"   ON public.customers;
DROP POLICY IF EXISTS "Customers can read own record"    ON public.customers;
DROP POLICY IF EXISTS "Customers can update own record"  ON public.customers;
DROP POLICY IF EXISTS "Staff can read all customers"     ON public.customers;
DROP POLICY IF EXISTS "Staff can update all customers"   ON public.customers;

DROP POLICY IF EXISTS "Users can read own profile"       ON public.users;
DROP POLICY IF EXISTS "Staff can read all users"         ON public.users;
DROP POLICY IF EXISTS "Users can update own profile"     ON public.users;

DROP POLICY IF EXISTS "Customers can manage own addresses" ON public.customer_addresses;

-- 6. Apply strictly scoped ownership and role policies

-- ─── USERS ──────────────────────────────────────────────────────────────────
CREATE POLICY "Users can read own profile"
  ON public.users FOR SELECT
  TO authenticated
  USING (id = auth.uid() OR public.is_admin_or_staff());

CREATE POLICY "Users can update own profile"
  ON public.users FOR UPDATE
  TO authenticated
  USING (id = auth.uid() OR public.is_admin_or_staff())
  WITH CHECK (id = auth.uid() OR public.is_admin_or_staff());

-- ─── CUSTOMERS ──────────────────────────────────────────────────────────────
CREATE POLICY "Customers can read own record"
  ON public.customers FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.is_admin_or_staff());

CREATE POLICY "Customers can update own record"
  ON public.customers FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() OR public.is_admin_or_staff())
  WITH CHECK (user_id = auth.uid() OR public.is_admin_or_staff());

CREATE POLICY "Allow guest and customer insert"
  ON public.customers FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    name IS NOT NULL
    AND (
      user_id IS NULL OR user_id = auth.uid() OR public.is_admin_or_staff()
    )
  );

-- ─── ORDERS ─────────────────────────────────────────────────────────────────
CREATE POLICY "Customers can read own orders"
  ON public.orders FOR SELECT
  TO authenticated
  USING (
    public.is_admin_or_staff()
    OR customer_id IN (
      SELECT id FROM public.customers WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Allow order creation"
  ON public.orders FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    status IN ('received', 'confirmed')
    AND total_amount >= 0
  );

CREATE POLICY "Allow order updates"
  ON public.orders FOR UPDATE
  TO authenticated
  USING (
    public.is_admin_or_staff()
    OR customer_id IN (
      SELECT id FROM public.customers WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    public.is_admin_or_staff()
    OR customer_id IN (
      SELECT id FROM public.customers WHERE user_id = auth.uid()
    )
  );

-- ─── ORDER_ITEMS ────────────────────────────────────────────────────────────
CREATE POLICY "Customers can read own order items"
  ON public.order_items FOR SELECT
  TO authenticated
  USING (
    public.is_admin_or_staff()
    OR order_id IN (
      SELECT o.id FROM public.orders o
      JOIN public.customers c ON o.customer_id = c.id
      WHERE c.user_id = auth.uid()
    )
  );

CREATE POLICY "Allow order items creation"
  ON public.order_items FOR INSERT
  TO anon, authenticated
  WITH CHECK (quantity > 0 AND unit_price >= 0);

-- ─── PAYMENTS ───────────────────────────────────────────────────────────────
CREATE POLICY "Customers can read own payments"
  ON public.payments FOR SELECT
  TO authenticated
  USING (
    public.is_admin_or_staff()
    OR order_id IN (
      SELECT o.id FROM public.orders o
      JOIN public.customers c ON o.customer_id = c.id
      WHERE c.user_id = auth.uid()
    )
  );

CREATE POLICY "Allow payments creation"
  ON public.payments FOR INSERT
  TO anon, authenticated
  WITH CHECK (amount >= 0);

CREATE POLICY "Allow payments update"
  ON public.payments FOR UPDATE
  TO authenticated
  USING (
    public.is_admin_or_staff()
    OR order_id IN (
      SELECT o.id FROM public.orders o
      JOIN public.customers c ON o.customer_id = c.id
      WHERE c.user_id = auth.uid()
    )
  )
  WITH CHECK (
    public.is_admin_or_staff()
    OR order_id IN (
      SELECT o.id FROM public.orders o
      JOIN public.customers c ON o.customer_id = c.id
      WHERE c.user_id = auth.uid()
    )
  );

-- ─── CUSTOMER_ADDRESSES ─────────────────────────────────────────────────────
CREATE POLICY "Customers can manage own addresses"
  ON public.customer_addresses FOR ALL
  TO authenticated
  USING (
    public.is_admin_or_staff()
    OR customer_id IN (
      SELECT id FROM public.customers WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    public.is_admin_or_staff()
    OR customer_id IN (
      SELECT id FROM public.customers WHERE user_id = auth.uid()
    )
  );
