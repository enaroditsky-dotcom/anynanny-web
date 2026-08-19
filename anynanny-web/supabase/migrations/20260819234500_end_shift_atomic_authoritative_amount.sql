-- Authoritative end_shift_atomic (Security Phase 1A — F6).
--
-- Zero-downtime rollout:
--   1. Add the secure 1-arg function (real implementation).
--   2. REPLACE the existing 5-arg overload with a compatibility wrapper
--      that ignores client parent/time/elapsed/amount and delegates to 1-arg.
--   3. Do NOT drop the 5-arg signature in this migration.
--
-- New app code calls: end_shift_atomic(p_session_id).
-- Current production clients keep calling the 5-arg signature during rollout.
-- Both execute the same auth.uid()-validated logic.
-- Does not mark payment_status = paid.

-- ---------------------------------------------------------------------------
-- 1. Secure 1-arg function — the ONLY implementation of real logic.
-- ---------------------------------------------------------------------------
create or replace function public.end_shift_atomic(
  p_session_id uuid
)
returns public.sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent uuid := auth.uid();
  v_session public.sessions;
  v_booking public.bookings;
  v_booking_id uuid;
  v_session_status text;
  v_booking_status text;
  v_start_ts timestamptz;
  v_end_ts timestamptz;
  v_elapsed integer;
  v_rate numeric;
  v_amount numeric(12, 2);
  v_already_ended boolean := false;
begin
  if v_parent is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if p_session_id is null then
    raise exception 'session id is required' using errcode = 'invalid_parameter_value';
  end if;

  select * into v_session
    from public.sessions
   where id = p_session_id;

  if not found then
    raise exception 'session % not found', p_session_id
      using errcode = 'no_data_found';
  end if;

  if v_session.parent_id is distinct from v_parent then
    raise exception 'not authorized for session %', p_session_id
      using errcode = '42501';
  end if;

  v_booking_id := coalesce(v_session.booking_id, p_session_id);

  select * into v_booking
    from public.bookings
   where id = v_booking_id;

  if not found then
    raise exception 'booking % not found for session %', v_booking_id, p_session_id
      using errcode = 'no_data_found';
  end if;

  if v_booking.parent_id is distinct from v_parent then
    raise exception 'not authorized for booking %', v_booking_id
      using errcode = '42501';
  end if;

  v_session_status := lower(trim(coalesce(v_session.status, '')));
  v_booking_status := lower(trim(coalesce(v_booking.status::text, '')));

  v_already_ended :=
    v_session_status = 'payment_pending'
    and v_session.end_time is not null
    and v_session.start_time is not null
    and v_session.final_elapsed_seconds is not null
    and v_session.final_amount_nis is not null;

  if v_already_ended then
    update public.bookings
       set status = 'completed',
           actual_end_time = coalesce(actual_end_time, v_session.end_time)
     where id = v_booking_id
       and parent_id = v_parent
       and status in ('parent_started', 'sitter_ended', 'completed');

    return v_session;
  end if;

  if v_session_status not in ('active', 'in_progress', 'sitter_completed') then
    raise exception
      'session % is not in an endable state (current: %)',
      p_session_id,
      v_session.status
      using errcode = 'invalid_parameter_value';
  end if;

  if v_booking_status not in ('parent_started', 'sitter_ended') then
    raise exception
      'booking % is not in an endable state (current: %)',
      v_booking_id,
      v_booking.status
      using errcode = 'invalid_parameter_value';
  end if;

  v_start_ts := v_session.start_time;
  if v_start_ts is null then
    raise exception 'session % is missing start_time', p_session_id
      using errcode = 'invalid_parameter_value';
  end if;

  v_rate := v_booking.hourly_rate_nis;
  if v_rate is null or v_rate <= 0 then
    raise exception 'booking % is missing a valid hourly_rate_nis', v_booking_id
      using errcode = 'invalid_parameter_value';
  end if;

  v_end_ts := now();
  v_elapsed := greatest(
    0,
    floor(extract(epoch from (v_end_ts - v_start_ts)))::integer
  );
  v_amount := round((v_elapsed::numeric / 3600.0) * v_rate, 2);

  update public.sessions
     set session_status        = 'completed',
         status                = 'payment_pending',
         parent_end_shake      = coalesce(parent_end_shake, v_end_ts),
         end_time              = v_end_ts,
         final_elapsed_seconds = v_elapsed,
         total_amount_charged  = v_amount,
         final_amount_nis      = v_amount
   where id = p_session_id
     and parent_id = v_parent
  returning * into v_session;

  if not found then
    raise exception 'session % not found for parent %', p_session_id, v_parent
      using errcode = 'no_data_found';
  end if;

  update public.bookings
     set status = 'completed',
         actual_end_time = coalesce(actual_end_time, v_end_ts)
   where id = v_booking_id
     and parent_id = v_parent
     and status in ('parent_started', 'sitter_ended');

  return v_session;
end;
$$;

revoke all on function public.end_shift_atomic(uuid) from public;
revoke all on function public.end_shift_atomic(uuid) from anon;
grant execute on function public.end_shift_atomic(uuid) to authenticated;

comment on function public.end_shift_atomic(uuid) is
  'Parent confirm-end: derives duration and amount from sessions.start_time, now(), and bookings.hourly_rate_nis. Does not trust client elapsed/amount/end time. Does not mark paid.';

-- ---------------------------------------------------------------------------
-- 2. TEMPORARY BACKWARD-COMPATIBILITY OVERLOAD
--
-- Keep the historical 5-arg signature so current production clients continue
-- to work after this SQL is applied and before the new app is deployed.
--
-- p_parent_id, p_end_iso, p_elapsed, and p_amount are accepted for PostgREST
-- named-arg compatibility ONLY. They MUST NOT be read for authorization,
-- timestamps, duration, or amount. All of that lives in the 1-arg function.
--
-- Drop this overload in a later cleanup migration after the new app is live.
-- ---------------------------------------------------------------------------
create or replace function public.end_shift_atomic(
  p_session_id uuid,
  p_parent_id uuid,
  p_end_iso timestamptz,
  p_elapsed integer,
  p_amount numeric
)
returns public.sessions
language plpgsql
security definer
set search_path = public
as $$
begin
  -- TEMPORARY BACKWARD-COMPATIBILITY OVERLOAD
  -- Intentionally unused: p_parent_id, p_end_iso, p_elapsed, p_amount.
  return public.end_shift_atomic(p_session_id);
end;
$$;

revoke all on function public.end_shift_atomic(uuid, uuid, timestamptz, integer, numeric) from public;
revoke all on function public.end_shift_atomic(uuid, uuid, timestamptz, integer, numeric) from anon;
grant execute on function public.end_shift_atomic(uuid, uuid, timestamptz, integer, numeric) to authenticated;

comment on function public.end_shift_atomic(uuid, uuid, timestamptz, integer, numeric) is
  'TEMPORARY BACKWARD-COMPATIBILITY OVERLOAD. Ignores p_parent_id, p_end_iso, p_elapsed, p_amount and delegates to end_shift_atomic(uuid). Remove after the 1-arg app is deployed.';

notify pgrst, 'reload schema';
