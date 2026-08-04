-- Sitter baseline availability (separate from confirmed bookings).

alter table public.sitter_profiles
  add column if not exists calendar_mode text not null default 'only_selected';

alter table public.sitter_profiles
  drop constraint if exists sitter_profiles_calendar_mode_check;

alter table public.sitter_profiles
  add constraint sitter_profiles_calendar_mode_check
  check (calendar_mode in ('all_except_blocked', 'only_selected'));

create table if not exists public.sitter_availability (
  sitter_id uuid not null references auth.users (id) on delete cascade,
  availability_date date not null,
  slot_indices integer[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (sitter_id, availability_date)
);

create index if not exists sitter_availability_sitter_month_idx
  on public.sitter_availability (sitter_id, availability_date);

alter table public.sitter_availability enable row level security;

drop policy if exists sitter_availability_select_own on public.sitter_availability;
create policy sitter_availability_select_own on public.sitter_availability
  for select to authenticated
  using (sitter_id = auth.uid());

drop policy if exists sitter_availability_insert_own on public.sitter_availability;
create policy sitter_availability_insert_own on public.sitter_availability
  for insert to authenticated
  with check (sitter_id = auth.uid());

drop policy if exists sitter_availability_update_own on public.sitter_availability;
create policy sitter_availability_update_own on public.sitter_availability
  for update to authenticated
  using (sitter_id = auth.uid())
  with check (sitter_id = auth.uid());

drop policy if exists sitter_availability_delete_own on public.sitter_availability;
create policy sitter_availability_delete_own on public.sitter_availability
  for delete to authenticated
  using (sitter_id = auth.uid());

drop policy if exists sitter_profiles_update_calendar_mode_own on public.sitter_profiles;
create policy sitter_profiles_update_calendar_mode_own on public.sitter_profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());
