-- ============================================================================
-- Rekik Café — Menu Category Cover Images Migration
-- File: supabase/migrations/20261109230000_category_cover_images.sql
-- ============================================================================
-- Purpose:
-- 1. Ensure `image_url` column exists on public.categories for cover images.
-- 2. Confirm public read access for category cover images.
-- 3. Confirm staff/admin update permissions on categories with image_url.
-- ============================================================================

-- 1. Ensure image_url column exists on public.categories
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS image_url TEXT;

-- 2. Comment on column for schema documentation
COMMENT ON COLUMN public.categories.image_url IS 'Public storage URL for category cover image (stored in product-images bucket under categories/)';

-- 3. Storage bucket: Category cover images reuse the existing public 'product-images' bucket
-- Path structure: categories/<category_id>/<unique_id>.<ext>
-- Public read & staff write access are already covered by 20261019200000_product_images_storage.sql

