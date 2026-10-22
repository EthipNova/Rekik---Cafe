-- ============================================================================
-- NEBA Café — Migration 1: Extend user_role enum with 'CUSTOMER'
-- File: supabase/migrations/20260918155900_add_customer_role_enum.sql
-- ============================================================================
-- In PostgreSQL, ALTER TYPE ... ADD VALUE cannot be executed in the same
-- transaction block where the new enum value is referenced/cast.
-- This dedicated migration isolates the enum addition so that it is committed
-- before subsequent migrations compile functions or run queries referencing
-- 'CUSTOMER'::public.user_role.
-- ============================================================================

ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'CUSTOMER';
