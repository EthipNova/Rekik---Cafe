-- ============================================================================
-- Rekik Café — Product Images Storage Bucket & Security Policies
-- File: supabase/migrations/20261019200000_product_images_storage.sql
-- ============================================================================
-- Establishes:
-- 1. 'product-images' storage bucket for menu items (public read, 5MB limit)
-- 2. MIME type constraints: image/jpeg, image/png, image/webp, image/jpg
-- 3. Public access policy on storage.buckets for public metadata resolution
-- 4. Granular RLS policies on storage.objects for product images:
--    - Public (anon + authenticated) can view/download product images
--    - Authenticated admin/staff can upload, update, and delete product images
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Ensure 'product-images' Bucket Exists
-- ----------------------------------------------------------------------------
INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
) VALUES (
  'product-images',
  'product-images',
  true,
  5242880, -- 5 MB file size limit
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/jpg']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];

-- ----------------------------------------------------------------------------
-- 2. Storage Buckets RLS Policy
-- ----------------------------------------------------------------------------
-- Allows client SDK getBucket calls to resolve metadata for public buckets
DROP POLICY IF EXISTS "Public can view public buckets" ON storage.buckets;
CREATE POLICY "Public can view public buckets"
  ON storage.buckets FOR SELECT
  TO anon, authenticated
  USING (public = true);

-- ----------------------------------------------------------------------------
-- 3. Storage Objects RLS Policies for product-images
-- ----------------------------------------------------------------------------
-- Public read access so diners and website visitors can view menu images
DROP POLICY IF EXISTS "Public can view product images" ON storage.objects;
CREATE POLICY "Public can view product images"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'product-images');

-- Authenticated Staff & Admin upload (INSERT) access
DROP POLICY IF EXISTS "Staff can upload product images" ON storage.objects;
CREATE POLICY "Staff can upload product images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'product-images'
    AND (
      public.is_admin_or_staff()
      OR EXISTS (
        SELECT 1 FROM public.staff_profiles
        WHERE user_id = auth.uid()
          AND is_active = true
          AND lower(role) IN ('admin', 'manager', 'staff', 'cashier')
      )
    )
  );

-- Authenticated Staff & Admin update access
DROP POLICY IF EXISTS "Staff can update product images" ON storage.objects;
CREATE POLICY "Staff can update product images"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'product-images'
    AND (
      public.is_admin_or_staff()
      OR EXISTS (
        SELECT 1 FROM public.staff_profiles
        WHERE user_id = auth.uid()
          AND is_active = true
          AND lower(role) IN ('admin', 'manager', 'staff', 'cashier')
      )
    )
  )
  WITH CHECK (
    bucket_id = 'product-images'
    AND (
      public.is_admin_or_staff()
      OR EXISTS (
        SELECT 1 FROM public.staff_profiles
        WHERE user_id = auth.uid()
          AND is_active = true
          AND lower(role) IN ('admin', 'manager', 'staff', 'cashier')
      )
    )
  );

-- Authenticated Staff & Admin delete access
DROP POLICY IF EXISTS "Staff can delete product images" ON storage.objects;
CREATE POLICY "Staff can delete product images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'product-images'
    AND (
      public.is_admin_or_staff()
      OR EXISTS (
        SELECT 1 FROM public.staff_profiles
        WHERE user_id = auth.uid()
          AND is_active = true
          AND lower(role) IN ('admin', 'manager', 'staff', 'cashier')
      )
    )
  );

