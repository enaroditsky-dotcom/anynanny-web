-- Permanently record the Production hotfix that removed the obsolete
-- 12-argument proximity overload of public.list_public_sitters_search.
--
-- Production already dropped that overload manually. This file makes the
-- drop idempotent for later environments.
--
-- KEEPS the canonical 9-argument city-based function
-- (F7 projection + profiles.avatar_url from 20260823001000).
--
-- Does NOT recreate list_public_sitters_search.
-- Does NOT change sitter_profiles RLS.
-- Does NOT touch booking lifecycle cron or the expired-pending approval trigger.

drop function if exists public.list_public_sitters_search(
  text, timestamptz, timestamptz, int, numeric, text, numeric, text, text,
  double precision, double precision, double precision
);

revoke all on function public.list_public_sitters_search(
  text, timestamptz, timestamptz, int, numeric, text, numeric, text, text
) from public;
revoke all on function public.list_public_sitters_search(
  text, timestamptz, timestamptz, int, numeric, text, numeric, text, text
) from anon;
grant execute on function public.list_public_sitters_search(
  text, timestamptz, timestamptz, int, numeric, text, numeric, text, text
) to authenticated;

notify pgrst, 'reload schema';
