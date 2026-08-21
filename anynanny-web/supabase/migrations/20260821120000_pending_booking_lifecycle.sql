-- Pending booking lifecycle: parent withdraw, 1-hour reminder, start-time expiry.
-- Reuses bookings.status = cancelled. Does not delete rows.
-- Does not change approved two-party cancellation.
-- Cron writes DB state + canonical notifications only; existing notifications
-- INSERT webhook delivers Web Push.

-- ---------------------------------------------------------------------------
-- 0. Scan indexes for pending reminder / expiry
-- ---------------------------------------------------------------------------
create index if not exists bookings_pending_start_time_idx
  on public.bookings (start_time)
  where status = 'pending';

create index if not exists bookings_pending_created_at_idx
  on public.bookings (created_at)
  where status = 'pending';

-- ---------------------------------------------------------------------------
-- 1. Dedupe keys for new canonical kinds (keep existing mappings)
-- ---------------------------------------------------------------------------
create or replace function public.notifications_assign_dedupe_key()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.dedupe_key is not null and btrim(new.dedupe_key) <> '' then
    return new;
  end if;

  new.dedupe_key := case new.kind
    when 'booking_request' then new.payload->>'booking_id'
    when 'booking_approved' then new.payload->>'booking_id'
    when 'booking_rejected' then new.payload->>'booking_id'
    when 'chat_message' then new.payload->>'message_id'
    when 'broadcast_alert' then coalesce(new.payload->>'broadcast_id', new.payload->>'alert_id')
    when 'booking_cancellation_requested' then new.payload->>'booking_id'
    when 'booking_cancellation_approved' then new.payload->>'booking_id'
    when 'payment_received' then coalesce(new.payload->>'booking_id', new.payload->>'hyp_approval_id')
    when 'payment_required' then coalesce(new.payload->>'session_id', new.payload->>'booking_id')
    when 'pending_no_response_reminder' then new.payload->>'booking_id'
    when 'booking_withdrawn_by_parent' then new.payload->>'booking_id'
    when 'pending_booking_expired' then new.payload->>'booking_id'
    else new.dedupe_key
  end;

  if new.dedupe_key is not null and btrim(new.dedupe_key) = '' then
    new.dedupe_key := null;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Parent withdraw of a pending booking
