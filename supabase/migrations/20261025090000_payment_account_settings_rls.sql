-- ============================================================================
-- Rekik Café — Migration: Secure Payment Account Settings RLS & Policies
-- File: supabase/migrations/20261025090000_payment_account_settings_rls.sql
-- ============================================================================
-- 1. Ensure table public.payment_account_settings exists with required columns.
-- 2. Enable Row-Level Security (RLS) on public.payment_account_settings.
-- 3. Policy: Public (anon and authenticated customers) can read payment account settings.
-- 4. Policy: Only authenticated staff / administrators can modify payment account settings.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.payment_account_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_method TEXT NOT NULL UNIQUE,
  account_number TEXT NOT NULL,
  account_owner_name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed baseline CBE and Telebirr records if not already present
INSERT INTO public.payment_account_settings (payment_method, account_number, account_owner_name, is_active)
VALUES
  ('cbe', '1000 2345 67890', 'Commercial Bank of Ethiopia (CBE)', true),
  ('telebirr', '0911 234 567', 'Telebirr Mobile Payment', true)
ON CONFLICT (payment_method) DO NOTHING;

-- Enable RLS
ALTER TABLE public.payment_account_settings ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if previously defined to prevent duplication
DROP POLICY IF EXISTS "Allow public select on payment_account_settings" ON public.payment_account_settings;
DROP POLICY IF EXISTS "Allow staff to manage payment_account_settings" ON public.payment_account_settings;

-- Public read access: Allows guest ordering and authenticated customers to retrieve live payment details
CREATE POLICY "Allow public select on payment_account_settings"
  ON public.payment_account_settings
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Staff / Administrator write access: Only authenticated ADMIN and STAFF can insert, update, or delete
CREATE POLICY "Allow staff to manage payment_account_settings"
  ON public.payment_account_settings
  FOR ALL
  TO authenticated
  USING (public.is_admin_or_staff())
  WITH CHECK (public.is_admin_or_staff());
