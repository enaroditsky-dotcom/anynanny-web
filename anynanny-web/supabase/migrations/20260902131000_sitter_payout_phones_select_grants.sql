-- Postgres ignores column-level REVOKE while table-level SELECT remains.
-- Drop table-level SELECT for anon/authenticated, then grant SELECT on every
-- sitter_profiles column except payout_bit_phone / payout_paybox_phone.
-- Does not change RLS policies, booking policies, or public profile RPCs.

do $$
declare
  cols text;
begin
  select string_agg(format('%I', c.column_name), ', ' order by c.ordinal_position)
    into cols
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'sitter_profiles'
    and c.column_name not in ('payout_bit_phone', 'payout_paybox_phone');

  if cols is null or cols = '' then
    raise exception 'sitter_profiles has no grantable columns';
  end if;

  execute 'revoke select on public.sitter_profiles from public';
  execute 'revoke select on public.sitter_profiles from anon';
  execute 'revoke select on public.sitter_profiles from authenticated';

  execute format('grant select (%s) on public.sitter_profiles to anon', cols);
  execute format('grant select (%s) on public.sitter_profiles to authenticated', cols);
end
$$;

revoke select (payout_bit_phone, payout_paybox_phone)
  on public.sitter_profiles
  from public, anon, authenticated;

notify pgrst, 'reload schema';
