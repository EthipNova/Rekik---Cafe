-- ============================================================================
-- NEBA Café — Migration 8: Clone working auth records for Staff and Customer B
-- File: supabase/migrations/20260918194500_clone_staff_and_customer_b.sql
-- ============================================================================

DO $$
DECLARE
  v_admin_id uuid;
  v_staff_id uuid := 'a1111111-1111-1111-1111-111111111111'::uuid;
  v_cust_b_id uuid := 'b2222222-2222-2222-2222-222222222222'::uuid;
  v_cols_insert text;
  v_cols_select_staff text;
  v_cols_select_cust_b text;
BEGIN
  SELECT id INTO v_admin_id FROM auth.users WHERE email = 'admin.1789748404257@nebacafe.com';
  IF v_admin_id IS NULL THEN
    RETURN;
  END IF;

  DELETE FROM auth.identities WHERE user_id IN (v_staff_id, v_cust_b_id);
  DELETE FROM public.customers WHERE user_id = v_cust_b_id;
  DELETE FROM public.users WHERE id IN (v_staff_id, v_cust_b_id);
  DELETE FROM auth.users WHERE id IN (v_staff_id, v_cust_b_id);

  SELECT string_agg(quote_ident(column_name), ', ')
  INTO v_cols_insert
  FROM information_schema.columns
  WHERE table_schema = 'auth' AND table_name = 'users'
    AND is_generated = 'NEVER';

  -- Staff query
  SELECT string_agg(
    CASE 
      WHEN column_name = 'id' THEN quote_literal(v_staff_id) || '::uuid'
      WHEN column_name = 'email' THEN quote_literal('staff.test@nebacafe.com')
      WHEN column_name = 'raw_user_meta_data' THEN quote_literal('{"full_name":"NEBA Staff","role":"STAFF"}') || '::jsonb'
      WHEN column_name IN ('confirmation_token', 'recovery_token', 'email_change_token_new', 'email_change_token_current', 'phone_change_token') THEN 'NULL'
      ELSE quote_ident(column_name)
    END, ', ')
  INTO v_cols_select_staff
  FROM information_schema.columns
  WHERE table_schema = 'auth' AND table_name = 'users'
    AND is_generated = 'NEVER';

  EXECUTE format('INSERT INTO auth.users (%s) SELECT %s FROM auth.users WHERE id = %L',
    v_cols_insert, v_cols_select_staff, v_admin_id);

  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  SELECT 
    gen_random_uuid(),
    v_staff_id,
    jsonb_build_object('sub', v_staff_id, 'email', 'staff.test@nebacafe.com'),
    provider,
    v_staff_id::text,
    now(),
    now(),
    now()
  FROM auth.identities WHERE user_id = v_admin_id;

  -- Cust B query
  SELECT string_agg(
    CASE 
      WHEN column_name = 'id' THEN quote_literal(v_cust_b_id) || '::uuid'
      WHEN column_name = 'email' THEN quote_literal('neba.customer.b.test@gmail.com')
      WHEN column_name = 'raw_user_meta_data' THEN quote_literal('{"full_name":"Customer B","role":"CUSTOMER","phone":"0922000002"}') || '::jsonb'
      WHEN column_name IN ('confirmation_token', 'recovery_token', 'email_change_token_new', 'email_change_token_current', 'phone_change_token') THEN 'NULL'
      ELSE quote_ident(column_name)
    END, ', ')
  INTO v_cols_select_cust_b
  FROM information_schema.columns
  WHERE table_schema = 'auth' AND table_name = 'users'
    AND is_generated = 'NEVER';

  EXECUTE format('INSERT INTO auth.users (%s) SELECT %s FROM auth.users WHERE id = %L',
    v_cols_insert, v_cols_select_cust_b, v_admin_id);

  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  SELECT 
    gen_random_uuid(),
    v_cust_b_id,
    jsonb_build_object('sub', v_cust_b_id, 'email', 'neba.customer.b.test@gmail.com'),
    provider,
    v_cust_b_id::text,
    now(),
    now(),
    now()
  FROM auth.identities WHERE user_id = v_admin_id;

  -- Ensure public.users and public.customers
  INSERT INTO public.users (id, email, role, full_name, created_at, updated_at)
  VALUES (v_staff_id, 'staff.test@nebacafe.com', 'STAFF'::public.user_role, 'NEBA Staff', now(), now())
  ON CONFLICT (id) DO UPDATE SET role = 'STAFF'::public.user_role;

  INSERT INTO public.users (id, email, role, full_name, created_at, updated_at)
  VALUES (v_cust_b_id, 'neba.customer.b.test@gmail.com', 'CUSTOMER'::public.user_role, 'Customer B', now(), now())
  ON CONFLICT (id) DO UPDATE SET role = 'CUSTOMER'::public.user_role;

  INSERT INTO public.customers (id, user_id, name, email, phone, created_at, updated_at)
  VALUES (gen_random_uuid(), v_cust_b_id, 'Customer B', 'neba.customer.b.test@gmail.com', '0922000002', now(), now())
  ON CONFLICT (user_id) WHERE user_id IS NOT NULL DO NOTHING;

END $$;
