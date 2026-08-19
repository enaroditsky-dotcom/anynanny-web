-- F2/F3: persist verified Hyp Pay transaction identity on bookings.
-- Backward compatible. Does not rewrite existing paid rows.
-- Unique hyp_trans_id prevents one provider charge from paying two bookings.
--
-- Apply this migration BEFORE deploying the F2/F3 application code.
-- Do not drop columns. Cleanup of unused Cardcom booking-paid paths is separate.

alter table public.bookings
  add column if not exists hyp_trans_id text;

alter table public.bookings
  add column if not exists charged_amount_nis numeric(12, 2);

comment on column public.bookings.hyp_trans_id is
  'Hyp Pay transaction Id (TransId) after server-side VERIFY or action=soft CCode=0. Unique when set.';

comment on column public.bookings.charged_amount_nis is
  'Verified Hyp amount in NIS that was accepted for this booking.';

create unique index if not exists bookings_hyp_trans_id_uidx
  on public.bookings (hyp_trans_id)
  where hyp_trans_id is not null;

-- Atomic paid-state + single-session update + one wallet credit.
-- Trigger credit_sitter_wallet_on_session_paid may also fire; credit RPCs are idempotent.
create or replace function public.finalize_verified_hyp_payment(
  p_booking_id uuid,
  p_parent_id uuid,
  p_session_id uuid,
  p_hyp_trans_id text,
  p_charged_amount_nis numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings;
  v_session public.sessions;
  v_other_id uuid;
  v_now timestamptz := now();
  v_noop boolean := false;
  v_trans text;
  v_amount numeric(12, 2);
begin
  v_trans := nullif(trim(p_hyp_trans_id), '');
  v_amount := round(coalesce(p_charged_amount_nis, 0)::numeric, 2);

  if p_booking_id is null or p_parent_id is null then
    raise exception 'missing booking or parent' using errcode = 'invalid_parameter_value';
  end if;

  if auth.uid() is not null and auth.uid() is distinct from p_parent_id then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if v_trans is null then
    raise exception 'hyp transaction id is required' using errcode = 'invalid_parameter_value';
  end if;

  if v_amount < 0.50 then
    raise exception 'invalid charged amount' using errcode = 'invalid_parameter_value';
  end if;

  select b.id into v_other_id
    from public.bookings b
   where b.hyp_trans_id = v_trans
     and b.id is distinct from p_booking_id
   limit 1
   for update;

  if v_other_id is not null then
    raise exception 'hyp transaction already used for another booking'
      using errcode = '23505';
  end if;

  select * into v_booking
    from public.bookings
   where id = p_booking_id
   for update;

  if not found then
    raise exception 'booking not found' using errcode = 'no_data_found';
  end if;

  if v_booking.parent_id is distinct from p_parent_id then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if coalesce(v_booking.payment_status, 'unpaid') = 'paid' or v_booking.paid_at is not null then
    if v_booking.hyp_trans_id is not distinct from v_trans then
      v_noop := true;
    else
      raise exception 'booking already paid with a different transaction'
        using errcode = '23505';
    end if;
  else
    update public.bookings
       set payment_status = 'paid',
           paid_at = coalesce(paid_at, v_now),
           hyp_trans_id = v_trans,
           charged_amount_nis = v_amount
     where id = p_booking_id
       and parent_id = p_parent_id;
  end if;

  if p_session_id is not null then
    select * into v_session
      from public.sessions
     where id = p_session_id
     for update;

    if not found then
      raise exception 'session not found' using errcode = 'no_data_found';
    end if;

    if v_session.parent_id is distinct from p_parent_id then
      raise exception 'not authorized' using errcode = '42501';
    end if;

    if v_session.booking_id is not null
       and v_session.booking_id is distinct from p_booking_id then
      raise exception 'session does not belong to booking'
        using errcode = 'invalid_parameter_value';
    end if;
  else
    select * into v_session
      from public.sessions
     where parent_id = p_parent_id
       and (booking_id = p_booking_id or id = p_booking_id)
     order by created_at desc
     limit 1
     for update;
  end if;

  if v_session.id is not null then
    update public.sessions
       set status = 'paid'
     where id = v_session.id
       and parent_id = p_parent_id
       and status in ('payment_pending', 'paid', 'sitter_completed', 'completed');
  end if;

  -- Only credit when this call performed the paid transition.
  if not v_noop then
    if v_session.id is not null then
      perform public.credit_sitter_wallet_for_session(v_session.id);
    end if;
    perform public.credit_sitter_wallet_for_booking(p_booking_id);
  end if;

  return jsonb_build_object(
    'ok', true,
    'noop', v_noop,
    'booking_id', p_booking_id,
    'session_ids', case
      when v_session.id is not null then jsonb_build_array(v_session.id)
      else '[]'::jsonb
    end
  );
end;
$$;

revoke all on function public.finalize_verified_hyp_payment(uuid, uuid, uuid, text, numeric) from public;
revoke all on function public.finalize_verified_hyp_payment(uuid, uuid, uuid, text, numeric) from anon;
grant execute on function public.finalize_verified_hyp_payment(uuid, uuid, uuid, text, numeric) to authenticated;
grant execute on function public.finalize_verified_hyp_payment(uuid, uuid, uuid, text, numeric) to service_role;

comment on function public.finalize_verified_hyp_payment(uuid, uuid, uuid, text, numeric) is
  'Marks one booking paid from a server-verified Hyp TransId. Idempotent for the same hyp_trans_id. Does not fan out to other sessions.';

notify pgrst, 'reload schema';