-- ---------------------------------------------------------------------------
create or replace function public.withdraw_pending_booking(p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_booking public.bookings%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if p_booking_id is null then
    raise exception 'missing booking id' using errcode = 'P0001';
  end if;

  select *
    into v_booking
    from public.bookings
   where id = p_booking_id
   for update;

  if not found then
    raise exception 'booking not found' using errcode = 'P0001';
  end if;

  if v_uid is distinct from v_booking.parent_id then
    raise exception 'not authorized for booking %', p_booking_id using errcode = '42501';
  end if;

  if v_booking.status = 'cancelled' then
    return jsonb_build_object(
      'ok', true,
      'state', 'already_cancelled',
      'booking_id', v_booking.id,
      'status', v_booking.status,
      'cancelled_by', v_booking.cancelled_by,
      'cancelled_at', v_booking.cancelled_at
    );
  end if;

  if v_booking.status is distinct from 'pending' then
    raise exception 'booking is not pending' using errcode = 'P0001';
  end if;

  update public.bookings
     set status = 'cancelled',
         cancelled_by = v_uid,
         cancelled_at = now(),
         cancellation_requested_by = v_uid,
         cancellation_requested_role = 'parent',
         cancellation_requested_at = now(),
         updated_at = now()
   where id = v_booking.id
     and status = 'pending'
  returning * into v_booking;

  if not found then
    raise exception 'booking is not pending' using errcode = 'P0001';
  end if;

  begin
    perform public.create_canonical_notification(
      v_booking.sitter_id,
      'booking_withdrawn_by_parent',
      'בקשת המשמרת בוטלה',
      'ההורה ביטל את בקשת המשמרת',
      jsonb_build_object(
        'booking_id', v_booking.id,
        'parent_id', v_booking.parent_id,
        'sitter_id', v_booking.sitter_id,
        'booking_date', v_booking.booking_date,
        'start_time', v_booking.start_time,
        'end_time', v_booking.end_time,
        'status', v_booking.status,
        'cancelled_by', v_uid,
        'cancelled_role', 'parent'
      ),
      v_booking.id::text
    );
  exception
    when undefined_function then
      null;
    when undefined_table then
      null;
  end;

  return jsonb_build_object(
    'ok', true,
    'state', 'cancelled',
    'booking_id', v_booking.id,
    'status', v_booking.status,
    'cancelled_by', v_booking.cancelled_by,
    'cancelled_at', v_booking.cancelled_at
  );
end;
$$;

revoke all on function public.withdraw_pending_booking(uuid) from public;
revoke all on function public.withdraw_pending_booking(uuid) from anon;
grant execute on function public.withdraw_pending_booking(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Start-time auto expiry (scheduler only)
-- ---------------------------------------------------------------------------
create or replace function public.expire_pending_bookings()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_parent uuid;
  v_sitter uuid;
  v_date date;
  v_start timestamptz;
  v_end timestamptz;
  v_count integer := 0;
begin
  for v_id, v_parent, v_sitter, v_date, v_start, v_end in
    select b.id, b.parent_id, b.sitter_id, b.booking_date, b.start_time, b.end_time
      from public.bookings b
     where b.status = 'pending'
       and b.start_time <= now()
     for update skip locked
  loop
    update public.bookings
       set status = 'cancelled',
           cancelled_by = null,
           cancelled_at = now(),
           updated_at = now()
     where id = v_id
       and status = 'pending';

    if not found then
      continue;
    end if;

    v_count := v_count + 1;

    begin
      perform public.create_canonical_notification(
        v_parent,
        'pending_booking_expired',
        'הבקשה נסגרה',
        'הבייביסיטר לא הגיבה לפנייתך. הבקשה נסגרה.',
        jsonb_build_object(
          'booking_id', v_id,
          'parent_id', v_parent,
          'sitter_id', v_sitter,
          'booking_date', v_date,
          'start_time', v_start,
          'end_time', v_end,
          'status', 'cancelled'
        ),
        v_id::text
      );
    exception
      when undefined_function then
        null;
      when undefined_table then
        null;
    end;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.expire_pending_bookings() from public;
revoke all on function public.expire_pending_bookings() from anon;
revoke all on function public.expire_pending_bookings() from authenticated;
do $$
begin
  execute 'grant execute on function public.expire_pending_bookings() to postgres';
exception
  when others then null;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Exactly-once 60-minute no-response reminder (scheduler only)
-- ---------------------------------------------------------------------------
create or replace function public.notify_pending_no_response_reminders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_parent uuid;
  v_sitter uuid;
  v_date date;
  v_start timestamptz;
  v_end timestamptz;
  v_created uuid;
  v_count integer := 0;
begin
  for v_id, v_parent, v_sitter, v_date, v_start, v_end in
    select b.id, b.parent_id, b.sitter_id, b.booking_date, b.start_time, b.end_time
      from public.bookings b
     where b.status = 'pending'
       and b.created_at <= now() - interval '60 minutes'
       and b.start_time > now()
       and not exists (
         select 1
           from public.notifications n
          where n.user_id = b.parent_id
            and n.kind = 'pending_no_response_reminder'
            and n.dedupe_key = b.id::text
       )
  loop
    if not exists (
      select 1
        from public.bookings live
       where live.id = v_id
         and live.status = 'pending'
         and live.start_time > now()
    ) then
      continue;
    end if;

    begin
      v_created := public.create_canonical_notification(
        v_parent,
        'pending_no_response_reminder',
        'בקשה ממתינה',
        'הבייביסיטר עדיין לא הגיבה לבקשתך. לסגור את הפנייה לבייביסיטרית?',
        jsonb_build_object(
          'booking_id', v_id,
          'parent_id', v_parent,
          'sitter_id', v_sitter,
          'booking_date', v_date,
          'start_time', v_start,
          'end_time', v_end,
          'status', 'pending'
        ),
        v_id::text
      );
    exception
      when unique_violation then
        v_created := null;
      when undefined_function then
        v_created := null;
      when undefined_table then
        v_created := null;
    end;

    if v_created is not null then
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.notify_pending_no_response_reminders() from public;
revoke all on function public.notify_pending_no_response_reminders() from anon;
revoke all on function public.notify_pending_no_response_reminders() from authenticated;
do $$
begin
  execute 'grant execute on function public.notify_pending_no_response_reminders() to postgres';
exception
  when others then null;
end $$;

-- Expire first, then remind — never remind a booking whose start_time has arrived.
create or replace function public.run_pending_booking_lifecycle_job()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.expire_pending_bookings();
  perform public.notify_pending_no_response_reminders();
end;
$$;

revoke all on function public.run_pending_booking_lifecycle_job() from public;
revoke all on function public.run_pending_booking_lifecycle_job() from anon;
revoke all on function public.run_pending_booking_lifecycle_job() from authenticated;
do $$
begin
  execute 'grant execute on function public.run_pending_booking_lifecycle_job() to postgres';
exception
  when others then null;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Block pending → approved after start_time (DB clock)
-- ---------------------------------------------------------------------------
create or replace function public.bookings_block_expired_pending_approval()
returns trigger
language plpgsql
as $$
begin
  if lower(btrim(coalesce(old.status, ''))) = 'pending'
     and lower(btrim(coalesce(new.status, ''))) = 'approved'
     and old.start_time <= now() then
    raise exception 'pending booking has expired' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists bookings_block_expired_pending_approval on public.bookings;
create trigger bookings_block_expired_pending_approval
  before update of status on public.bookings
  for each row
  execute function public.bookings_block_expired_pending_approval();

revoke all on function public.bookings_block_expired_pending_approval() from public;
revoke all on function public.bookings_block_expired_pending_approval() from anon;
revoke all on function public.bookings_block_expired_pending_approval() from authenticated;

-- ---------------------------------------------------------------------------
-- 6. pg_cron — one job every minute. Enable extension when the role can;
--    otherwise leave functions in place for Dashboard Cron setup.
-- ---------------------------------------------------------------------------
do $$
begin
  begin
    execute 'create extension if not exists pg_cron with schema pg_catalog';
  exception
    when others then
      raise notice 'pg_cron could not be enabled from this migration (%). Enable it in Dashboard → Integrations → Cron.', SQLERRM;
  end;
end $$;

do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron is not installed. Enable Dashboard → Integrations → Cron, then schedule job anynanny-pending-booking-lifecycle as: select public.run_pending_booking_lifecycle_job(); every minute.';
    return;
  end if;

  begin
    execute 'grant usage on schema cron to postgres';
  exception
    when others then
      null;
  end;

  begin
    perform cron.unschedule('anynanny-pending-booking-lifecycle');
  exception
    when undefined_function then
      null;
    when others then
      null;
  end;

  begin
    perform cron.schedule(
      'anynanny-pending-booking-lifecycle',
      '* * * * *',
      'select public.run_pending_booking_lifecycle_job();'
    );
  exception
    when undefined_function then
      raise notice 'cron.schedule is unavailable. Enable Dashboard → Integrations → Cron and schedule anynanny-pending-booking-lifecycle manually.';
    when others then
      raise notice 'Could not schedule anynanny-pending-booking-lifecycle (%). Schedule select public.run_pending_booking_lifecycle_job(); every minute in Dashboard → Integrations → Cron.', SQLERRM;
  end;
end $$;

notify pgrst, 'reload schema';
