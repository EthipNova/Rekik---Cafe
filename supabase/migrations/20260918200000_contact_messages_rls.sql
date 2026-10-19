-- ============================================================================
-- NEBA Café — Migration: Allow Admin and Staff to manage contact messages
-- File: supabase/migrations/20260918200000_contact_messages_rls.sql
-- ============================================================================

-- 1. Ensure RLS is active on public.contact_messages
ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing policy that only allowed ADMIN via is_admin()
DROP POLICY IF EXISTS "Admins can manage contact messages" ON public.contact_messages;
DROP POLICY IF EXISTS "Staff can manage contact messages" ON public.contact_messages;
DROP POLICY IF EXISTS "Anyone can submit contact messages" ON public.contact_messages;

-- 3. Preserve public anonymous and authenticated INSERT capability
CREATE POLICY "Anyone can submit contact messages"
  ON public.contact_messages FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- 4. Allow ADMIN and STAFF full management (SELECT, UPDATE, DELETE) via is_admin_or_staff()
CREATE POLICY "Staff can manage contact messages"
  ON public.contact_messages FOR ALL
  TO authenticated
  USING (public.is_admin_or_staff())
  WITH CHECK (public.is_admin_or_staff());
