-- Expert / consultant / doula profile fields for sitter_profiles.
-- service_types already exists (text[]); this adds location mode, pricing model, and certifications.

alter table public.sitter_profiles
  add column if not exists service_locations text[] not null default '{}'::text[];

alter table public.sitter_profiles
  add column if not exists pricing_model text not null default 'hourly';

alter table public.sitter_profiles
  add column if not exists package_price_nis numeric(10, 2);

alter table public.sitter_profiles
  add column if not exists certifications text;

comment on column public.sitter_profiles.service_locations is
  'How the expert delivers service: home_visit | clinic | online';

comment on column public.sitter_profiles.pricing_model is
  'hourly | package — package uses package_price_nis; hourly uses hourly_rate_nis';

comment on column public.sitter_profiles.package_price_nis is
  'Global / course / package price in NIS when pricing_model = package';

comment on column public.sitter_profiles.certifications is
  'Optional free-text credentials and professional experience';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'sitter_profiles_pricing_model_check'
  ) then
    alter table public.sitter_profiles
      add constraint sitter_profiles_pricing_model_check
      check (pricing_model in ('hourly', 'package'));
  end if;
end $$;

-- Keep service_types present for environments that skipped the earlier migration.
alter table public.sitter_profiles
  add column if not exists service_types text[] not null default array['babysitter']::text[];
