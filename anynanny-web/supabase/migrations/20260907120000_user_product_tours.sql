-- Parent product tour progress. Not onboarding. Not a backfill.
-- Existing users get no row, so they are not auto-offered; Settings can still restart.
-- Do not apply to Production automatically.

create table if not exists public.user_product_tours (
  user_id uuid not null references auth.users (id) on delete cascade,
  tour_key text not null,
  offered_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  declined_at timestamptz,
  skipped_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_product_tours_pkey primary key (user_id, tour_key),
  constraint user_product_tours_key_check check (tour_key = 'parent')
);

comment on table public.user_product_tours is
  'Interactive product-tour progress. Owner-only. No private profile/KYC payload.';

comment on column public.user_product_tours.tour_key is
  'MVP supports parent only. Sitter tours are not implemented yet.';

comment on column public.user_product_tours.offered_at is
  'When the parent invitation was shown. NULL means it has never been auto-offered.';

comment on column public.user_product_tours.started_at is
  'When the parent accepted and started the interactive tour.';

comment on column public.user_product_tours.completed_at is
  'When the parent finished the tour. Manual Settings restart does not clear this until a later completion.';

comment on column public.user_product_tours.declined_at is
  'When the parent chose Not now on the invitation.';

comment on column public.user_product_tours.skipped_at is
  'When the parent skipped an in-progress tour.';

create index if not exists user_product_tours_user_idx
  on public.user_product_tours (user_id);

alter table public.user_product_tours enable row level security;

revoke all on table public.user_product_tours from public;
revoke all on table public.user_product_tours from anon;
revoke all on table public.user_product_tours from authenticated;
grant select, insert, update on table public.user_product_tours to authenticated;

drop policy if exists user_product_tours_select_own on public.user_product_tours;
create policy user_product_tours_select_own
  on public.user_product_tours
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists user_product_tours_insert_own on public.user_product_tours;
create policy user_product_tours_insert_own
  on public.user_product_tours
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and tour_key = 'parent'
  );

drop policy if exists user_product_tours_update_own on public.user_product_tours;
create policy user_product_tours_update_own
  on public.user_product_tours
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and tour_key = 'parent'
  );

notify pgrst, 'reload schema';
