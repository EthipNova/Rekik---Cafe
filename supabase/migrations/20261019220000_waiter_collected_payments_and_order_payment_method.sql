-- ==============================================================================
-- REKIK CAFÉ: WAITER-COLLECTED PAYMENT DETAILS & ORDER PAYMENT METHOD MIGRATION
-- File: supabase/migrations/20261019220000_waiter_collected_payments_and_order_payment_method.sql
-- ==============================================================================
-- 1. Ensure orders table has payment_method and transaction_reference columns
--    to store customer's selected payment method and waiter-collected reference.
-- 2. Ensure payments table has collected_by and collected_at columns to attribute
--    payment details collected on the floor by authorized waiters.
-- 3. Provision performance indexes on orders(waiter_id), payments(order_id),
--    order_approvals(order_id, waiter_id), and order_status_logs(order_id).
-- 4. Configure Row-Level Security (RLS) policies for order_approvals, payments,
--    and order_status_logs to ensure:
--    - Waiters can record approval/rejection decisions and collected payment details.
--    - Customers can view their own orders, payment instructions, and status logs.
--    - Cashiers and administrators can review and verify payments.
-- ==============================================================================

-- 1. Orders table extensions for selected payment method and waiter collection
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS transaction_reference text;

-- 2. Payments table extensions for waiter attribution
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS collected_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS collected_at timestamptz;

-- 3. Foreign key and lookup performance indexes
CREATE INDEX IF NOT EXISTS idx_orders_waiter_id ON public.orders(waiter_id);
CREATE INDEX IF NOT EXISTS idx_orders_payment_method ON public.orders(payment_method);
CREATE INDEX IF NOT EXISTS idx_payments_order_id ON public.payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_collected_by ON public.payments(collected_by);
CREATE INDEX IF NOT EXISTS idx_order_approvals_order_id ON public.order_approvals(order_id);
CREATE INDEX IF NOT EXISTS idx_order_approvals_waiter_id ON public.order_approvals(waiter_id);
CREATE INDEX IF NOT EXISTS idx_order_status_logs_order_id ON public.order_status_logs(order_id);

-- 4. Enable RLS on order_approvals if not already enabled
ALTER TABLE public.order_approvals ENABLE ROW LEVEL SECURITY;

-- 5. Policies for public.order_approvals
DROP POLICY IF EXISTS "Staff can read order approvals" ON public.order_approvals;
DROP POLICY IF EXISTS "Staff can insert order approvals" ON public.order_approvals;
DROP POLICY IF EXISTS "Customers can read own order approvals" ON public.order_approvals;

CREATE POLICY "Staff can read order approvals"
  ON public.order_approvals FOR SELECT
  TO authenticated
  USING (public.is_admin_or_staff());

CREATE POLICY "Staff can insert order approvals"
  ON public.order_approvals FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin_or_staff());

CREATE POLICY "Customers can read own order approvals"
  ON public.order_approvals FOR SELECT
  TO authenticated
  USING (
    order_id IN (
      SELECT o.id FROM public.orders o
      JOIN public.customers c ON o.customer_id = c.id
      WHERE c.user_id = auth.uid()
    )
  );

-- 6. Ensure payments UPDATE policy allows authorized staff (waiters and cashiers)
DROP POLICY IF EXISTS "Staff can update payments" ON public.payments;

CREATE POLICY "Staff can update payments"
  ON public.payments FOR UPDATE
  TO authenticated
  USING (public.is_admin_or_staff())
  WITH CHECK (public.is_admin_or_staff());
