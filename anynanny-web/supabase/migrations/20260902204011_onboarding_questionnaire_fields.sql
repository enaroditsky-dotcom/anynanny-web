-- Parent + Sitter onboarding questionnaire fields.
-- Reuses existing name/DOB/city/children/working_cities columns.
-- New business/privacy fields stay on owner-row tables; public RPCs are unchanged.
-- Do NOT apply to Production automatically.

-- ---------------------------------------------------------------------------
-- Parent / profiles
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists preferred_language text,
  add column if not exists typical_babysitting_need text[] not null default '{}'::text[],
  add column if not exists has_pets boolean,
  add column if not exists pet_details text,
  add column if not exists has_child_special_or_medical_information boolean,
  add column if not exists child_special_or_medical_details text,
  add column if not exists marital_status text,
  add column if not exists estimated_babysitter_frequency text,
  add column if not exists typical_reasons text[] not null default '{}'::text[],
  add column if not exists typical_reasons_other text,
  add column if not exists reminder_preferences text[] not null default '{}'::text[],
  add column if not exists automatic_babysitter_suggestion boolean;

comment on column public.profiles.preferred_language is 'Parent preferred language from onboarding.';
comment on column public.profiles.typical_babysitting_need is 'Optional typical babysitting windows. Not a booking calendar.';
comment on column public.profiles.has_pets is 'Required onboarding yes/no. NULL means unanswered on legacy rows.';
comment on column public.profiles.pet_details is 'Optional pet details shown only when has_pets is true.';
comment on column public.profiles.has_child_special_or_medical_information is 'Private household flag. Not for public/search payloads.';
comment on column public.profiles.child_special_or_medical_details is 'Private/sensitive child details. Owner-only. Never expose publicly.';
comment on column public.profiles.marital_status is 'Optional parent personalization. Not public.';
comment on column public.profiles.estimated_babysitter_frequency is 'Optional estimated usage frequency.';
comment on column public.profiles.typical_reasons is 'Optional typical babysitting reasons.';
comment on column public.profiles.typical_reasons_other is 'Optional free text when typical_reasons includes other.';
comment on column public.profiles.reminder_preferences is 'Product personalization, not marketing consent. Not public.';
comment on column public.profiles.automatic_babysitter_suggestion is 'Optional yes/no. NULL remains unanswered.';

-- ---------------------------------------------------------------------------
-- Sitter / sitter_profiles
-- Preferred work area remains working_cities and is already consumed by
-- list_public_sitters_search.p_search_city.
-- ---------------------------------------------------------------------------
alter table public.sitter_profiles
  add column if not exists home_city text,
  add column if not exists years_experience_band text,
  add column if not exists experience_age_groups text[] not null default '{}'::text[],
  add column if not exists has_drivers_license boolean,
  add column if not exists is_smoker boolean,
  add column if not exists has_baby_experience boolean,
  add column if not exists has_multiple_children_experience boolean,
  add column if not exists current_status text,
  add column if not exists desired_hours_per_week integer,
  add column if not exists desired_monthly_income_range text,
  add column if not exists work_type_preferences text[] not null default '{}'::text[],
  add column if not exists travel_distance text,
  add column if not exists accepts_short_notice_shifts boolean,
  add column if not exists additional_service_interests text[] not null default '{}'::text[],
  add column if not exists preferred_child_age_groups text[] not null default '{}'::text[],
  add column if not exists max_children integer,
  add column if not exists has_special_needs_experience boolean,
  add column if not exists special_needs_experience_details text,
  add column if not exists task_capabilities text[] not null default '{}'::text[],
  add column if not exists has_first_aid_training boolean,
  add column if not exists has_childcare_training boolean,
  add column if not exists childcare_training_details text;

comment on column public.sitter_profiles.home_city is 'Sitter residential city. Separate from preferred work area.';
comment on column public.sitter_profiles.working_cities is 'Preferred work area. Used by parent sitter search.';
comment on column public.sitter_profiles.years_experience_band is 'Structured experience band from onboarding.';
comment on column public.sitter_profiles.experience_age_groups is 'Age groups the sitter has experience with.';
comment on column public.sitter_profiles.has_drivers_license is 'Optional yes/no. NULL means unanswered.';
comment on column public.sitter_profiles.is_smoker is 'Optional yes/no. NULL means unanswered.';
comment on column public.sitter_profiles.has_baby_experience is 'Optional/recommended yes/no.';
comment on column public.sitter_profiles.has_multiple_children_experience is 'Optional/recommended yes/no.';
comment on column public.sitter_profiles.current_status is 'Optional current life/work framework.';
comment on column public.sitter_profiles.desired_hours_per_week is 'Optional desired weekly hours, 1-50.';
comment on column public.sitter_profiles.desired_monthly_income_range is 'Optional desired income range. Not a guarantee.';
comment on column public.sitter_profiles.work_type_preferences is 'Optional work-type multi-select.';
comment on column public.sitter_profiles.travel_distance is 'Optional travel-distance band.';
comment on column public.sitter_profiles.accepts_short_notice_shifts is 'Optional yes/no.';
comment on column public.sitter_profiles.additional_service_interests is 'Optional future service interests.';
comment on column public.sitter_profiles.preferred_child_age_groups is 'Optional preferred age groups for matching.';
comment on column public.sitter_profiles.max_children is 'Optional max children at once. 5 means 5+.';
comment on column public.sitter_profiles.has_special_needs_experience is 'Optional yes/no.';
comment on column public.sitter_profiles.special_needs_experience_details is 'Optional short explanation. Not child-specific medical data.';
comment on column public.sitter_profiles.task_capabilities is 'Optional babysitting task capabilities.';
comment on column public.sitter_profiles.has_first_aid_training is 'Optional yes/no.';
comment on column public.sitter_profiles.has_childcare_training is 'Optional yes/no.';
comment on column public.sitter_profiles.childcare_training_details is 'Optional short structured training details.';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'sitter_profiles_desired_hours_per_week_chk'
  ) then
    alter table public.sitter_profiles
      add constraint sitter_profiles_desired_hours_per_week_chk
      check (
        desired_hours_per_week is null
        or (desired_hours_per_week >= 1 and desired_hours_per_week <= 50)
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'sitter_profiles_max_children_chk'
  ) then
    alter table public.sitter_profiles
      add constraint sitter_profiles_max_children_chk
      check (max_children is null or (max_children >= 1 and max_children <= 5));
  end if;
end
$$;

create index if not exists sitter_profiles_home_city_idx
  on public.sitter_profiles (home_city);

create index if not exists sitter_profiles_working_cities_gin_idx
  on public.sitter_profiles using gin (working_cities);

-- No new public SELECT policies. Existing owner-row RLS remains in force.
-- Public discovery continues to use list_public_sitters_search / get_sitter_profile_public
-- and must not gain private parent medical or personalization columns.
