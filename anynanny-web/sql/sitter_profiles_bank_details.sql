-- Private bank payout details for sitters (never exposed via public profile RPCs).
-- Safe to re-run: additive columns + idempotent policies.

do $$
begin
  if to_regclass('public.sitter_profiles') is null then
    raise exception 'public.sitter_profiles is missing — create sitter profiles before bank details';
  end if;
end $$;

alter table public.sitter_profiles
  add column if not exists bank_code text;

alter table public.sitter_profiles
  add column if not exists bank_name text;

alter table public.sitter_profiles
  add column if not exists bank_branch text;

alter table public.sitter_profiles
  add column if not exists bank_account_number text;

comment on column public.sitter_profiles.bank_code is
  'Masav bank clearing code (e.g. 12 for Hapoalim) — private; not exposed to parents.';
comment on column public.sitter_profiles.bank_name is
  'Bank name for sitter payouts — private; not exposed to parents.';
comment on column public.sitter_profiles.bank_branch is
  'Bank branch number/name for sitter payouts — private.';
comment on column public.sitter_profiles.bank_account_number is
  'Bank account number for sitter payouts — private.';

-- Backfill bank_code from known bank names when code is still empty.
update public.sitter_profiles
set bank_code = case bank_name
  when 'בנק הפועלים' then '12'
  when 'בנק לאומי' then '10'
  when 'Pepper' then '10'
  when 'בנק דיסקונט' then '11'
  when 'בנק מזרחי טפחות' then '20'
  when 'בנק הבינלאומי' then '31'
  when 'בנק מרכנתיל' then '17'
  when 'בנק ירושלים' then '54'
  when 'בנק יהב' then '04'
  when 'בנק הדואר' then '09'
  when 'One Zero' then '18'
  else bank_code
end
where coalesce(nullif(trim(bank_code), ''), '') = ''
  and bank_name is not null
  and trim(bank_name) <> '';

alter table public.sitter_profiles enable row level security;

drop policy if exists "sitter_profiles_select_own" on public.sitter_profiles;
create policy "sitter_profiles_select_own"
  on public.sitter_profiles for select
  to authenticated
  using (auth.uid() = id);

drop policy if exists "sitter_profiles_insert_own" on public.sitter_profiles;
drop policy if exists sitter_profiles_insert_own on public.sitter_profiles;
create policy "sitter_profiles_insert_own"
  on public.sitter_profiles for insert
  to authenticated
  with check (auth.uid() = id);

drop policy if exists "sitter_profiles_update_own" on public.sitter_profiles;
drop policy if exists sitter_profiles_update_own on public.sitter_profiles;
create policy "sitter_profiles_update_own"
  on public.sitter_profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

notify pgrst, 'reload schema';
