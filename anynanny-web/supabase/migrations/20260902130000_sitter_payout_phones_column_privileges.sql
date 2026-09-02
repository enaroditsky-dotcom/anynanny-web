-- PRIVATE Bit/PayBox destination columns: block direct PostgREST SELECT.
-- Smallest privilege fix. Does not change booking policies, public profile RPCs,
-- HYP, payment lifecycle, or unrelated sitter_profiles columns.
--
-- Column grants are not row-aware, so authenticated SELECT is revoked for
-- everyone (including own-row). Sitters read their own numbers via
-- sitter_own_manual_payout_destinations(). Own-row UPDATE stays on the table
-- (existing payout-methods API + "Users can manage their own profile" RLS).
-- parent_manual_payment_destinations() is SECURITY DEFINER (owner) and still
-- reads the columns after its existing authorization gates.

revoke select (payout_bit_phone, payout_paybox_phone)
  on public.sitter_profiles
  from public;

revoke select (payout_bit_phone, payout_paybox_phone)
  on public.sitter_profiles
  from anon;

revoke select (payout_bit_phone, payout_paybox_phone)
  on public.sitter_profiles
  from authenticated;

grant update (payout_bit_phone, payout_paybox_phone)
  on public.sitter_profiles
  to authenticated;

create or replace function public.sitter_own_manual_payout_destinations()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bit text;
  v_paybox text;
begin
  if auth.uid() is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select sp.payout_bit_phone, sp.payout_paybox_phone
    into v_bit, v_paybox
    from public.sitter_profiles sp
   where sp.id = auth.uid();

  return jsonb_build_object(
    'ok', true,
    'bit_phone', v_bit,
    'paybox_phone', v_paybox
  );
end;
$$;

comment on function public.sitter_own_manual_payout_destinations() is
  'Returns the authenticated sitter''s own Bit/PayBox receiving numbers. Never another user''s.';

revoke all on function public.sitter_own_manual_payout_destinations() from public;
revoke all on function public.sitter_own_manual_payout_destinations() from anon;
grant execute on function public.sitter_own_manual_payout_destinations() to authenticated;
grant execute on function public.sitter_own_manual_payout_destinations() to service_role;

notify pgrst, 'reload schema';
