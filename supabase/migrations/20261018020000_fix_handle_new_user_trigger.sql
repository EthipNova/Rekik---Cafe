-- ============================================================================
-- NEBA CAFÉ — Migration: Fix Supabase Auth Trigger (handle_new_user)
-- File: supabase/migrations/20261018020000_fix_handle_new_user_trigger.sql
-- ============================================================================
-- Root Cause:
-- 1. When creating a user via Supabase Dashboard or Auth API, the trigger
--    `on_auth_user_created` fires `public.handle_new_user()`.
-- 2. The existing `public.handle_new_user()` function attempts to insert into
--    columns (`role`, `full_name`, `phone`, `updated_at`) on `public.users` that
--    do not exist in the active database schema (which only has `id`,
--    `display_name`, `email`, `created_at`).
-- 3. PostgreSQL throws error 42703 (undefined_column), aborting the auth transaction
--    and returning "Database error creating new user" (HTTP 500).
-- 4. Additionally, if user metadata is absent (as is typical when adding a user via
--    the Supabase Dashboard), `name` could evaluate to NULL when syncing to
--    `public.customers`, violating the NOT NULL constraint on `customers.name`.
--
-- Fix:
-- 1. Safely add missing standard profile columns to `public.users` with defaults.
-- 2. Ensure partial unique index `idx_customers_user_id` exists on `public.customers`.
-- 3. Replace `public.handle_new_user()` with a hardened, defensive implementation
--    that handles missing metadata safely and wraps profile syncing in defensive
--    blocks so auth user creation NEVER fails.
-- ============================================================================

-- Step 1: Align public.users columns safely (preserving all existing table data)
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS full_name text,
  ADD COLUMN IF NOT EXISTS role text DEFAULT 'CUSTOMER',
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Step 2: Ensure partial unique index on public.customers for safe 1:1 user linking
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_user_id
  ON public.customers(user_id)
  WHERE user_id IS NOT NULL;

-- Step 3: Hardened, fault-tolerant handle_new_user trigger function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  meta_name text;
  meta_phone text;
  meta_role text;
BEGIN
  -- Defensive guard: only process during user creation (INSERT)
  IF TG_OP <> 'INSERT' THEN
    RETURN NEW;
  END IF;

  -- Extract display info safely from auth metadata with fallback to email prefix or default
  meta_name := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'name'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'display_name'), ''),
    NULLIF(TRIM(split_part(NEW.email, '@', 1)), ''),
    'NEBA User'
  );
  meta_phone := NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'phone', NEW.phone)), '');
  meta_role := COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'role'), ''), 'CUSTOMER');

  -- 1. Upsert into public.users
  BEGIN
    INSERT INTO public.users (id, email, display_name, full_name, phone, role, created_at, updated_at)
    VALUES (
      NEW.id,
      NEW.email,
      meta_name,
      meta_name,
      meta_phone,
      meta_role,
      NOW(),
      NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
      email = EXCLUDED.email,
      display_name = COALESCE(EXCLUDED.display_name, public.users.display_name),
      full_name = COALESCE(EXCLUDED.full_name, public.users.full_name),
      phone = COALESCE(EXCLUDED.phone, public.users.phone),
      updated_at = NOW();
  EXCEPTION WHEN OTHERS THEN
    -- Fallback for minimal column schema
    BEGIN
      INSERT INTO public.users (id, email, display_name, created_at)
      VALUES (NEW.id, NEW.email, meta_name, NOW())
      ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        display_name = COALESCE(EXCLUDED.display_name, public.users.display_name);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END;

  -- 2. Sync to public.customers only for regular customer accounts (not staff/admin)
  IF LOWER(meta_role) NOT IN ('waiter', 'cashier', 'admin', 'staff') THEN
    BEGIN
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
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  RETURN NEW;
END;
$$;

-- Step 4: Ensure trigger fires AFTER INSERT on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
