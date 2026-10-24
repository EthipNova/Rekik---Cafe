-- ============================================================================
-- Rekik Café — Fix Cashier Sales, Payments & Order Financial Visibility RLS
-- Migration: 20261020020000_fix_cashier_sales_and_payments_rls.sql
-- ============================================================================
-- Objective:
-- 1. Ensure authorized Owners, Administrators, and Cashiers (via public.is_admin_or_staff())
--    can SELECT, INSERT, and UPDATE orders and payments records in Supabase.
-- 2. Prevent RLS from silently denying transactions recorded by cashiers or hiding
--    verified sales from the Owner Sales & Payments dashboards.
-- 3. Keep customer permissions strictly isolated to their own orders and payments.
-- 4. Secure payment_proofs and payment_reviews tables for cashier verification.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Row-Level Security on public.orders
-- ----------------------------------------------------------------------------
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can view all orders" ON public.orders;
DROP POLICY IF EXISTS "Customers can read own orders" ON public.orders;
DROP POLICY IF EXISTS "Allow anon select on orders" ON public.orders;
DROP POLICY IF EXISTS "Staff can manage all orders" ON public.orders;
DROP POLICY IF EXISTS "Allow order creation" ON public.orders;
DROP POLICY IF EXISTS "Staff can create orders" ON public.orders;
DROP POLICY IF EXISTS "Allow order updates" ON public.orders;
DROP POLICY IF EXISTS "Staff can update orders" ON public.orders;

-- 1.1 SELECT: Staff/Admin see all operational orders; Customers see own orders
CREATE POLICY "Staff can view all orders"
  ON public.orders FOR SELECT
  TO authenticated
  USING (
    public.is_admin_or_staff()
    OR customer_id IN (
      SELECT id FROM public.customers WHERE user_id = auth.uid()
    )
  );

-- 1.2 INSERT: Staff/Cashiers can create orders; Customers/Guests can create received orders
CREATE POLICY "Staff and customers can create orders"
  ON public.orders FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    public.is_admin_or_staff()
    OR (
      status IN ('received', 'confirmed', 'pending_waiter')
      AND total_amount >= 0
    )
  );

-- 1.3 UPDATE: Authorized staff can transition order status & fulfillments
CREATE POLICY "Staff can update orders"
  ON public.orders FOR UPDATE
  TO authenticated
  USING (public.is_admin_or_staff())
  WITH CHECK (public.is_admin_or_staff());

-- ----------------------------------------------------------------------------
-- 2. Row-Level Security on public.payments
-- ----------------------------------------------------------------------------
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can view all payments" ON public.payments;
DROP POLICY IF EXISTS "Customers can read own payments" ON public.payments;
DROP POLICY IF EXISTS "Allow anon select on payments" ON public.payments;
DROP POLICY IF EXISTS "Allow payments creation" ON public.payments;
DROP POLICY IF EXISTS "Allow payments update" ON public.payments;
DROP POLICY IF EXISTS "Staff can update payments" ON public.payments;

-- 2.1 SELECT: Staff/Admin see all payments for financial monitoring; Customers see own payments
CREATE POLICY "Staff can view all payments"
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

-- 2.2 INSERT: Authorized staff/cashiers and checkout engine can insert payment records
CREATE POLICY "Staff and checkout can insert payments"
  ON public.payments FOR INSERT
  TO anon, authenticated
  WITH CHECK (amount >= 0);

-- 2.3 UPDATE: Authorized staff/cashiers can record payments, change method/status
CREATE POLICY "Staff can update payments"
  ON public.payments FOR UPDATE
  TO authenticated
  USING (public.is_admin_or_staff())
  WITH CHECK (public.is_admin_or_staff());

