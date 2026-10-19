-- ============================================================================
-- NEBA Café — Migration 6: Confirm Admin and Provision Staff / Customer B
-- File: supabase/migrations/20260918193000_confirm_admin_and_staff.sql
-- ============================================================================

DO $$
DECLARE
  v_admin_pwd text;
  v_admin_inst uuid;
  v_cust_pwd text;
  v_cust_inst uuid;
  v_staff_id uuid := 'a1111111-1111-1111-1111-111111111111'::uuid;
  v_cust_b_id uuid := 'b2222222-2222-2222-2222-222222222222'::uuid;
BEGIN
  -- 1. Confirm Admin account and elevate role to ADMIN
  UPDATE auth.users
  SET email_confirmed_at = COALESCE(email_confirmed_at, now())
  WHERE email = 'admin.1789748404257@nebacafe.com';

  UPDATE public.users
  SET role = 'ADMIN'::public.user_role
  WHERE email = 'admin.1789748404257@nebacafe.com';

  -- Get encrypted password & instance from admin
  SELECT encrypted_password, instance_id INTO v_admin_pwd, v_admin_inst
  FROM auth.users
  WHERE email = 'admin.1789748404257@nebacafe.com';

  -- 2. Provision Staff test account if not exists
  IF v_admin_pwd IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'staff.test@nebacafe.com') THEN
      INSERT INTO auth.users (
        id, instance_id, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at
      ) VALUES (
        v_staff_id, v_admin_inst, 'staff.test@nebacafe.com', v_admin_pwd, now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        '{"full_name":"NEBA Staff","role":"STAFF"}'::jsonb,
        'authenticated', 'authenticated', now(), now()
      );

      INSERT INTO auth.identities (
        id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
      ) VALUES (
        v_staff_id, v_staff_id,
        jsonb_build_object('sub', v_staff_id, 'email', 'staff.test@nebacafe.com'),
        'email', v_staff_id::text, now(), now(), now()
      );
    END IF;

    -- Ensure public.users has STAFF role
    INSERT INTO public.users (id, email, role, full_name, created_at, updated_at)
    VALUES (v_staff_id, 'staff.test@nebacafe.com', 'STAFF'::public.user_role, 'NEBA Staff', now(), now())
    ON CONFLICT (id) DO UPDATE SET role = 'STAFF'::public.user_role;
  END IF;

  -- 3. Provision Customer B test account if not exists
  SELECT encrypted_password, instance_id INTO v_cust_pwd, v_cust_inst
  FROM auth.users
  WHERE email = 'neba.customer.1789737223571@gmail.com';

  IF v_cust_pwd IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'neba.customer.b.test@gmail.com') THEN
      INSERT INTO auth.users (
        id, instance_id, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at
      ) VALUES (
        v_cust_b_id, v_cust_inst, 'neba.customer.b.test@gmail.com', v_cust_pwd, now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        '{"full_name":"Customer B","role":"CUSTOMER","phone":"0922000002"}'::jsonb,
        'authenticated', 'authenticated', now(), now()
      );

      INSERT INTO auth.identities (
        id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
      ) VALUES (
        v_cust_b_id, v_cust_b_id,
        jsonb_build_object('sub', v_cust_b_id, 'email', 'neba.customer.b.test@gmail.com'),
        'email', v_cust_b_id::text, now(), now(), now()
      );
    END IF;

    -- Ensure public.users and public.customers have records
    INSERT INTO public.users (id, email, role, full_name, created_at, updated_at)
    VALUES (v_cust_b_id, 'neba.customer.b.test@gmail.com', 'CUSTOMER'::public.user_role, 'Customer B', now(), now())
    ON CONFLICT (id) DO UPDATE SET role = 'CUSTOMER'::public.user_role;

    INSERT INTO public.customers (id, user_id, name, email, phone, created_at, updated_at)
    VALUES (gen_random_uuid(), v_cust_b_id, 'Customer B', 'neba.customer.b.test@gmail.com', '0922000002', now(), now())
    ON CONFLICT (user_id) WHERE user_id IS NOT NULL DO NOTHING;
  END IF;
END $$;
