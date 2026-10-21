-- ==============================================================================
-- GURSHA CAFE: SECURE DATABASE MIGRATION & ACCESS CONTROL SPECIFICATION
-- File: supabase/migrations/20261012_customer_auth_and_admin_security.sql
-- ==============================================================================
-- Revision: Zero-Trust Hardened Architecture & Production Security Fixes
--
-- KEY SAFEGUARDS IN THIS REVISION:
-- 1. PRE-REQUISITE TABLE VERIFICATION:
--    - Ensures all target tables (orders, order_items, customer_sessions, menu_items,
--      store_settings, profiles, admin_users) exist via CREATE TABLE IF NOT EXISTS
--      before any ALTER TABLE or constraint updates.
--
-- 2. SECURITY DEFINER CALLER HARDENING (NO current_user BYPASS):
--    - Completely removes reliance on current_user in SECURITY DEFINER functions.
--    - In PostgreSQL, current_user in a SECURITY DEFINER function always equals the owner
--      ('postgres'), which would inadvertently bypass security triggers.
--    - Fixed protect_admin_users() and bootstrap_first_admin() to inspect session_user,
--      auth.role(), and public.is_admin() securely.
--
-- 3. LEAST-PRIVILEGE TABLE GRANTS & RLS:
--    - Direct INSERT/UPDATE/DELETE on orders and order_items revoked from public and customers.
--    - Orders are created authoritatively via create_order() RPC.
--    - customer_sessions completely isolated from public access.
--    - admin_users table granted only SELECT to authenticated users (for their own row),
--      with write access restricted to verified administrators via RLS and trigger.
--
-- 4. NON-DESTRUCTIVE MENU SEEDING:
--    - Uses ON CONFLICT (id) DO NOTHING so existing prices, dish names, categories,
--      or customizations are never overwritten.
--
-- 5. MINIMAL GUEST ORDER INFORMATION EXPOSURE:
--    - Guest order retrieval RPCs require unpredictable 48-char tokens.
--    - Never returns guest_lookup_token or internal user_id.
--    - Routine polling RPC returns lightweight status updates without heavy image payloads.
--
-- 6. PRIVATE PAYMENT PROOF STORAGE:
--    - Validates image sizes and statuses strictly.
--    - Sets up private payment-proofs storage bucket with access control.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- SECTION 1: EXTENSIONS
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS "pgcrypto";
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;


-- ------------------------------------------------------------------------------
-- SECTION 2: BASE TABLE DEFINITIONS (SAFE IDEMPOTENT CREATION)
-- ------------------------------------------------------------------------------

-- Ensure orders table exists
CREATE TABLE IF NOT EXISTS public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  guest_lookup_token text,
  customer_name text,
  phone text,
  service_type text,
  zone text,
  distance_km numeric DEFAULT 0,
  address text,
  subtotal numeric DEFAULT 0,
  delivery_fee numeric DEFAULT 0,
  service_charge numeric DEFAULT 0,
  total numeric DEFAULT 0,
  payment_method text,
  proof_status text DEFAULT 'none',
  proof_image text DEFAULT '',
  proof_note text DEFAULT '',
  status text DEFAULT 'placed',
  eta integer DEFAULT 25,
  staff_note text DEFAULT '',
  scheduled_for timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Ensure order_items table exists
CREATE TABLE IF NOT EXISTS public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  menu_item_id text,
  name text,
  base_price numeric DEFAULT 0,
  quantity integer DEFAULT 1,
  base_choice text DEFAULT 'Injera',
  spice_level integer DEFAULT 0,
  extras text[] DEFAULT '{}'::text[],
  extra_price numeric DEFAULT 0,
  item_total numeric DEFAULT 0,
  note text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

-- Ensure customer_sessions table exists
CREATE TABLE IF NOT EXISTS public.customer_sessions (
  phone text PRIMARY KEY,
  name text NOT NULL,
  otp text,
  verified boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Ensure all expected columns exist on orders (for upgrades of existing schemas)
ALTER TABLE public.orders 
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS guest_lookup_token text,
  ADD COLUMN IF NOT EXISTS code text,
  ADD COLUMN IF NOT EXISTS customer_name text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS service_type text,
  ADD COLUMN IF NOT EXISTS zone text,
  ADD COLUMN IF NOT EXISTS distance_km numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS subtotal numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_fee numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS service_charge numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS proof_status text DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS proof_image text DEFAULT '',
  ADD COLUMN IF NOT EXISTS proof_note text DEFAULT '',
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'placed',
  ADD COLUMN IF NOT EXISTS eta integer DEFAULT 25,
  ADD COLUMN IF NOT EXISTS staff_note text DEFAULT '',
  ADD COLUMN IF NOT EXISTS scheduled_for timestamptz,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

-- Ensure all expected columns exist on order_items
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS menu_item_id text,
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS base_price numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS quantity integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS base_choice text DEFAULT 'Injera',
  ADD COLUMN IF NOT EXISTS spice_level integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS extras text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS extra_price numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS item_total numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS note text DEFAULT '',
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

-- Backfill legacy orders where guest_lookup_token IS NULL with a secure random token (only for unauthenticated guest orders)
UPDATE public.orders
SET guest_lookup_token = substr(replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''), 1, 48)
WHERE guest_lookup_token IS NULL AND user_id IS NULL;

-- Performance & constraint indexes
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON public.orders(user_id);

-- Check and de-duplicate any legacy duplicate codes before unique index creation
DO $$
DECLARE
  dup record;
  v_suffix integer;
  v_new_code text;
BEGIN
  -- Backfill any legacy orders where code IS NULL or empty
  UPDATE public.orders
  SET code = 'GR-' || upper(substr(md5(random()::text || clock_timestamp()::text || id::text), 1, 4))
  WHERE code IS NULL OR trim(code) = '';

  FOR dup IN
    SELECT code, array_agg(id ORDER BY created_at ASC) as id_list
    FROM public.orders
    WHERE code IS NOT NULL
    GROUP BY code
    HAVING count(*) > 1
  LOOP
    v_suffix := 1;
    FOR i IN 2..array_length(dup.id_list, 1) LOOP
      v_new_code := dup.code || '-' || v_suffix;
      WHILE EXISTS (SELECT 1 FROM public.orders WHERE code = v_new_code) LOOP
        v_suffix := v_suffix + 1;
        v_new_code := dup.code || '-' || v_suffix;
      END LOOP;
      UPDATE public.orders SET code = v_new_code WHERE id = dup.id_list[i];
      RAISE NOTICE 'Resolved duplicate order code % to % for order id %', dup.code, v_new_code, dup.id_list[i];
      v_suffix := v_suffix + 1;
    END LOOP;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_code_unique ON public.orders(code);
CREATE INDEX IF NOT EXISTS idx_orders_guest_lookup_token ON public.orders(guest_lookup_token);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items(order_id);


