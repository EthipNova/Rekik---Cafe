-- ============================================================================
-- Rekik Café — Initial Menu Categories Seed & RLS Security Configuration
-- File: supabase/migrations/20261019183000_seed_rekik_cafe_categories.sql
-- ============================================================================
-- Safe, non-destructive, idempotent migration to:
-- 1. Ensure Row-Level Security (RLS) policies exist on public.categories:
--    - Public (anon + authenticated) read-only access for menu browsing
--    - Staff/Admin restricted access for category creation and management
-- 2. Populate public.categories with the 12 authorized Rekik Café product categories
--    using the exact existing database schema (id, name, slug, description,
--    is_active, sort_order, created_at, updated_at).
-- 3. Idempotent conflict-handling on slug (categories_slug_key) to preserve
--    existing records, descriptions, and foreign key relationships.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Ensure RLS Protection on public.categories
-- ----------------------------------------------------------------------------
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

-- Allow public (guest visitors and authenticated users) to read active categories
DROP POLICY IF EXISTS "Public can view categories" ON public.categories;
CREATE POLICY "Public can view categories"
  ON public.categories FOR SELECT
  TO anon, authenticated
  USING (true);

-- Restrict category insert/update/delete to authorized ADMIN and STAFF users
DROP POLICY IF EXISTS "Staff can manage categories" ON public.categories;
CREATE POLICY "Staff can manage categories"
  ON public.categories FOR ALL
  TO authenticated
  USING (public.is_admin_or_staff())
  WITH CHECK (public.is_admin_or_staff());

-- ----------------------------------------------------------------------------
-- 2. Seed Initial Rekik Café Menu Categories
-- ----------------------------------------------------------------------------
INSERT INTO public.categories (
  id,
  name,
  slug,
  description,
  is_active,
  sort_order,
  created_at,
  updated_at
) VALUES
  (
    gen_random_uuid(),
    'Coffee',
    'coffee',
    'Freshly brewed coffee, traditional Ethiopian coffee, and other coffee selections.',
    true,
    1,
    now(),
    now()
  ),
  (
    gen_random_uuid(),
    'Espresso',
    'espresso',
    'Espresso-based beverages, including espresso, cappuccino, and latte.',
    true,
    2,
    now(),
    now()
  ),
  (
    gen_random_uuid(),
    'Tea',
    'tea',
    'Traditional tea and a selection of hot tea beverages.',
    true,
    3,
    now(),
    now()
  ),
  (
    gen_random_uuid(),
    'Juice',
    'juice',
    'Fresh fruit juices and blended fruit drinks.',
    true,
    4,
    now(),
    now()
  ),
  (
    gen_random_uuid(),
    'Soft Drinks',
    'soft-drinks',
    'Bottled and canned non-alcoholic refreshments.',
    true,
    5,
    now(),
    now()
  ),
  (
    gen_random_uuid(),
    'Breakfast',
    'breakfast',
    'Breakfast meals and morning food options.',
    true,
    6,
    now(),
    now()
  ),
  (
    gen_random_uuid(),
    'Burgers',
    'burgers',
    'Burgers prepared with available toppings and accompaniments.',
    true,
    7,
    now(),
    now()
  ),
  (
    gen_random_uuid(),
    'Pizza',
    'pizza',
    'Pizza varieties with different toppings.',
    true,
    8,
    now(),
    now()
  ),
  (
    gen_random_uuid(),
    'Pasta',
    'pasta',
    'Pasta dishes prepared with assorted sauces.',
    true,
    9,
    now(),
    now()
  ),
  (
    gen_random_uuid(),
    'Sandwiches',
    'sandwiches',
    'Freshly prepared sandwiches and wraps.',
    true,
    10,
    now(),
    now()
  ),
  (
    gen_random_uuid(),
    'Desserts',
    'desserts',
    'Cakes, pastries, and other sweet treats.',
    true,
    11,
    now(),
    now()
  ),
  (
    gen_random_uuid(),
    'Combos',
    'combos',
    'Bundled food and beverage offers.',
    true,
    12,
    now(),
    now()
  )
ON CONFLICT (slug) DO UPDATE SET
  -- Do not overwrite user-customized names or descriptions if already populated
  description = COALESCE(public.categories.description, EXCLUDED.description),
  name = COALESCE(public.categories.name, EXCLUDED.name),
  updated_at = now();
