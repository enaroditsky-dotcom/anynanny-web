-- Parent-authorized Bit / PayBox destination lookup for manual settlement.
-- Additive. Does not change report_manual_payment or payment_status transitions.
-- Destinations stay on sitter_profiles.payout_bit_phone / payout_paybox_phone (private).

create or replace function public.parent_manual_payment_destinations(p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings;
  v_status text;
  v_bit text;
  v_paybox text;
begin
  if auth.uid() is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select * into v_booking
    from public.bookings
   where id = p_booking_id;

  if not found then
    raise exception 'booking not found' using errcode = 'P0002';
  end if;

  if v_booking.parent_id is distinct from auth.uid() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if lower(btrim(coalesce(v_booking.status, ''))) is distinct from 'completed' then
    raise exception 'shift is not completed' using errcode = 'P0001';
  end if;

  v_status := lower(btrim(coalesce(v_booking.payment_status, 'unpaid')));
  if v_status is distinct from 'unpaid' and v_status is distinct from 'pending_checkout' then
    raise exception 'not eligible for payment' using errcode = 'P0001';
  end if;

  if not public.manual_payment_booking_has_parent_rating(v_booking) then
    raise exception 'parent rating required' using errcode = 'P0001';
  end if;

  select
    regexp_replace(coalesce(sp.payout_bit_phone, ''), '[^0-9]', '', 'g'),
    regexp_replace(coalesce(sp.payout_paybox_phone, ''), '[^0-9]', '', 'g')
    into v_bit, v_paybox
    from public.sitter_profiles sp
   where sp.id = v_booking.sitter_id;

  if v_bit like '972%' and length(v_bit) = 12 then
    v_bit := '0' || substring(v_bit from 4);
  end if;
  if v_paybox like '972%' and length(v_paybox) = 12 then
    v_paybox := '0' || substring(v_paybox from 4);
  end if;

  if v_bit is distinct from '' and v_bit !~ '^05[0-9]{8}$' then
    v_bit := null;
  end if;
  if v_paybox is distinct from '' and v_paybox !~ '^05[0-9]{8}$' then
    v_paybox := null;
  end if;

  return jsonb_build_object(
    'ok', true,
    'booking_id', v_booking.id,
    'bit_phone', nullif(v_bit, ''),
    'paybox_phone', nullif(v_paybox, '')
  );
end;
$$;

comment on function public.parent_manual_payment_destinations(uuid) is
  'Returns Bit/PayBox receiving numbers to the booking parent after completed shift + parent rating. Never public.';

revoke all on function public.parent_manual_payment_destinations(uuid) from public;
revoke all on function public.parent_manual_payment_destinations(uuid) from anon;
grant execute on function public.parent_manual_payment_destinations(uuid) to authenticated;
grant execute on function public.parent_manual_payment_destinations(uuid) to service_role;
