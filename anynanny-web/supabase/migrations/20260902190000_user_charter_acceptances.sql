-- Auditable Community Charter acceptances for new signup/onboarding.
-- Existing users are not backfilled. Missing rows are not treated as acceptance.
-- Do not apply until reviewed.

create table if not exists public.user_charter_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  charter_type text not null,
  charter_version text not null,
  accepted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint user_charter_acceptances_type_check
    check (charter_type in ('parent', 'sitter')),
  constraint user_charter_acceptances_version_check
    check (charter_version in ('parent-v1', 'sitter-v1') or charter_version ~ '^(parent|sitter)-v[0-9]+$')
);

create unique index if not exists user_charter_acceptances_user_type_version_uidx
  on public.user_charter_acceptances (user_id, charter_type, charter_version);

create index if not exists user_charter_acceptances_user_accepted_idx
  on public.user_charter_acceptances (user_id, accepted_at desc);

comment on table public.user_charter_acceptances is
  'Auditable Community Charter acceptances. Clients may only insert/select their own rows.';

comment on column public.user_charter_acceptances.charter_type is
  'parent or sitter. Matches the signup role for that acceptance.';

comment on column public.user_charter_acceptances.charter_version is
  'Document version, e.g. parent-v1 / sitter-v1. Future re-acceptance can insert a new version.';

alter table public.user_charter_acceptances enable row level security;

revoke all on table public.user_charter_acceptances from public;
revoke all on table public.user_charter_acceptances from anon;
revoke all on table public.user_charter_acceptances from authenticated;
grant select, insert on table public.user_charter_acceptances to authenticated;

drop policy if exists user_charter_acceptances_select_own on public.user_charter_acceptances;
create policy user_charter_acceptances_select_own
  on public.user_charter_acceptances
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists user_charter_acceptances_insert_own on public.user_charter_acceptances;
create policy user_charter_acceptances_insert_own
  on public.user_charter_acceptances
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and charter_type in ('parent', 'sitter')
    and charter_version ~ '^(parent|sitter)-v[0-9]+$'
  );

notify pgrst, 'reload schema';
