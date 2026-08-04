-- Run once in Supabase SQL Editor after manually altering `public.sessions` (or any table)
-- so PostgREST picks up new columns without waiting for a deploy/restart.
-- Equivalent: Dashboard → Settings → API → "Reload schema" (wording may vary).

NOTIFY pgrst, 'reload schema';