-- ------------------------------------------------------------------------------
-- SECTION 3: MENU ITEMS TABLE (AUTHORITATIVE CATALOG)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.menu_items (
  id text PRIMARY KEY,
  name text NOT NULL,
  name_am text,
  name_sid text,
  description text,
  price numeric NOT NULL,
  category text,
  category_id text,
  "desc" text,
  image text,
  spice integer DEFAULT 0,
  rating numeric DEFAULT 5,
  popular boolean DEFAULT false,
  fasting boolean DEFAULT false,
  in_stock boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Reconcile column naming differences and missing columns across schema revisions
ALTER TABLE public.menu_items 
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS name_am text,
  ADD COLUMN IF NOT EXISTS name_sid text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS "desc" text,
  ADD COLUMN IF NOT EXISTS price numeric,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS category_id text,
  ADD COLUMN IF NOT EXISTS image text,
  ADD COLUMN IF NOT EXISTS spice integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rating numeric DEFAULT 5,
  ADD COLUMN IF NOT EXISTS popular boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS fasting boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS in_stock boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

-- Bidirectional synchronization between column synonyms
UPDATE public.menu_items SET category = category_id WHERE category IS NULL AND category_id IS NOT NULL;
UPDATE public.menu_items SET category_id = category WHERE category_id IS NULL AND category IS NOT NULL;
UPDATE public.menu_items SET description = "desc" WHERE description IS NULL AND "desc" IS NOT NULL;
UPDATE public.menu_items SET "desc" = description WHERE "desc" IS NULL AND description IS NOT NULL;

CREATE OR REPLACE FUNCTION public.sync_menu_item_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.category IS NULL AND NEW.category_id IS NOT NULL THEN
    NEW.category := NEW.category_id;
  ELSIF NEW.category_id IS NULL AND NEW.category IS NOT NULL THEN
    NEW.category_id := NEW.category;
  END IF;

  IF NEW.description IS NULL AND NEW."desc" IS NOT NULL THEN
    NEW.description := NEW."desc";
  ELSIF NEW."desc" IS NULL AND NEW.description IS NOT NULL THEN
    NEW."desc" := NEW.description;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_menu_item_columns ON public.menu_items;
CREATE TRIGGER trg_sync_menu_item_columns
  BEFORE INSERT OR UPDATE ON public.menu_items
  FOR EACH ROW EXECUTE FUNCTION public.sync_menu_item_columns();

-- Seed default café dishes ONLY IF NOT PRESENT (NEVER overwrites existing custom prices/names)
INSERT INTO public.menu_items (id, name, price, category, category_id, description, "desc", fasting, in_stock) VALUES
  ('doro', 'Special Doro Wat', 420, 'mains', 'mains', 'Slow-simmered chicken in aged berbere with a farm egg and ayib.', 'Slow-simmered chicken in aged berbere with a farm egg and ayib.', false, true),
  ('kitfo', 'Special Kitfo', 520, 'mains', 'mains', 'Hand-minced beef warmed in mitmita and niter kibbeh, ayib on the side.', 'Hand-minced beef warmed in mitmita and niter kibbeh, ayib on the side.', false, true),
  ('siga', 'Siga Tibs', 460, 'mains', 'mains', 'Cubed beef seared with rosemary, onion and jalapeño served on a hot sizzler.', 'Cubed beef seared with rosemary, onion and jalapeño served on a hot sizzler.', false, true),
  ('fish', 'Hawassa Asa Tibs', 480, 'fish', 'fish', 'Crisp tilapia from Lake Hawassa with lime, onion and awaze.', 'Crisp tilapia from Lake Hawassa with lime, onion and awaze.', false, true),
  ('chechebsa', 'Chechebsa', 190, 'breakfast', 'breakfast', 'Shredded kita in spiced butter and berbere with a drizzle of honey.', 'Shredded kita in spiced butter and berbere with a drizzle of honey.', false, true),
  ('firfir', 'Quanta Firfir', 260, 'breakfast', 'breakfast', 'Dried beef torn into warm berbere sauce with injera.', 'Dried beef torn into warm berbere sauce with injera.', false, true),
  ('shiro', 'Shiro Tegabino', 190, 'fasting', 'fasting', 'Silky chickpea stew with garlic, ginger and ground chili.', 'Silky chickpea stew with garlic, ginger and ground chili.', true, true),
  ('gomen', 'Gomen be Siga', 240, 'fasting', 'fasting', 'Collard greens braised with beef and cardamom.', 'Collard greens braised with beef and cardamom.', false, true),
  ('gomenkai', 'Fasting Combo', 300, 'fasting', 'fasting', 'Shiro, gomen, misir wot and salad on one injera platter.', 'Shiro, gomen, misir wot and salad on one injera platter.', true, true),
  ('buna', 'Buna Ceremony (Jebena)', 160, 'drinks', 'drinks', 'Yirgacheffe beans roasted live, poured from a clay jebena. Serves two.', 'Yirgacheffe beans roasted live, poured from a clay jebena. Serves two.', true, true),
  ('macchiato', 'Gursha Macchiato', 90, 'drinks', 'drinks', 'Double espresso with steamed milk, Sidaama sweetener.', 'Double espresso with steamed milk, Sidaama sweetener.', true, true),
  ('tej', 'Tej Honey Cooler', 150, 'drinks', 'drinks', 'Fermented honey refresher served over ice with lemon.', 'Fermented honey refresher served over ice with lemon.', true, false),
  ('spris', 'Avocado Spris', 130, 'juice', 'juice', 'Layered avocado and mango with lime, served with a spoon.', 'Layered avocado and mango with lime, served with a spoon.', true, true),
  ('mango', 'Mango Juice', 110, 'juice', 'juice', 'Fresh pressed mango, no sugar added.', 'Fresh pressed mango, no sugar added.', true, true),
  -- Synonyms/aliases for backwards compatibility:
  ('tibs', 'Special Tibs', 460, 'mains', 'mains', 'Cubed beef seared with rosemary, onions, and jalapeño.', 'Cubed beef seared with rosemary, onions, and jalapeño.', false, true),
  ('asa', 'Hawassa Asa Tibs', 480, 'fish', 'fish', 'Crisp tilapia from Lake Hawassa with lime, onion and awaze.', 'Crisp tilapia from Lake Hawassa with lime, onion and awaze.', false, true),
  ('beyaynetu', 'Beyaynetu Platter', 300, 'fasting', 'fasting', 'Colorful fasting combination of misir, gomen, tikil, and shiro.', 'Colorful fasting combination of misir, gomen, tikil, and shiro.', true, true)
ON CONFLICT (id) DO NOTHING;


-- ------------------------------------------------------------------------------
-- SECTION 4: SERVER-CONTROLLED ADMINISTRATOR AUTHORIZATION
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_users (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE user_id = auth.uid()
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated, service_role;

-- Pre-authentication check to verify if an email belongs to an administrator
-- Safe: returns boolean only without exposing admin_users records to unauthenticated callers
CREATE OR REPLACE FUNCTION public.check_is_admin_email(p_email text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE lower(email) = lower(trim(p_email))
  );
$$;

REVOKE EXECUTE ON FUNCTION public.check_is_admin_email(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_is_admin_email(text) TO authenticated, service_role;

-- Trigger to ensure ONLY trusted superusers/service_role or verified administrators can manage admin_users
-- NOTE: Never checks current_user inside SECURITY DEFINER because it evaluates to function owner.
CREATE OR REPLACE FUNCTION public.protect_admin_users()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role text;
  v_uid uuid;
BEGIN
  v_role := coalesce(auth.role(), '');
  v_uid := auth.uid();

  -- Direct superuser / migration execution via Supabase SQL Editor / CLI:
  IF session_user IN ('postgres', 'supabase_admin', 'dashboard_user') AND v_role = '' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Backend service_role execution:
  IF v_role = 'service_role' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Web / PostgREST API callers: MUST be an authenticated user AND MUST already be in public.admin_users
  IF v_uid IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: only verified administrators can manage administrator privileges';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_admin_users ON public.admin_users;
CREATE TRIGGER trg_protect_admin_users
  BEFORE INSERT OR UPDATE OR DELETE ON public.admin_users
  FOR EACH ROW EXECUTE FUNCTION public.protect_admin_users();


-- ------------------------------------------------------------------------------
-- SECTION 4B: CONTROLLED FIRST-ADMINISTRATOR BOOTSTRAP
-- ------------------------------------------------------------------------------
-- Administrative procedure to promote or bootstrap an admin account by specific UUID
-- Restricted strictly to service_role, direct postgres session, or existing verified admin.
CREATE OR REPLACE FUNCTION public.bootstrap_first_admin(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_email text;
  v_role text;
BEGIN
  v_role := coalesce(auth.role(), '');

  IF (session_user NOT IN ('postgres', 'supabase_admin', 'dashboard_user') OR v_role <> '') 
     AND v_role <> 'service_role' 
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: bootstrap_first_admin is restricted to trusted database administrators';
  END IF;

  SELECT email INTO v_email
  FROM auth.users
  WHERE id = p_user_id;

  IF v_email IS NULL THEN
    RAISE EXCEPTION 'User ID % does not exist in auth.users', p_user_id;
  END IF;

  INSERT INTO public.admin_users (user_id, email)
  VALUES (p_user_id, v_email)
  ON CONFLICT (user_id) DO UPDATE SET email = EXCLUDED.email;
END;
$$;

-- Overload: bootstrap or promote by email address directly
CREATE OR REPLACE FUNCTION public.bootstrap_first_admin(p_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_email text;
  v_role text;
BEGIN
  v_role := coalesce(auth.role(), '');

  IF (session_user NOT IN ('postgres', 'supabase_admin', 'dashboard_user') OR v_role <> '') 
     AND v_role <> 'service_role' 
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: bootstrap_first_admin is restricted to trusted database administrators';
  END IF;

  SELECT id, email INTO v_user_id, v_email
  FROM auth.users
  WHERE lower(email) = lower(trim(p_email));

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User with email "%" not found in auth.users. Please create the user account in Supabase Auth first.', p_email;
  END IF;

  INSERT INTO public.admin_users (user_id, email)
  VALUES (v_user_id, v_email)
  ON CONFLICT (user_id) DO UPDATE SET email = EXCLUDED.email;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.bootstrap_first_admin(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bootstrap_first_admin(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bootstrap_first_admin(uuid) TO postgres, service_role;
GRANT EXECUTE ON FUNCTION public.bootstrap_first_admin(text) TO postgres, service_role;


-- ------------------------------------------------------------------------------
-- SECTION 5: USER PROFILES & AUTHENTICATION
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  full_name text,
  phone text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Trigger function to automatically sync profiles on auth.users changes
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, phone)
  VALUES (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'phone', new.phone)
  )
  ON CONFLICT (id) DO UPDATE
  SET email = excluded.email,
      full_name = coalesce(excluded.full_name, profiles.full_name),
      phone = coalesce(excluded.phone, profiles.phone),
      updated_at = now();
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Idempotent backfill: ensure existing auth.users have profile rows
INSERT INTO public.profiles (id, email, full_name, phone)
SELECT
  id,
  email,
  coalesce(raw_user_meta_data->>'full_name', split_part(email, '@', 1)),
  coalesce(raw_user_meta_data->>'phone', phone)
FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- Trigger to protect trusted profile fields from customer tampering
CREATE OR REPLACE FUNCTION public.protect_profile_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role text;
BEGIN
  v_role := coalesce(auth.role(), '');
  -- Allow internal superuser, service_role, and migration triggers to update fields
  IF session_user IN ('postgres', 'supabase_admin') OR v_role = 'service_role' OR public.is_admin() THEN
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  -- Regular customer cannot modify account id, email, or creation timestamp
  NEW.id := OLD.id;
  NEW.email := OLD.email;
  NEW.created_at := OLD.created_at;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_fields ON public.profiles;
CREATE TRIGGER trg_protect_profile_fields
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_fields();


-- ------------------------------------------------------------------------------
-- SECTION 6: PUBLIC STORE SETTINGS TABLE (SEPARATION OF CONFIG FROM SESSIONS)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.store_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz DEFAULT now()
);

-- Migrate any existing settings from customer_sessions if present, safely validating JSON
DO $$
DECLARE
  r record;
  v_json jsonb;
  v_key text;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'customer_sessions') THEN
    FOR r IN
      SELECT phone, name
      FROM public.customer_sessions
      WHERE phone IN ('__cms_storefront__', '__delivery_settings__', '__custom_menu__')
        AND name IS NOT NULL
        AND length(trim(name)) > 0
    LOOP
      v_key := CASE r.phone
        WHEN '__cms_storefront__' THEN 'cms'
        WHEN '__delivery_settings__' THEN 'delivery'
        WHEN '__custom_menu__' THEN 'menu'
      END;

      BEGIN
        v_json := r.name::jsonb;
        INSERT INTO public.store_settings (key, value)
        VALUES (v_key, v_json)
        ON CONFLICT (key) DO NOTHING;
        RAISE NOTICE 'Migrated setting "%" from customer_sessions', v_key;
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Invalid JSON found in customer_sessions for setting key "%": %. Preserving existing customer_sessions row without overwrite.', v_key, SQLERRM;
      END;
    END LOOP;
  END IF;
END $$;

-- Seed default delivery settings if not present
INSERT INTO public.store_settings (key, value)
VALUES (
  'delivery',
  '{"enabled": true, "destinations": [{"id": "main-campus", "name": "Main Campus", "distanceKm": 2, "enabled": true}, {"id": "techno-campus", "name": "Techno Campus", "distanceKm": 4, "enabled": true}]}'::jsonb
)
ON CONFLICT (key) DO NOTHING;

-- Seed default menu settings if not present
INSERT INTO public.store_settings (key, value)
VALUES ('menu', '[]'::jsonb)
ON CONFLICT (key) DO NOTHING;


-- ------------------------------------------------------------------------------
-- SECTION 7: SECURE ORDER CREATION & VALIDATION RPC
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_order(
  p_order jsonb,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_guest_token text;
  v_order_id uuid;
  v_code text;
  v_customer_name text;
  v_phone text;
  v_service_type text;
  v_zone text;
  v_address text;
  v_payment_method text;
  v_scheduled_for timestamptz;
  v_status text;
  v_proof_status text;
  v_eta integer;
  v_distance_km numeric := 0;
  v_delivery_fee numeric := 0;
  v_subtotal numeric := 0;
  v_service_charge numeric := 0;
  v_total numeric := 0;
  v_item jsonb;
  v_item_id text;
  v_qty integer;
  v_base_choice text;
  v_base_extra numeric := 0;
  v_spice integer;
  v_extras text[];
  v_extra_elem text;
  v_extra_price numeric := 0;
  v_note text;
  v_item_name text;
  v_base_price numeric;
  v_in_stock boolean;
  v_item_total numeric;
  v_attempts integer := 0;
  v_deliv_settings jsonb;
  v_dest jsonb;
  v_dest_matched boolean := false;
  v_dest_enabled boolean := true;
BEGIN
  -- 1. Identity binding: user_id is strictly derived from session auth.uid()
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    v_guest_token := substr(replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''), 1, 48);
  ELSE
    v_guest_token := NULL;
  END IF;

  -- 2. Validate Order Header
  IF p_order IS NULL OR jsonb_typeof(p_order) <> 'object' THEN
    RAISE EXCEPTION 'Order payload must be a valid JSON object';
  END IF;

  v_customer_name := trim(coalesce(p_order->>'customer_name', ''));
  v_phone := trim(coalesce(p_order->>'phone', ''));
  v_service_type := lower(trim(coalesce(p_order->>'service_type', '')));
  v_payment_method := lower(trim(coalesce(p_order->>'payment_method', '')));
  v_zone := trim(coalesce(p_order->>'zone', ''));
  v_address := trim(coalesce(p_order->>'address', ''));

  IF char_length(v_customer_name) < 2 THEN
    RAISE EXCEPTION 'Customer name must be at least 2 characters';
  END IF;

  IF char_length(v_phone) < 7 THEN
    RAISE EXCEPTION 'A valid phone number is required';
  END IF;

  -- Normalize service type ('dine_in' or 'dine-in', 'takeaway' or 'pickup', 'delivery')
  IF v_service_type IN ('dine-in', 'dine_in') THEN
    v_service_type := 'dine-in';
  ELSIF v_service_type IN ('takeaway', 'pickup') THEN
    v_service_type := 'takeaway';
  ELSIF v_service_type = 'delivery' THEN
    v_service_type := 'delivery';
  ELSE
    RAISE EXCEPTION 'Invalid service type: %', v_service_type;
  END IF;

  IF v_payment_method NOT IN ('cash', 'telebirr', 'cbe', 'boa', 'cbe_birr', 'card') THEN
    RAISE EXCEPTION 'Invalid payment method: %', v_payment_method;
  END IF;

  IF p_order ? 'scheduled_for' AND p_order->>'scheduled_for' IS NOT NULL AND p_order->>'scheduled_for' <> '' THEN
    BEGIN
      v_scheduled_for := (p_order->>'scheduled_for')::timestamptz;
    EXCEPTION WHEN OTHERS THEN
      v_scheduled_for := NULL;
    END;
  END IF;

  -- Calculate delivery fees strictly via application rules: zoneFee = 30 + (distance_km * 10)
  IF v_service_type = 'delivery' THEN
    IF char_length(v_address) < 3 THEN
      RAISE EXCEPTION 'Delivery address is required for delivery orders';
    END IF;

    IF char_length(v_zone) = 0 THEN
      RAISE EXCEPTION 'Delivery destination/zone is required for delivery orders';
    END IF;

    SELECT value INTO v_deliv_settings
    FROM public.store_settings
    WHERE key = 'delivery';

    IF v_deliv_settings IS NOT NULL AND (v_deliv_settings ? 'enabled') AND NOT (v_deliv_settings->>'enabled')::boolean THEN
      RAISE EXCEPTION 'Delivery service is currently disabled';
    END IF;

    -- Match destination in delivery settings
    IF v_deliv_settings IS NOT NULL AND (v_deliv_settings ? 'destinations') AND jsonb_typeof(v_deliv_settings->'destinations') = 'array' THEN
      FOR v_dest IN SELECT * FROM jsonb_array_elements(v_deliv_settings->'destinations')
      LOOP
        IF lower(v_dest->>'id') = lower(v_zone) OR lower(v_dest->>'name') = lower(v_zone) THEN
          v_dest_matched := true;
          v_dest_enabled := coalesce((v_dest->>'enabled')::boolean, true);
          v_distance_km := coalesce((v_dest->>'distanceKm')::numeric, 0);
          EXIT;
        END IF;
      END LOOP;
    END IF;

    IF NOT v_dest_matched THEN
      RAISE EXCEPTION 'Unknown or invalid delivery zone: "%". Delivery is only available for supported destinations.', v_zone;
    END IF;

    IF NOT v_dest_enabled THEN
      RAISE EXCEPTION 'Delivery destination "%" is currently disabled', v_zone;
    END IF;

    IF v_distance_km < 0 THEN
      v_distance_km := 0;
    END IF;

    v_delivery_fee := 30 + (v_distance_km * 10);
  ELSE
    v_delivery_fee := 0;
    v_distance_km := 0;
  END IF;

  -- Initial status integrity
  v_status := CASE WHEN v_payment_method = 'cash' THEN 'placed' ELSE 'payment_pending' END;
  v_proof_status := 'none';
  v_eta := CASE v_service_type WHEN 'dine-in' THEN 20 WHEN 'takeaway' THEN 25 ELSE 40 END;

  -- 3. Validate & Price Order Items Authoritatively
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Order must contain at least one item';
  END IF;

  IF jsonb_array_length(p_items) > 50 THEN
    RAISE EXCEPTION 'Order exceeds maximum permitted item count (50)';
  END IF;

  v_order_id := gen_random_uuid();

  -- Generate unique readable order code (GR-XXXX format) with concurrency-safe collision retry
  v_attempts := 0;
  LOOP
    v_code := 'GR-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 4));
    BEGIN
      INSERT INTO public.orders (
        id,
        code,
        user_id,
        guest_lookup_token,
        customer_name,
        phone,
        service_type,
        zone,
        distance_km,
        address,
        subtotal,
        delivery_fee,
        service_charge,
        total,
        payment_method,
        proof_status,
        proof_image,
        proof_note,
        status,
        eta,
        scheduled_for,
        created_at
      ) VALUES (
        v_order_id,
        v_code,
        v_user_id,
        v_guest_token,
        v_customer_name,
        v_phone,
        v_service_type,
        v_zone,
        v_distance_km,
        v_address,
        0, 0, 0, 0,
        v_payment_method,
        'none',
        '',
        '',
        v_status,
        v_eta,
        v_scheduled_for,
        now()
      );
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      v_attempts := v_attempts + 1;
      IF v_attempts > 20 THEN
        RAISE EXCEPTION 'Could not generate unique order code after 20 attempts';
      END IF;
    END;
  END LOOP;

  -- Process and insert each item
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_item_id := trim(coalesce(v_item->>'menu_item_id', ''));
    v_qty := coalesce((v_item->>'quantity')::integer, 0);

    IF v_qty <= 0 OR v_qty > 100 THEN
      RAISE EXCEPTION 'Invalid quantity for item %: % (must be 1-100)', coalesce(v_item_id, 'unknown'), v_qty;
    END IF;

    -- Look up price: 1) store_settings custom menu, 2) menu_items catalog, 3) trusted default menu catalog
    v_base_price := NULL;
    v_item_name := NULL;
    v_in_stock := true;

    -- Check custom menu in store_settings first (admin-configured overrides)
    BEGIN
      SELECT (elem->>'name'), (elem->>'price')::numeric, coalesce((elem->>'inStock')::boolean, true)
      INTO v_item_name, v_base_price, v_in_stock
      FROM public.store_settings s,
           jsonb_array_elements(s.value) elem
      WHERE s.key = 'menu'
        AND lower(elem->>'id') = lower(v_item_id);
    EXCEPTION WHEN OTHERS THEN
      v_base_price := NULL;
    END;

    -- Fallback to authoritative menu_items table
    IF v_base_price IS NULL THEN
      SELECT name, price, in_stock INTO v_item_name, v_base_price, v_in_stock
      FROM public.menu_items
      WHERE lower(id) = lower(v_item_id);
    END IF;

    -- Final fallback to known default café menu
    IF v_base_price IS NULL THEN
      CASE lower(v_item_id)
        WHEN 'doro' THEN v_item_name := 'Special Doro Wat'; v_base_price := 420; v_in_stock := true;
        WHEN 'kitfo' THEN v_item_name := 'Special Kitfo'; v_base_price := 520; v_in_stock := true;
        WHEN 'siga' THEN v_item_name := 'Siga Tibs'; v_base_price := 460; v_in_stock := true;
        WHEN 'tibs' THEN v_item_name := 'Siga Tibs'; v_base_price := 460; v_in_stock := true;
        WHEN 'fish' THEN v_item_name := 'Hawassa Asa Tibs'; v_base_price := 480; v_in_stock := true;
        WHEN 'asa' THEN v_item_name := 'Hawassa Asa Tibs'; v_base_price := 480; v_in_stock := true;
        WHEN 'chechebsa' THEN v_item_name := 'Chechebsa'; v_base_price := 190; v_in_stock := true;
        WHEN 'firfir' THEN v_item_name := 'Quanta Firfir'; v_base_price := 260; v_in_stock := true;
        WHEN 'shiro' THEN v_item_name := 'Shiro Tegabino'; v_base_price := 190; v_in_stock := true;
        WHEN 'gomen' THEN v_item_name := 'Gomen be Siga'; v_base_price := 240; v_in_stock := true;
        WHEN 'gomenkai' THEN v_item_name := 'Fasting Combo'; v_base_price := 300; v_in_stock := true;
        WHEN 'beyaynetu' THEN v_item_name := 'Fasting Combo'; v_base_price := 300; v_in_stock := true;
        WHEN 'buna' THEN v_item_name := 'Buna Ceremony (Jebena)'; v_base_price := 160; v_in_stock := true;
        WHEN 'macchiato' THEN v_item_name := 'Gursha Macchiato'; v_base_price := 90; v_in_stock := true;
        WHEN 'tej' THEN v_item_name := 'Tej Honey Cooler'; v_base_price := 150; v_in_stock := false;
        WHEN 'spris' THEN v_item_name := 'Avocado Spris'; v_base_price := 130; v_in_stock := true;
        WHEN 'mango' THEN v_item_name := 'Mango Juice'; v_base_price := 110; v_in_stock := true;
        ELSE NULL;
      END CASE;
    END IF;

    -- Reject unknown or uncatalogued items
    IF v_base_price IS NULL OR v_item_name IS NULL THEN
      RAISE EXCEPTION 'Invalid or unknown menu item: %', v_item_id;
    END IF;

    IF NOT v_in_stock THEN
      RAISE EXCEPTION 'Item "%" is currently out of stock', v_item_name;
    END IF;

    -- Validate serving choice (base)
    v_base_choice := coalesce(v_item->>'base_choice', 'Injera');
    IF lower(v_base_choice) IN ('kita bread', 'kita') THEN
      v_base_extra := 25;
      v_base_choice := 'Kita bread';
    ELSIF lower(v_base_choice) IN ('injera', '') THEN
      v_base_extra := 0;
      v_base_choice := 'Injera';
    ELSIF lower(v_base_choice) IN ('no base', 'none') THEN
      v_base_extra := 0;
      v_base_choice := 'None';
    ELSE
      RAISE EXCEPTION 'Invalid serving choice "%" for item %', v_base_choice, v_item_name;
    END IF;

    v_spice := coalesce((v_item->>'spice_level')::integer, 0);
    IF v_spice < 0 OR v_spice > 3 THEN
      v_spice := 0;
    END IF;

    v_note := coalesce(v_item->>'note', '');

    -- Validate extras against trusted application prices
    v_extras := ARRAY[]::text[];
    v_extra_price := 0;

    IF v_item ? 'extras' AND jsonb_typeof(v_item->'extras') = 'array' THEN
      FOR v_extra_elem IN SELECT jsonb_array_elements_text(v_item->'extras')
      LOOP
        IF lower(v_extra_elem) = 'extra injera' THEN
          v_extra_price := v_extra_price + 30;
          v_extras := array_append(v_extras, 'Extra injera');
        ELSIF lower(v_extra_elem) = 'ayib cheese' THEN
          v_extra_price := v_extra_price + 45;
          v_extras := array_append(v_extras, 'Ayib cheese');
        ELSIF lower(v_extra_elem) = 'boiled egg' THEN
          v_extra_price := v_extra_price + 35;
          v_extras := array_append(v_extras, 'Boiled egg');
        ELSIF lower(v_extra_elem) = 'extra awaze' THEN
          v_extra_price := v_extra_price + 20;
          v_extras := array_append(v_extras, 'Extra awaze');
        ELSIF lower(v_extra_elem) = 'ethiopian coffee' THEN
          v_extra_price := v_extra_price + 60;
          v_extras := array_append(v_extras, 'Ethiopian coffee');
        ELSIF lower(v_extra_elem) = 'soft drink' THEN
          v_extra_price := v_extra_price + 45;
          v_extras := array_append(v_extras, 'Soft drink');
        ELSIF lower(v_extra_elem) = 'ambo water' THEN
          v_extra_price := v_extra_price + 40;
          v_extras := array_append(v_extras, 'Ambo water');
        ELSE
          RAISE EXCEPTION 'Invalid extra option "%" for item %', v_extra_elem, v_item_name;
        END IF;
      END LOOP;
    END IF;

    -- Calculate item total server-side
    v_item_total := (v_base_price + v_base_extra + v_extra_price) * v_qty;
    v_subtotal := v_subtotal + v_item_total;

    INSERT INTO public.order_items (
      id,
      order_id,
      menu_item_id,
      name,
      base_price,
      quantity,
      base_choice,
      spice_level,
      extras,
      extra_price,
      item_total,
      note
    ) VALUES (
      gen_random_uuid(),
      v_order_id,
      v_item_id,
      v_item_name,
      v_base_price,
      v_qty,
      v_base_choice,
      v_spice,
      v_extras,
      (v_base_extra + v_extra_price),
      v_item_total,
      v_note
    );
  END LOOP;

  -- 4. Calculate final totals server-side
  IF v_service_type = 'dine-in' THEN
    v_service_charge := round(v_subtotal * 0.05, 2);
  ELSE
    v_service_charge := 0;
  END IF;

  v_total := v_subtotal + v_delivery_fee + v_service_charge;

  UPDATE public.orders
  SET subtotal = v_subtotal,
      delivery_fee = v_delivery_fee,
      service_charge = v_service_charge,
      total = v_total
  WHERE id = v_order_id;

  -- Return created order and secret token (only to caller at creation time)
  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'code', v_code,
    'total', v_total,
    'subtotal', v_subtotal,
    'delivery_fee', v_delivery_fee,
    'service_charge', v_service_charge,
    'guest_lookup_token', v_guest_token,
    'status', v_status,
    'created_at', now()
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_order(jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_order(jsonb, jsonb) TO anon, authenticated, service_role;


-- ------------------------------------------------------------------------------
-- SECTION 8: SECURE PAYMENT PROOF & ORDER UPDATE FUNCTIONS
-- ------------------------------------------------------------------------------

-- 1. Customer / Guest Payment Proof Submission
CREATE OR REPLACE FUNCTION public.submit_payment_proof(
  p_code text,
  p_token text,
  p_image text,
  p_note text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order_id uuid;
  v_current_user uuid;
  v_current_status text;
  v_current_proof_status text;
BEGIN
  v_current_user := auth.uid();

  -- Image validation & size check (max 5MB binary / 7.5MB text)
  IF p_image IS NULL OR trim(p_image) = '' THEN
    RAISE EXCEPTION 'Payment proof image is required';
  END IF;

  IF octet_length(p_image) > 7500000 THEN
    RAISE EXCEPTION 'Payment proof image exceeds maximum allowed size of 5MB';
  END IF;

  IF p_image NOT LIKE 'data:image/%' AND p_image NOT LIKE 'http://%' AND p_image NOT LIKE 'https://%' AND p_image NOT LIKE 'payment-proofs/%' THEN
    RAISE EXCEPTION 'Invalid payment proof image format. Must be an image data URL or valid image reference';
  END IF;

  -- Locate order and verify caller authorization:
  -- 1) Authenticated customer owns order
  -- 2) Anonymous caller provides matching guest token (min 16 chars)
  -- 3) Authenticated user is an administrator
  SELECT id, status, proof_status INTO v_order_id, v_current_status, v_current_proof_status
  FROM public.orders
  WHERE code = trim(p_code)
    AND (
      (v_current_user IS NOT NULL AND user_id = v_current_user)
      OR (p_token IS NOT NULL AND length(trim(p_token)) >= 16 AND guest_lookup_token = trim(p_token))
      OR (EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = v_current_user))
    );

  IF v_order_id IS NULL THEN
    RAISE EXCEPTION 'Order not found or unauthorized to submit payment proof';
  END IF;

  -- Enforce permitted order statuses before accepting proof
  IF v_current_status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'Cannot submit payment proof for % order', v_current_status;
  END IF;

  IF v_current_proof_status = 'verified' THEN
    RAISE EXCEPTION 'Payment proof has already been verified for this order';
  END IF;

  IF v_current_status NOT IN ('payment_pending', 'placed', 'pending') THEN
    RAISE EXCEPTION 'Payment proof cannot be submitted for order in state "%"', v_current_status;
  END IF;

  -- Update strictly customer-permitted fields; customer cannot approve or change totals
  UPDATE public.orders
  SET proof_image = p_image,
      proof_note = coalesce(trim(p_note), proof_note),
      proof_status = 'pending'
  WHERE id = v_order_id;

  RETURN TRUE;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_payment_proof(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_payment_proof(text, text, text, text) TO anon, authenticated, service_role;

-- Backward-compatible wrapper
CREATE OR REPLACE FUNCTION public.submit_guest_payment_proof(
  p_code text,
  p_token text,
  p_image text,
  p_note text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN public.submit_payment_proof(p_code, p_token, p_image, p_note);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_guest_payment_proof(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_guest_payment_proof(text, text, text, text) TO anon, authenticated, service_role;

-- 2. Administrator Order Status Transition
CREATE OR REPLACE FUNCTION public.admin_update_order_status(
  p_code text,
  p_status text,
  p_staff_note text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_current_status text;
  v_service_type text;
  v_payment_method text;
  v_proof_status text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: administrator privilege required';
  END IF;

  p_status := lower(trim(p_status));
  IF p_status IN ('out for delivery', 'out_for_delivery', 'on the way') THEN
    p_status := 'dispatched';
  ELSIF p_status IN ('ready for pickup', 'ready_for_pickup') THEN
    p_status := 'ready';
  END IF;

  IF p_status NOT IN ('placed', 'payment_pending', 'accepted', 'preparing', 'ready', 'dispatched', 'completed', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid order status: %', p_status;
  END IF;

  SELECT status, service_type, payment_method, proof_status 
  INTO v_current_status, v_service_type, v_payment_method, v_proof_status
  FROM public.orders
  WHERE code = trim(p_code);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found: %', p_code;
  END IF;

  IF v_current_status = 'cancelled' AND p_status <> 'cancelled' THEN
    RAISE EXCEPTION 'Cannot modify status of cancelled order %', p_code;
  END IF;

  IF v_current_status = 'completed' AND p_status NOT IN ('completed') THEN
    RAISE EXCEPTION 'Cannot modify status of completed order %', p_code;
  END IF;

  -- Non-delivery orders cannot be set to 'dispatched'
  IF p_status = 'dispatched' AND v_service_type <> 'delivery' THEN
    RAISE EXCEPTION 'Out for delivery stage is only applicable to delivery orders. This is a % order.', v_service_type;
  END IF;

  -- Electronic payment orders cannot move to kitchen stages without verified payment
  IF p_status IN ('accepted', 'preparing', 'ready', 'dispatched', 'completed')
     AND v_payment_method <> 'cash'
     AND v_proof_status NOT IN ('approved', 'verified') THEN
    RAISE EXCEPTION 'Cannot set status to "%": Payment proof must be approved first for % payment', p_status, v_payment_method;
  END IF;

  UPDATE public.orders
  SET status = p_status,
      staff_note = coalesce(p_staff_note, staff_note)
  WHERE code = trim(p_code);

  RETURN TRUE;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_update_order_status(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_update_order_status(text, text, text) TO authenticated, service_role;

-- 3. Administrator Payment Proof Approval
CREATE OR REPLACE FUNCTION public.admin_approve_payment_proof(
  p_code text,
  p_staff_note text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_proof_image text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: administrator privilege required';
  END IF;

  SELECT proof_image INTO v_proof_image
  FROM public.orders
  WHERE code = trim(p_code);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found: %', p_code;
  END IF;

  IF v_proof_image IS NULL OR trim(v_proof_image) = '' THEN
    RAISE EXCEPTION 'Cannot approve order %: no payment proof image has been submitted', p_code;
  END IF;

  UPDATE public.orders
  SET proof_status = 'approved',
      staff_note = coalesce(p_staff_note, staff_note)
  WHERE code = trim(p_code);

  RETURN TRUE;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_approve_payment_proof(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_approve_payment_proof(text, text) TO authenticated, service_role;

-- 4. Administrator Payment Proof Rejection
CREATE OR REPLACE FUNCTION public.admin_reject_payment_proof(
  p_code text,
  p_staff_note text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: administrator privilege required';
  END IF;

  UPDATE public.orders
  SET proof_status = 'rejected',
      staff_note = coalesce(p_staff_note, staff_note)
  WHERE code = trim(p_code);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found: %', p_code;
  END IF;

  RETURN TRUE;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_reject_payment_proof(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_reject_payment_proof(text, text) TO authenticated, service_role;

-- 5. Secure Customer Order Claiming by Secret Guest Token
CREATE OR REPLACE FUNCTION public.claim_guest_order(p_code text, p_token text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required to link orders';
  END IF;

  IF p_code IS NULL OR trim(p_code) = '' OR p_token IS NULL OR trim(p_token) = '' THEN
    RAISE EXCEPTION 'Order code and guest token are required to claim an order';
  END IF;

  -- If order is already owned by this user, return true (idempotent)
  IF EXISTS (
    SELECT 1 FROM public.orders
    WHERE code = trim(p_code)
      AND guest_lookup_token = trim(p_token)
      AND user_id = v_user_id
  ) THEN
    RETURN TRUE;
  END IF;

  -- Strictly associate ONLY if the caller provides the secret cryptographic guest_lookup_token
  UPDATE public.orders
  SET user_id = v_user_id
  WHERE code = trim(p_code)
    AND guest_lookup_token = trim(p_token)
    AND user_id IS NULL;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  RETURN TRUE;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_guest_order(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_guest_order(text, text) TO authenticated, service_role;

-- 6. Claim Orders by Verified Auth Phone Number (Never accepts arbitrary client-supplied phone)
CREATE OR REPLACE FUNCTION public.claim_verified_phone_orders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_phone text;
  v_claimed integer := 0;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required to claim orders';
  END IF;

  -- Only allow if the phone number was verified cryptographically by Supabase Auth OTP
  IF coalesce((auth.jwt() ->> 'phone_verified')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Phone number must be verified via Supabase Auth before claiming orders by phone';
  END IF;

  v_phone := trim(coalesce(auth.jwt() ->> 'phone', ''));
  IF v_phone = '' THEN
    RAISE EXCEPTION 'No verified phone number found in authentication session';
  END IF;

  UPDATE public.orders
  SET user_id = v_user_id
  WHERE user_id IS NULL
    AND phone = v_phone;

  GET DIAGNOSTICS v_claimed = ROW_COUNT;
  RETURN v_claimed;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_verified_phone_orders() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_verified_phone_orders() TO authenticated, service_role;


-- ------------------------------------------------------------------------------
-- SECTION 9: GUEST ORDER RETRIEVAL RPCs (MINIMAL DATA EXPOSURE)
-- ------------------------------------------------------------------------------

-- 1. Single guest order lookup (Requires code + unpredictable secret token)
CREATE OR REPLACE FUNCTION public.get_guest_order(p_code text, p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
DECLARE
  v_order jsonb;
  v_items jsonb;
BEGIN
  IF p_token IS NULL OR trim(p_token) = '' OR length(trim(p_token)) < 16 OR p_code IS NULL OR trim(p_code) = '' THEN
    RETURN NULL;
  END IF;

  -- Select strictly customer-facing fields; NEVER return guest_lookup_token or user_id
  SELECT jsonb_build_object(
    'id', o.id,
    'code', o.code,
    'created_at', o.created_at,
    'scheduled_for', o.scheduled_for,
    'customer_name', o.customer_name,
    'phone', o.phone,
    'service_type', o.service_type,
    'zone', o.zone,
    'distance_km', o.distance_km,
    'address', o.address,
    'subtotal', o.subtotal,
    'delivery_fee', o.delivery_fee,
    'service_charge', o.service_charge,
    'total', o.total,
    'payment_method', o.payment_method,
    'proof_status', o.proof_status,
    'proof_image', o.proof_image,
    'proof_note', o.proof_note,
    'status', o.status,
    'eta', o.eta,
    'staff_note', o.staff_note
  ) INTO v_order
  FROM public.orders o
  WHERE o.code = trim(p_code)
    AND o.guest_lookup_token IS NOT NULL
    AND o.guest_lookup_token = trim(p_token);

  IF v_order IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', oi.id,
    'order_id', oi.order_id,
    'menu_item_id', oi.menu_item_id,
    'name', oi.name,
    'base_price', oi.base_price,
    'quantity', oi.quantity,
    'base_choice', oi.base_choice,
    'spice_level', oi.spice_level,
    'extras', oi.extras,
    'extra_price', oi.extra_price,
    'item_total', oi.item_total,
    'note', oi.note
  )), '[]'::jsonb) INTO v_items
  FROM public.order_items oi
  WHERE oi.order_id = (v_order->>'id')::uuid;

  RETURN jsonb_build_object(
    'order', v_order,
    'items', v_items
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_guest_order(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_guest_order(text, text) TO anon, authenticated, service_role;

-- 2. Batch guest order lookup (capped at 25 orders)
CREATE OR REPLACE FUNCTION public.get_guest_orders(p_orders jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
DECLARE
  v_item jsonb;
  v_code text;
  v_token text;
  v_order jsonb;
  v_items jsonb;
  v_result jsonb := '[]'::jsonb;
BEGIN
  IF p_orders IS NULL OR jsonb_typeof(p_orders) <> 'array' OR jsonb_array_length(p_orders) = 0 THEN
    RETURN '[]'::jsonb;
  END IF;

  IF jsonb_array_length(p_orders) > 25 THEN
    RAISE EXCEPTION 'Batch lookup limit is 25 orders';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_orders)
  LOOP
    v_code := trim(coalesce(v_item->>'code', ''));
    v_token := trim(coalesce(v_item->>'token', ''));

    IF v_code <> '' AND v_token <> '' AND length(v_token) >= 16 THEN
      SELECT jsonb_build_object(
        'id', o.id,
        'code', o.code,
        'created_at', o.created_at,
        'scheduled_for', o.scheduled_for,
        'customer_name', o.customer_name,
        'phone', o.phone,
        'service_type', o.service_type,
        'zone', o.zone,
        'distance_km', o.distance_km,
        'address', o.address,
        'subtotal', o.subtotal,
        'delivery_fee', o.delivery_fee,
        'service_charge', o.service_charge,
        'total', o.total,
        'payment_method', o.payment_method,
        'proof_status', o.proof_status,
        'proof_image', o.proof_image,
        'proof_note', o.proof_note,
        'status', o.status,
        'eta', o.eta,
        'staff_note', o.staff_note
      ) INTO v_order
      FROM public.orders o
      WHERE o.code = v_code
        AND o.guest_lookup_token IS NOT NULL
        AND o.guest_lookup_token = v_token;

      IF v_order IS NOT NULL THEN
        SELECT coalesce(jsonb_agg(jsonb_build_object(
          'id', oi.id,
          'order_id', oi.order_id,
          'menu_item_id', oi.menu_item_id,
          'name', oi.name,
          'base_price', oi.base_price,
          'quantity', oi.quantity,
          'base_choice', oi.base_choice,
          'spice_level', oi.spice_level,
          'extras', oi.extras,
          'extra_price', oi.extra_price,
          'item_total', oi.item_total,
          'note', oi.note
        )), '[]'::jsonb) INTO v_items
        FROM public.order_items oi
        WHERE oi.order_id = (v_order->>'id')::uuid;

        v_result := v_result || jsonb_build_array(jsonb_build_object(
          'order', v_order,
          'items', v_items
        ));
      END IF;
    END IF;
  END LOOP;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_guest_orders(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_guest_orders(jsonb) TO anon, authenticated, service_role;

-- 3. Authorized batch order updates RPC (lightweight for routine status polling)
CREATE OR REPLACE FUNCTION public.get_authorized_order_updates(p_orders jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
DECLARE
  v_item jsonb;
  v_code text;
  v_token text;
  v_update jsonb;
  v_result jsonb := '[]'::jsonb;
BEGIN
  IF p_orders IS NULL OR jsonb_typeof(p_orders) <> 'array' OR jsonb_array_length(p_orders) = 0 THEN
    RETURN '[]'::jsonb;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_orders)
  LOOP
    v_code := trim(coalesce(v_item->>'code', ''));
    v_token := trim(coalesce(v_item->>'token', ''));

    IF v_code <> '' AND v_token <> '' AND length(v_token) >= 16 THEN
      SELECT jsonb_build_object(
        'code', o.code,
        'status', o.status,
        'proof_status', o.proof_status,
        'eta', o.eta,
        'staff_note', o.staff_note
      ) INTO v_update
      FROM public.orders o
      WHERE o.code = v_code
        AND o.guest_lookup_token = v_token;

      IF v_update IS NOT NULL THEN
        v_result := v_result || jsonb_build_array(v_update);
      END IF;
    END IF;
  END LOOP;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_authorized_order_updates(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_authorized_order_updates(jsonb) TO anon, authenticated, service_role;


-- ------------------------------------------------------------------------------
-- SECTION 10: TABLE PRIVILEGES & ROW LEVEL SECURITY OVERHAUL
-- ------------------------------------------------------------------------------

-- REVOKE ALL DEFAULT PUBLIC PRIVILEGES ON ALL TABLES
REVOKE ALL ON public.orders FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.order_items FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.customer_sessions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.profiles FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.admin_users FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.menu_items FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.store_settings FROM PUBLIC, anon, authenticated;

-- Exhaustively drop legacy policies on all tables
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'orders',
        'order_items',
        'menu_items',
        'customer_sessions',
        'profiles',
        'admin_users',
        'store_settings',
        'categories',
        'store_cms'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', pol.policyname, pol.schemaname, pol.tablename);
  END LOOP;
END $$;

-- 1. TABLE: public.orders
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.orders TO authenticated;
GRANT UPDATE, DELETE ON public.orders TO authenticated; -- Scoped strictly to admins via RLS policy

CREATE POLICY "Customers can view their own orders"
ON public.orders
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Admins have full access to orders"
ON public.orders
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());


-- 2. TABLE: public.order_items
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.order_items TO authenticated;
GRANT UPDATE, DELETE ON public.order_items TO authenticated; -- Scoped strictly to admins via RLS policy

CREATE POLICY "Customers can view their own order items"
ON public.order_items
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id 
      AND o.user_id = auth.uid()
  )
);

CREATE POLICY "Admins have full access to order items"
ON public.order_items
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());


-- 3. TABLE: public.customer_sessions
ALTER TABLE public.customer_sessions ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_sessions TO authenticated;

CREATE POLICY "Admins have full access to customer_sessions"
ON public.customer_sessions
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "Users can manage own customer_session"
ON public.customer_sessions
FOR ALL
TO authenticated
USING (lower(phone) = 'email:' || lower(coalesce(auth.jwt() ->> 'email', '')) OR public.is_admin())
WITH CHECK (lower(phone) = 'email:' || lower(coalesce(auth.jwt() ->> 'email', '')) OR public.is_admin());


-- 4. TABLE: public.store_settings (PUBLIC STORE CONFIGURATION)
ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.store_settings TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.store_settings TO authenticated;

CREATE POLICY "Public can view store settings"
ON public.store_settings
FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Admins have full access to store settings"
ON public.store_settings
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());


-- 5. TABLE: public.menu_items (CATALOG)
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.menu_items TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.menu_items TO authenticated;

CREATE POLICY "Public can view menu items"
ON public.menu_items
FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Admins have full access to menu_items"
ON public.menu_items
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());


-- 6. TABLE: public.profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

GRANT SELECT, UPDATE ON public.profiles TO authenticated;

CREATE POLICY "Users can view own profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

CREATE POLICY "Admins have full access to profiles"
ON public.profiles
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());


-- 7. TABLE: public.admin_users
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

-- Defense-in-depth: Revoke all direct write access from authenticated & public roles
GRANT SELECT ON public.admin_users TO authenticated;

CREATE POLICY "Users can view admin status"
ON public.admin_users
FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "Admins have full access to admin_users"
ON public.admin_users
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());


-- 8. STORAGE CONFIGURATION FOR PAYMENT PROOFS (IF STORAGE SCHEMA IS INSTALLED)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'buckets') THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
      'payment-proofs',
      'payment-proofs',
      false,
      5242880,
      ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic']::text[]
    )
    ON CONFLICT (id) DO UPDATE SET
      public = false,
      file_size_limit = 5242880,
      allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic']::text[];
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'objects') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Admins have full access to payment proofs" ON storage.objects';
    EXECUTE 'CREATE POLICY "Admins have full access to payment proofs" ON storage.objects FOR ALL TO authenticated USING (bucket_id = ''payment-proofs'' AND public.is_admin()) WITH CHECK (bucket_id = ''payment-proofs'' AND public.is_admin())';

    EXECUTE 'DROP POLICY IF EXISTS "Allow upload to payment-proofs" ON storage.objects';
    EXECUTE 'CREATE POLICY "Allow upload to payment-proofs" ON storage.objects FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = ''payment-proofs'')';
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- ==============================================================================
-- END OF SECURE MIGRATION SPECIFICATION
-- ==============================================================================
