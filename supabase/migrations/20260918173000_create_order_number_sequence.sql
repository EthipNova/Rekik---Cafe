-- Migration: 20260918173000_create_order_number_sequence.sql
-- Purpose: Introduce an atomic, concurrency-safe PostgreSQL sequence for order numbers.
-- Starts at 2000 to completely avoid collision with existing orders in the #1000-#1090 range.

-- 1. Create the sequence
CREATE SEQUENCE IF NOT EXISTS public.orders_order_number_seq
  START WITH 2000
  INCREMENT BY 1
  MINVALUE 2000
  NO MAXVALUE
  CACHE 1;

-- 2. Create the SECURITY DEFINER function to draw the next order number atomically
CREATE OR REPLACE FUNCTION public.next_order_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_num bigint;
BEGIN
  v_num := nextval('public.orders_order_number_seq');
  RETURN '#' || v_num::text;
END;
$$;

-- 3. Grant minimum required execution permission on the function
GRANT EXECUTE ON FUNCTION public.next_order_number() TO anon, authenticated, service_role;
