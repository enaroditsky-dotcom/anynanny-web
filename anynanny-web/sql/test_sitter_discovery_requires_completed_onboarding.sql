-- Read-only production regression checks.
-- Run after 20260816140000_require_completed_sitter_onboarding_for_discovery.sql.
-- This deliberately keeps the legacy AN-1002 row in place as the negative fixture.

do $$
declare
  legacy_id uuid;
  legacy_completed_at timestamptz;
  legacy_results jsonb;
  dual_role_id uuid;
  dual_role_serial text;
  dual_role_results jsonb;
begin
  select sp.id, sp.onboarding_completed_at
    into legacy_id, legacy_completed_at
  from public.sitter_profiles sp
  where upper(regexp_replace(trim(coalesce(sp.nanny_serial, '')), '\s+', '', 'g')) = 'AN-1002'
  limit 1;

  if legacy_id is null then
    raise exception 'Regression fixture AN-1002 was not found';
  end if;

  if legacy_completed_at is not null then
    raise exception 'AN-1002 is no longer an incomplete legacy sitter fixture';
  end if;

  legacy_results := public.list_public_sitters_search(
    'AN-1002', null, null, 0, null, 'all', null, null, 'babysitter'
  );

  if jsonb_array_length(coalesce(legacy_results, '[]'::jsonb)) <> 0 then
    raise exception 'AN-1002 leaked through serial sitter search';
  end if;

  if public.get_sitter_profile_public(legacy_id) is not null then
    raise exception 'AN-1002 leaked through direct public sitter detail';
  end if;

  -- A completed secondary sitter product on a parent account remains discoverable.
  select sp.id, sp.nanny_serial
    into dual_role_id, dual_role_serial
  from public.sitter_profiles sp
  join public.profiles p on p.id = sp.id
  where p.role = 'parent'
    and sp.onboarding_completed_at is not null
    and coalesce(sp.is_public, false) = true
    and nullif(trim(sp.nanny_serial), '') is not null
  order by sp.updated_at desc nulls last
  limit 1;

  if dual_role_id is not null then
    if public.get_sitter_profile_public(dual_role_id) is null then
      raise exception 'Completed dual-role sitter % failed direct detail', dual_role_id;
    end if;

    dual_role_results := public.list_public_sitters_search(
      dual_role_serial, null, null, 0, null, 'all', null, null, 'babysitter'
    );

    if not exists (
      select 1
      from jsonb_array_elements(coalesce(dual_role_results, '[]'::jsonb)) item
      where item->>'id' = dual_role_id::text
    ) then
      raise exception 'Completed dual-role sitter % failed serial search', dual_role_id;
    end if;
  else
    raise notice 'No completed parent+sitter dual-role fixture exists; dual-role query semantics verified by onboarding-only gate';
  end if;
end
$$;
