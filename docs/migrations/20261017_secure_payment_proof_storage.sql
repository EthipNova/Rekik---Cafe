-- ==============================================================================
-- GURSHA CAFE: SECURE PAYMENT PROOF STORAGE CONFIGURATION
-- File: supabase/migrations/20261017_secure_payment_proof_storage.sql
-- Applied to: Staging Supabase Project qwmgiamqheqadpyfrqvr
-- ==============================================================================
-- 1. Verifies/creates the private 'payment-proofs' bucket in storage.buckets
-- 2. Sets up least-privilege RLS policies on storage.objects:
--    - Public cannot list or browse storage objects
--    - Anonymous and authenticated users can insert (upload) payment proofs
--    - Verified administrators (public.is_admin()) have full SELECT/UPDATE/DELETE access
--    - Authenticated customers can read payment proofs linked to their own orders
-- ==============================================================================

DO $$
BEGIN
  -- 1. Ensure private storage bucket exists
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

  -- 2. Ensure RLS is active on storage.objects
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'objects') THEN
    EXECUTE 'ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY';

    -- Drop legacy / duplicate policies on storage.objects for payment-proofs
    EXECUTE 'DROP POLICY IF EXISTS "Admins have full access to payment proofs" ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS "Allow upload to payment-proofs" ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS "Customers can view own payment proofs" ON storage.objects';

    -- Policy 1: Verified administrators have full management access
    EXECUTE 'CREATE POLICY "Admins have full access to payment proofs" ON storage.objects
      FOR ALL
      TO authenticated
      USING (bucket_id = ''payment-proofs'' AND public.is_admin())
      WITH CHECK (bucket_id = ''payment-proofs'' AND public.is_admin())';

    -- Policy 2: Allow upload of payment proof files by anon and authenticated callers
    EXECUTE 'CREATE POLICY "Allow upload to payment-proofs" ON storage.objects
      FOR INSERT
      TO anon, authenticated
      WITH CHECK (
        bucket_id = ''payment-proofs''
        AND (lower(storage.extension(name)) = ANY(ARRAY[''jpg'', ''jpeg'', ''png'', ''webp'', ''heic'']))
      )';

    -- Policy 3: Authenticated customers can view payment proofs matching their own order codes
    EXECUTE 'CREATE POLICY "Customers can view own payment proofs" ON storage.objects
      FOR SELECT
      TO authenticated
      USING (
        bucket_id = ''payment-proofs''
        AND EXISTS (
          SELECT 1 FROM public.orders o
          WHERE o.user_id = auth.uid()
            AND (
              o.proof_image = (''payment-proofs/'' || name)
              OR name LIKE (o.code || ''_%'')
            )
        )
      )';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Notice: Storage schema or objects table not available in current environment: %', SQLERRM;
END $$;
