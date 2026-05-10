-- Sitter extended profile (one row per auth user). Sensitive fields never leave via RPC below.
-- Run in Supabase SQL Editor after `profiles` exists.

create table if not exists public.sitter_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  show_full_name boolean not null default false,
  id_number text,
  birth_date date,
  show_age boolean not null default true,
  citizenship_israeli boolean,
  birth_country text,
  aliyah_year smallint,
  address_full text,
  military_service text,
  years_experience smallint,
  preferred_ages text,
  has_car boolean not null default false,
  languages text,
  homework_help boolean not null default false,
  light_cooking boolean not null default false,
  onboarding_completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists sitter_profiles_updated_idx on public.sitter_profiles (updated_at desc);

comment on table public.sitter_profiles is 'Extended sitter data.';
comment on column public.sitter_profiles.id_number is 'Admin / compliance — not exposed to parents.';
comment on column public.sitter_profiles.address_full is 'Internal — not exposed to parents.';
comment on column public.sitter_profiles.military_service is 'Internal — not exposed to parents.';

alter table public.sitter_profiles enable row level security;

drop policy if exists "sitter_profiles_select_own" on public.sitter_profiles;
create policy "sitter_profiles_select_own"
  on public.sitter_profiles for select
  using (auth.uid() = id);

drop policy if exists "sitter_profiles_insert_own" on public.sitter_profiles;
create policy "sitter_profiles_insert_own"
  on public.sitter_profiles for insert
  with check (auth.uid() = id);

drop policy if exists "sitter_profiles_update_own" on public.sitter_profiles;
create policy "sitter_profiles_update_own"
  on public.sitter_profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "sitter_profiles_delete_own" on public.sitter_profiles;
create policy "sitter_profiles_delete_own"
  on public.sitter_profiles for delete
  using (auth.uid() = id);

-- Parents (and sitters browsing) read **sanitized** data without exposing hidden columns.
create or replace function public.get_sitter_profile_public(target_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  sp record;
  dn text;
  ay integer;
begin
  select * into sp from public.sitter_profiles where id = target_id;
  if not found then return null::jsonb; end if;

  if coalesce(sp.show_full_name, false) then
    dn := nullif(trim(sp.full_name), '');
  else
    dn := nullif(split_part(trim(coalesce(sp.full_name, '')), ' ', 1), '');
  end if;

  if coalesce(sp.show_age, false) and sp.birth_date is not null then
    ay := extract(year from age(sp.birth_date))::integer;
  else
    ay := null;
  end if;

  return jsonb_build_object(
    'id', sp.id,
    'display_name', dn,
    'age_years', ay,
    'citizenship_israeli', sp.citizenship_israeli,
    'birth_country', sp.birth_country,
    'aliyah_year', sp.aliyah_year,
    'years_experience', sp.years_experience,
    'preferred_ages', sp.preferred_ages,
    'has_car', sp.has_car,
    'languages', sp.languages,
    'homework_help', sp.homework_help,
    'light_cooking', sp.light_cooking,
    'updated_at', sp.updated_at
  );
end;
$$;

grant execute on function public.get_sitter_profile_public(uuid) to authenticated;
