-- Add public listing flag, bio/rate, referees, legal declaration.
-- Run after create_sitter_profiles.sql

alter table public.sitter_profiles add column if not exists bio text;
alter table public.sitter_profiles add column if not exists hourly_rate_nis numeric(10, 2);
alter table public.sitter_profiles add column if not exists referee_phone_1 text;
alter table public.sitter_profiles add column if not exists referee_phone_2 text;
alter table public.sitter_profiles add column if not exists legal_no_criminal_declaration boolean not null default false;
alter table public.sitter_profiles add column if not exists is_public boolean not null default false;

comment on column public.sitter_profiles.is_public is 'True when all required onboarding fields + legal acceptance are complete.';
comment on column public.sitter_profiles.referee_phone_1 is 'Admin only — not exposed to parents.';
comment on column public.sitter_profiles.referee_phone_2 is 'Admin only — not exposed to parents.';

-- Refresh parent-safe RPC (adds bio + hourly rate for marketplace).
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
    'languages', sp.languages,
    'years_experience', sp.years_experience,
    'bio', sp.bio,
    'hourly_rate_nis', sp.hourly_rate_nis,
    'citizenship_israeli', sp.citizenship_israeli,
    'birth_country', sp.birth_country,
    'aliyah_year', sp.aliyah_year,
    'preferred_ages', sp.preferred_ages,
    'has_car', sp.has_car,
    'homework_help', sp.homework_help,
    'light_cooking', sp.light_cooking,
    'updated_at', sp.updated_at,
    'is_public', sp.is_public
  );
end;
$$;
