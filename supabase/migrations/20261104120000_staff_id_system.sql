-- ============================================================================
-- Rekik Café — Staff ID Architecture & Login Identification Migration
-- File: supabase/migrations/20261104120000_staff_id_system.sql
-- ============================================================================
-- 1. Adds human-readable, unique, permanent Staff ID (e.g. RK-001, RK-002, ...)
--    to public.staff_profiles table.
-- 2. Creates unique index on staff_id ensuring zero duplicate Staff IDs.
-- 3. Backfills existing staff members with their designated Staff IDs.
-- ============================================================================

-- 1. Add staff_id column to public.staff_profiles
ALTER TABLE public.staff_profiles
  ADD COLUMN IF NOT EXISTS staff_id text;

-- 2. Create unique index for rapid lookup and uniqueness guarantee
CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_profiles_staff_id
  ON public.staff_profiles(staff_id)
  WHERE staff_id IS NOT NULL;

-- 3. Backfill baseline staff members with permanent Staff IDs
UPDATE public.staff_profiles
  SET staff_id = 'RK-001'
  WHERE user_id = '5d2b434b-0b18-461b-a12d-9a93ac8fc92a'::uuid
    AND (staff_id IS NULL OR staff_id = '');

UPDATE public.staff_profiles
  SET staff_id = 'RK-002'
  WHERE user_id = 'e9504215-7be6-489d-8471-83a86eb9ef4e'::uuid
    AND (staff_id IS NULL OR staff_id = '');

UPDATE public.staff_profiles
  SET staff_id = 'RK-003'
  WHERE user_id = 'e145d152-0ecb-43d6-863c-06fa40c12db4'::uuid
    AND (staff_id IS NULL OR staff_id = '');

UPDATE public.staff_profiles
  SET staff_id = 'RK-004'
  WHERE user_id = '9ce996c4-d645-4480-be49-629f85343ae0'::uuid
    AND (staff_id IS NULL OR staff_id = '');

UPDATE public.staff_profiles
  SET staff_id = 'RK-005'
  WHERE user_id = 'a5c18c86-c102-4355-b713-e93975e0a689'::uuid
    AND (staff_id IS NULL OR staff_id = '');

UPDATE public.staff_profiles
  SET staff_id = 'RK-006'
  WHERE user_id = '593c8d07-904a-4f10-9571-dbf4c6af7250'::uuid
    AND (staff_id IS NULL OR staff_id = '');

UPDATE public.staff_profiles
  SET staff_id = 'RK-007'
  WHERE user_id = '61bee678-4df9-4061-9843-c35ca3f0cb48'::uuid
    AND (staff_id IS NULL OR staff_id = '');

UPDATE public.staff_profiles
  SET staff_id = 'RK-008'
  WHERE user_id = '5bca6d75-ca78-44ec-8410-5a770ee56bde'::uuid
    AND (staff_id IS NULL OR staff_id = '');

COMMENT ON COLUMN public.staff_profiles.staff_id IS 'Human-readable permanent login identifier (e.g. RK-001, RK-002). Never reused even upon deactivation or deletion.';

