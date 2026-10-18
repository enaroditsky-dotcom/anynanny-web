-- Parent notification after manual payment is fully closed.
-- confirm_manual_payment_received stays a silent state change.
-- This fires once, when awaiting_sitter_rating becomes paid after the
-- babysitter's rating of the parent is already stored.
-- Insert only. Dedupe key {booking_id}:paid keeps any historical
-- confirm-time row and blocks a second completion insert.

create or replace function public.mark_manual_payment_paid_after_sitter_rating(p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings;
  v_status text;
  v_now timestamptz := now();
  v_updated integer := 0;
begin
  if auth.uid() is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select * into v_booking
    from public.bookings
   where id = p_booking_id
   for update;

  if not found then
    raise exception 'booking not found' using errcode = 'P0002';
  end if;

  if v_booking.sitter_id is distinct from auth.uid() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  v_status := lower(btrim(coalesce(v_booking.payment_status, 'unpaid')));

  if v_status = 'paid' then
    return jsonb_build_object(
      'ok', true,
      'noop', true,
      'booking_id', v_booking.id,
      'payment_status', v_status
    );
  end if;

  if v_status is distinct from 'awaiting_sitter_rating' then
    raise exception 'invalid payment transition' using errcode = 'P0001';
  end if;

  if not public.manual_payment_booking_has_sitter_rating(v_booking) then
    raise exception 'sitter rating required' using errcode = 'P0001';
  end if;

  update public.bookings
     set payment_status = 'paid',
         paid_at = coalesce(paid_at, v_now)
   where id = v_booking.id
     and sitter_id = auth.uid()
     and payment_status = 'awaiting_sitter_rating';

  get diagnostics v_updated = row_count;

  perform public.publish_parent_ratings_for_booking(v_booking.id);

  if v_updated = 1 and v_booking.parent_id is not null then
    perform public.create_canonical_notification(
      v_booking.parent_id,
      'manual_payment_confirmed',
      '✅ הבייביסיטר אישרה את קבלת התשלום',
      'התשלום עבור המשמרת אושר והמשמרת הושלמה בהצלחה. תודה שבחרתם ב־AnyNanny!',
      jsonb_build_object(
        'booking_id', v_booking.id,
        'parent_id', v_booking.parent_id,
        'status', 'paid',
        'gateway', 'manual'
      ),
      v_booking.id::text || ':paid'
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'noop', false,
    'booking_id', v_booking.id,
    'payment_status', 'paid'
  );
end;
$$;

revoke all on function public.mark_manual_payment_paid_after_sitter_rating(uuid) from public;
revoke all on function public.mark_manual_payment_paid_after_sitter_rating(uuid) from anon;
grant execute on function public.mark_manual_payment_paid_after_sitter_rating(uuid) to authenticated;
grant execute on function public.mark_manual_payment_paid_after_sitter_rating(uuid) to service_role;

comment on function public.mark_manual_payment_paid_after_sitter_rating(uuid) is
  'Sitter only. awaiting_sitter_rating → paid after a sitter→parent rating exists. Notifies the parent once.';

notify pgrst, 'reload schema';
