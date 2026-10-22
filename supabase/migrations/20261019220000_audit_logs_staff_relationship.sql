-- ============================================================================
-- Rekik Café — Audit Logs & Staff Profiles Foreign Key Relationship
-- Migration: 20261019220000_audit_logs_staff_relationship.sql
-- ============================================================================
-- Establishes the foreign key relationship between audit_logs.actor_user_id
-- and staff_profiles.user_id, enabling PostgREST to automatically embed
-- staff details in audit log queries as specified in the Database Workflow Guide.
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_audit_logs_actor_staff'
  ) THEN
    ALTER TABLE public.audit_logs
      ADD CONSTRAINT fk_audit_logs_actor_staff
      FOREIGN KEY (actor_user_id) REFERENCES public.staff_profiles(user_id)
      ON DELETE SET NULL;
  END IF;
END $$;
