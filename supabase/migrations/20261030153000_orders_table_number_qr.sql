-- ============================================================================
-- Rekik Café — Ensure orders table has table_number column and index
-- File: supabase/migrations/20261030153000_orders_table_number_qr.sql
-- ============================================================================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS table_number TEXT;

CREATE INDEX IF NOT EXISTS idx_orders_table_number
  ON public.orders(table_number)
  WHERE table_number IS NOT NULL;

COMMENT ON COLUMN public.orders.table_number IS 'Dine-in table identification number printed on the table QR code.';