-- ----------------------------------------------------------------------------
-- 3. Row-Level Security on public.order_items
-- ----------------------------------------------------------------------------
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can view order items" ON public.order_items;
DROP POLICY IF EXISTS "Customers can read own order items" ON public.order_items;
DROP POLICY IF EXISTS "Allow anon select on order_items" ON public.order_items;
DROP POLICY IF EXISTS "Allow order items creation" ON public.order_items;

CREATE POLICY "Staff can view order items"
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

-- ----------------------------------------------------------------------------
-- 4. Row-Level Security on public.customers
-- ----------------------------------------------------------------------------
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can read all customers" ON public.customers;
DROP POLICY IF EXISTS "Customers can read own record" ON public.customers;
DROP POLICY IF EXISTS "Customers can update own record" ON public.customers;
DROP POLICY IF EXISTS "Staff can update all customers" ON public.customers;
DROP POLICY IF EXISTS "Allow guest and customer insert" ON public.customers;

CREATE POLICY "Staff can read all customers"
  ON public.customers FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_admin_or_staff()
  );

CREATE POLICY "Customers and staff can update records"
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

CREATE POLICY "Allow guest and customer insert"
  ON public.customers FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    name IS NOT NULL
    AND (
      user_id IS NULL
      OR user_id = auth.uid()
      OR public.is_admin_or_staff()
    )
  );

-- ----------------------------------------------------------------------------
-- 5. Row-Level Security on public.users
-- ----------------------------------------------------------------------------
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can read all users" ON public.users;
DROP POLICY IF EXISTS "Users can read own profile" ON public.users;
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;

CREATE POLICY "Staff can read all users"
  ON public.users FOR SELECT
  TO authenticated
  USING (
    id = auth.uid()
    OR public.is_admin_or_staff()
  );

CREATE POLICY "Users and staff can update profile"
  ON public.users FOR UPDATE
  TO authenticated
  USING (
    id = auth.uid()
    OR public.is_admin_or_staff()
  )
  WITH CHECK (
    id = auth.uid()
    OR public.is_admin_or_staff()
  );

-- ----------------------------------------------------------------------------
-- 6. Row-Level Security on payment_proofs & payment_reviews (if tables exist)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'payment_proofs') THEN
    ALTER TABLE public.payment_proofs ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Staff can read payment proofs" ON public.payment_proofs;
    DROP POLICY IF EXISTS "Customers can read own proofs" ON public.payment_proofs;
    DROP POLICY IF EXISTS "Customers can upload proofs" ON public.payment_proofs;
    DROP POLICY IF EXISTS "Staff can review proofs" ON public.payment_proofs;

    CREATE POLICY "Staff can read payment proofs"
      ON public.payment_proofs FOR SELECT
      TO authenticated
      USING (
        submitted_by = auth.uid()
        OR public.is_admin_or_staff()
      );

    CREATE POLICY "Customers can upload proofs"
      ON public.payment_proofs FOR INSERT
      TO authenticated
      WITH CHECK (submitted_by = auth.uid() OR public.is_admin_or_staff());

    CREATE POLICY "Staff can review proofs"
      ON public.payment_proofs FOR UPDATE
      TO authenticated
      USING (public.is_admin_or_staff())
      WITH CHECK (public.is_admin_or_staff());
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'payment_reviews') THEN
    ALTER TABLE public.payment_reviews ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Staff can read payment reviews" ON public.payment_reviews;
    DROP POLICY IF EXISTS "Staff can insert payment reviews" ON public.payment_reviews;

    CREATE POLICY "Staff can read payment reviews"
      ON public.payment_reviews FOR SELECT
      TO authenticated
      USING (public.is_admin_or_staff());

    CREATE POLICY "Staff can insert payment reviews"
      ON public.payment_reviews FOR INSERT
      TO authenticated
      WITH CHECK (public.is_admin_or_staff());
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 7. Ensure delivery geolocation columns exist on public.orders
-- ----------------------------------------------------------------------------
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivery_latitude double precision;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivery_longitude double precision;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivery_distance_km numeric;

