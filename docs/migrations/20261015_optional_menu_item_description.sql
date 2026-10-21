-- Migration: Make food descriptions optional on public.menu_items
-- Applied to: Staging database
-- Preserves existing data and column types

ALTER TABLE IF EXISTS public.menu_items 
  ALTER COLUMN description DROP NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'menu_items' 
      AND column_name = 'desc'
  ) THEN
    ALTER TABLE public.menu_items ALTER COLUMN "desc" DROP NOT NULL;
  END IF;
END $$;
