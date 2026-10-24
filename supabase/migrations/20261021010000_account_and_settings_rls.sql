-- ============================================================================
-- Rekik Café — Secure Account & Store Settings RLS and Avatars Storage
-- Migration: 20261021010000_account_and_settings_rls.sql
-- ============================================================================
-- Objectives:
-- 1. Row-Level Security for public.store_settings:
--    - Public / Anon / Authenticated: SELECT (customers need store info & delivery pricing)
--    - Admins: INSERT, UPDATE, DELETE (via public.is_admin())
--    - Non-destructive singleton seed if table is currently empty
-- 2. Storage Bucket & Policies for 'avatars':
--    - Ensure 'avatars' public bucket exists in storage.buckets with 5MB limit
--    - Public read access for avatar images
--    - Authenticated users / admins can upload, update, and delete their own avatars
-- 3. Row-Level Security for public.users:
--    - Ensure users can read and update their own profile without recursion
--    - Admins and staff can view users for operational support
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Row-Level Security on public.store_settings
-- ----------------------------------------------------------------------------
ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read store settings" ON public.store_settings;
DROP POLICY IF EXISTS "Public can view store settings" ON public.store_settings;
DROP POLICY IF EXISTS "Admins can manage store settings" ON public.store_settings;
DROP POLICY IF EXISTS "Admins can update store settings" ON public.store_settings;

-- 1.1 Anyone can read café store settings (needed for store details, delivery calculations, receipts)
CREATE POLICY "Anyone can read store settings"
  ON public.store_settings FOR SELECT
  TO anon, authenticated
  USING (true);

-- 1.2 Only authorized administrators can insert, update, or delete store settings
CREATE POLICY "Admins can manage store settings"
  ON public.store_settings FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 1.3 Ensure singleton row exists if table is empty
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.store_settings LIMIT 1) THEN
    INSERT INTO public.store_settings (
      cafe_name,
      phone,
      email,
      address,
      opening_hours,
      delivery_fee,
      delivery_enabled,
      price_per_km,
      min_delivery_fee,
      max_delivery_distance_km,
      rounding_rule,
      created_at,
      updated_at
    ) VALUES (
      'Rekik Café',
      '+251 91 123 4567',
      'info@rekikcafe.com',
      'Bole Sub-City, Addis Ababa, Ethiopia',
      'Mon - Sun: 7:00 AM - 10:00 PM',
      50.00,
      true,
      20.00,
      50.00,
      15.00,
      'nearest_5',
      now(),
      now()
    );
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2. Storage Bucket & RLS Policies for 'avatars'
-- ----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE
SET public = true,
    file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

-- Storage Object Policies for 'avatars'
DROP POLICY IF EXISTS "Public can view avatars" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete own avatar" ON storage.objects;

-- 2.1 Public read access for avatar images
CREATE POLICY "Public can view avatars"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'avatars');

-- 2.2 Authenticated users can upload to avatars/<uid>/... or admins can upload
CREATE POLICY "Authenticated users can upload own avatar"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars' AND (
      (storage.foldername(name))[1] = auth.uid()::text OR public.is_admin()
    )
  );

-- 2.3 Authenticated users can update own avatars
CREATE POLICY "Authenticated users can update own avatar"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars' AND (
      (storage.foldername(name))[1] = auth.uid()::text OR public.is_admin()
    )
  );

-- 2.4 Authenticated users can delete own avatars
CREATE POLICY "Authenticated users can delete own avatar"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'avatars' AND (
      (storage.foldername(name))[1] = auth.uid()::text OR public.is_admin()
    )
  );

-- ----------------------------------------------------------------------------
-- 3. Secure public.users RLS Policies
-- ----------------------------------------------------------------------------
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own profile" ON public.users;
DROP POLICY IF EXISTS "Staff can read all users" ON public.users;
DROP POLICY IF EXISTS "Users and staff can update profile" ON public.users;

-- 3.1 Authenticated users can read their own profile, staff/admins can read all profiles
CREATE POLICY "Users and staff can read users"
  ON public.users FOR SELECT
  TO authenticated
  USING (
    id = auth.uid()
    OR public.is_admin_or_staff()
  );

-- 3.2 Users can update their own profile, admins can manage all users
CREATE POLICY "Users and staff can update profile"
  ON public.users FOR UPDATE
  TO authenticated
  USING (
    id = auth.uid()
    OR public.is_admin()
  )
  WITH CHECK (
    id = auth.uid()
    OR public.is_admin()
  );
