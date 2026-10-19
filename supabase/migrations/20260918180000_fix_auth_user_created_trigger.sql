-- ============================================================================
-- NEBA Café — Migration: Fix auth.users trigger to fire ONLY on INSERT
-- File: supabase/migrations/20260918180000_fix_auth_user_created_trigger.sql
-- ============================================================================
-- Root Cause:
-- The trigger `on_auth_user_created` on `auth.users` was previously configured
-- as `AFTER INSERT OR UPDATE`. When a user logged in, Supabase Auth updated
-- `auth.users.last_sign_in_at`, causing `handle_new_user()` to re-fire on every
-- login. This resulted in "Database error granting user" (500).
--
-- Fix:
-- 1. Add defensive guard `IF TG_OP <> 'INSERT' THEN RETURN NEW; END IF;` at the
--    top of `public.handle_new_user()`.
-- 2. Drop and recreate trigger `on_auth_user_created` on `auth.users` as
--    `AFTER INSERT` only.
-- ============================================================================

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
  -- Defensive guard: only process during user creation (INSERT)
  IF TG_OP <> 'INSERT' THEN
    RETURN NEW;
  END IF;

  raw_role := NEW.raw_user_meta_data->>'role';
  meta_name := COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1));
  meta_phone := NEW.raw_user_meta_data->>'phone';

  -- Default to CUSTOMER unless explicitly assigned STAFF/ADMIN
  IF raw_role = 'ADMIN' THEN
    assigned_role := 'ADMIN'::public.user_role;
  ELSIF raw_role = 'STAFF' THEN
    assigned_role := 'STAFF'::public.user_role;
  ELSE
    assigned_role := 'CUSTOMER'::public.user_role;
  END IF;

  -- Upsert into public.users.
  -- Notice: 'role' is intentionally omitted from DO UPDATE SET so that existing
  -- ADMIN or STAFF roles are NEVER downgraded on auth profile sync.
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

  -- If customer, ensure a public.customers row exists.
  -- Must match partial unique index: idx_customers_user_id WHERE user_id IS NOT NULL
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

-- Replace trigger on auth.users: AFTER INSERT only
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
