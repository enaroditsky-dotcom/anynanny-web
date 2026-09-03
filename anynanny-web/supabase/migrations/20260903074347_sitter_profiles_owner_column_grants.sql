-- Restore owner-row column privileges for sitter Personal Area.
--
-- Cause: 20260902131000 / 20260902140000 revoked table-level SELECT and granted
-- column-level SELECT on the columns that existed then. 20260902204011 added
-- onboarding columns without repeating those GRANTs. Postgres does not inherit
-- column privileges onto new columns, so owner SELECT of the Personal Area
-- list fails with: permission denied for table sitter_profiles.
--
-- This migration does NOT:
--   - GRANT SELECT/UPDATE on the whole table
--   - add a public SELECT policy
--   - expose payout destination columns
--   - change public search RPCs
--
-- Row access stays owner-only via sitter_profiles_select_own / update_own
-- (auth.uid() = id). Public/parent discovery stays on sanitized RPCs.

do $$
declare
  cols text;
begin
  select string_agg(format('%I', c.column_name), ', ' order by c.ordinal_position)
    into cols
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'sitter_profiles'
    and c.column_name not in ('payout_bit_phone', 'payout_paybox_phone', 'payout_paybox_link');

  if cols is null or cols = '' then
    raise exception 'sitter_profiles has no grantable columns';
  end if;

  execute 'revoke select on public.sitter_profiles from public';
  execute 'revoke select on public.sitter_profiles from anon';
  execute 'revoke select on public.sitter_profiles from authenticated';

  -- Column-level SELECT only. Anon still has no SELECT policy, so 0 rows.
  -- Authenticated is limited to own row by sitter_profiles_select_own.
  execute format('grant select (%s) on public.sitter_profiles to anon', cols);
  execute format('grant select (%s) on public.sitter_profiles to authenticated', cols);
end
$$;

revoke select (payout_bit_phone, payout_paybox_phone, payout_paybox_link)
  on public.sitter_profiles
  from public, anon, authenticated;

-- Owner updates of questionnaire fields that exist on this database.
-- RLS sitter_profiles_update_own still required. Not a table-level UPDATE grant.
do $$
declare
  update_cols text;
begin
  select string_agg(format('%I', c.column_name), ', ' order by c.ordinal_position)
    into update_cols
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'sitter_profiles'
    and c.column_name in (
      'home_city',
      'years_experience_band',
      'experience_age_groups',
      'has_drivers_license',
      'is_smoker',
      'has_baby_experience',
      'has_multiple_children_experience',
      'current_status',
      'desired_hours_per_week',
      'desired_monthly_income_range',
      'work_type_preferences',
      'travel_distance',
      'accepts_short_notice_shifts',
      'additional_service_interests',
      'preferred_child_age_groups',
      'max_children',
      'has_special_needs_experience',
      'special_needs_experience_details',
      'task_capabilities',
      'has_first_aid_training',
      'has_childcare_training',
      'childcare_training_details'
    );

  if update_cols is not null then
    execute format(
      'grant update (%s) on public.sitter_profiles to authenticated',
      update_cols
    );
  end if;
end
$$;

notify pgrst, 'reload schema';
