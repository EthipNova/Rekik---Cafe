-- ============================================================================
-- NEBA Café — Migration 6: Tighten Orders Update RLS & Configure Order Status Logs RLS
-- File: supabase/migrations/20260918191500_order_status_and_logs_rls.sql
-- ============================================================================

-- 1. Tighten public.orders UPDATE policy
-- Customers must NOT update order status directly.
-- Only ADMIN and STAFF (via public.is_admin_or_staff()) can update order records.
DROP POLICY IF EXISTS "Allow order updates" ON public.orders;
DROP POLICY IF EXISTS "Staff can update orders" ON public.orders;

CREATE POLICY "Staff can update orders"
  ON public.orders FOR UPDATE
  TO authenticated
  USING (public.is_admin_or_staff())
  WITH CHECK (public.is_admin_or_staff());

-- 2. Ensure RLS is active on public.order_status_logs
ALTER TABLE public.order_status_logs ENABLE ROW LEVEL SECURITY;

-- Clean up any existing policies
DROP POLICY IF EXISTS "Staff can read order status logs" ON public.order_status_logs;
DROP POLICY IF EXISTS "Staff can insert order status logs" ON public.order_status_logs;
DROP POLICY IF EXISTS "Customers can read own order status logs" ON public.order_status_logs;

-- 2.1 ADMIN / STAFF can read all order status logs
CREATE POLICY "Staff can read order status logs"
  ON public.order_status_logs FOR SELECT
  TO authenticated
  USING (public.is_admin_or_staff());

-- 2.2 ADMIN / STAFF can insert order status transitions
CREATE POLICY "Staff can insert order status logs"
  ON public.order_status_logs FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin_or_staff());

-- 2.3 CUSTOMER can read status logs for their own orders
CREATE POLICY "Customers can read own order status logs"
  ON public.order_status_logs FOR SELECT
  TO authenticated
  USING (
    order_id IN (
      SELECT o.id FROM public.orders o
      JOIN public.customers c ON o.customer_id = c.id
      WHERE c.user_id = auth.uid()
    )
  );
