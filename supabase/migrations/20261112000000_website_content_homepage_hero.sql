-- ============================================================================
-- Rekik Café — Website Content Management: Homepage Hero Customization
-- Migration: 20261112000000_website_content_homepage_hero.sql
-- ============================================================================
-- Extends public.about_content to support customizable homepage hero title
-- and subtitle so the administrator has full CMS control without touching code.
-- ============================================================================

ALTER TABLE public.about_content
  ADD COLUMN IF NOT EXISTS homepage_hero_title text DEFAULT 'Rooted in Tradition. Crafted for the Modern Palate.',
  ADD COLUMN IF NOT EXISTS homepage_hero_subtitle text DEFAULT 'Discover the pure elegance of Ethiopian highland coffees, small-batch roasted to perfection. Experience seamless ordering, whether dining in, picking up, or delivered to your door.';

COMMENT ON COLUMN public.about_content.homepage_hero_title IS 'Main headline text displayed on the public homepage hero section.';
COMMENT ON COLUMN public.about_content.homepage_hero_subtitle IS 'Descriptive subtitle or narrative displayed below the homepage hero headline.';

-- Ensure RLS is active and permits admin updates
ALTER TABLE public.about_content ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view about content" ON public.about_content;
CREATE POLICY "Public can view about content"
  ON public.about_content FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins can update about content" ON public.about_content;
CREATE POLICY "Admins can update about content"
  ON public.about_content FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

