-- Private aggregate likes for the public marketing homepage heart button.
-- Hashed first-party browser tokens only. No names, emails, IPs, or auth IDs.
-- Do not apply remotely until reviewed. Do not write production test likes.

create table if not exists public.marketing_homepage_likes (
  token_hash text primary key,
  created_at timestamptz not null default now()
);

create index if not exists marketing_homepage_likes_created_at_idx
  on public.marketing_homepage_likes (created_at desc);

comment on table public.marketing_homepage_likes is
  'Anonymous marketing homepage likes. token_hash is SHA-256 of a first-party browser token. Not linked to auth users.';

comment on column public.marketing_homepage_likes.token_hash is
  'SHA-256 hex digest of the browser like token, optionally peppered server-side.';

alter table public.marketing_homepage_likes enable row level security;

revoke all on table public.marketing_homepage_likes from public;
revoke all on table public.marketing_homepage_likes from anon;
revoke all on table public.marketing_homepage_likes from authenticated;

-- No policies for anon/authenticated: inserts happen only via the service-role API route.

notify pgrst, 'reload schema';

-- Founder aggregate reads (Supabase SQL editor, authorized dashboard):
--   select count(*) as likes from public.marketing_homepage_likes;
--   select date_trunc('day', created_at at time zone 'Asia/Jerusalem') as day,
--          count(*) as likes
--   from public.marketing_homepage_likes
--   group by 1
--   order by 1 desc;
