-- ============================================================================
-- NEBA Café — Migration: Distance-Based Delivery Pricing System
-- File: supabase/migrations/20260919120000_distance_based_delivery.sql
-- ============================================================================

-- 1. Extend store_settings with dynamic distance pricing configuration
ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS cafe_latitude NUMERIC(10, 7) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS cafe_longitude NUMERIC(10, 7) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS price_per_km NUMERIC(10, 2) NOT NULL DEFAULT 20.00,
  ADD COLUMN IF NOT EXISTS min_delivery_fee NUMERIC(10, 2) NOT NULL DEFAULT 50.00,
  ADD COLUMN IF NOT EXISTS max_delivery_distance_km NUMERIC(10, 2) NOT NULL DEFAULT 15.00,
  ADD COLUMN IF NOT EXISTS delivery_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS rounding_rule TEXT NOT NULL DEFAULT 'nearest_5';

-- Add CHECK constraints for store_settings
ALTER TABLE public.store_settings
  DROP CONSTRAINT IF EXISTS check_store_delivery_settings;

ALTER TABLE public.store_settings
  ADD CONSTRAINT check_store_delivery_settings CHECK (
    price_per_km >= 0 AND
    min_delivery_fee >= 0 AND
    max_delivery_distance_km > 0 AND
    (cafe_latitude IS NULL OR (cafe_latitude >= -90 AND cafe_latitude <= 90)) AND
    (cafe_longitude IS NULL OR (cafe_longitude >= -180 AND cafe_longitude <= 180)) AND
    rounding_rule IN ('none', 'nearest_1', 'nearest_5', 'ceil')
  );

-- Update singleton store settings record (id = 1) with approved initial values
-- NOTE: cafe_latitude and cafe_longitude REMAIN NULL until explicitly set by the café owner.
UPDATE public.store_settings
SET
  price_per_km = 20.00,
  min_delivery_fee = 50.00,
  max_delivery_distance_km = 15.00,
  delivery_enabled = true,
  rounding_rule = 'nearest_5'
WHERE id = 1;

-- 2. Extend orders table with customer coordinate and distance snapshots
-- Existing orders retain NULL for these new columns without altering historical totals or delivery fees.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_latitude NUMERIC(10, 7) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS delivery_longitude NUMERIC(10, 7) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS delivery_distance_km NUMERIC(10, 2) DEFAULT NULL;
