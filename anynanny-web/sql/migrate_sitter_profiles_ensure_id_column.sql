-- Fix: "column sitter_profiles.id does not exist" — align table with app (PK = auth user uuid).
-- Run once in Supabase SQL Editor, then NOTIFY reload (or call reload_schema()).

-- A) Legacy table used `user_id` instead of `id`
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sitter_profiles' AND column_name = 'user_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sitter_profiles' AND column_name = 'id'
  ) THEN
    ALTER TABLE public.sitter_profiles RENAME COLUMN user_id TO id;
  END IF;
END $$;

-- B) `id` still missing: add FK column (fill from auth if you have another key — here we only add column)
ALTER TABLE public.sitter_profiles
  ADD COLUMN IF NOT EXISTS id uuid REFERENCES auth.users (id) ON DELETE CASCADE;

-- C) Primary key on `id` when none exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class r ON r.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = r.relnamespace
    WHERE n.nspname = 'public'
      AND r.relname = 'sitter_profiles'
      AND c.contype = 'p'
  ) THEN
    ALTER TABLE ONLY public.sitter_profiles
      ADD CONSTRAINT sitter_profiles_pkey PRIMARY KEY (id);
  END IF;
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'PK on sitter_profiles(id) skipped: %', SQLERRM;
END $$;

-- D) RLS (common pattern) — only if policy still references literal `id`
DROP POLICY IF EXISTS "manage_own" ON public.sitter_profiles;
CREATE POLICY "manage_own" ON public.sitter_profiles
  FOR ALL
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

NOTIFY pgrst, 'reload schema';
