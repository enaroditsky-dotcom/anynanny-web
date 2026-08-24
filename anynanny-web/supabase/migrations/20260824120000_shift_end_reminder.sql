-- Scheduled shift lifecycle additions (local only; do not apply remotely here):
--   A. Auto-cancel approved bookings with no completed Double-Shake START after +30 min.
--   B. Informational shift-end reminder only after canonical completed Double-Shake START.
--
-- Reuses canonical public.notifications + the existing minute pg_cron job.
-- Does NOT change Double-Shake transitions, HYP/payment, ratings, or two-party cancellation RPCs.

-- ---------------------------------------------------------------------------
-- 0. Scan indexes
-- ---------------------------------------------------------------------------
create index if not exists bookings_approved_start_time_idx
  on public.bookings (start_time)
  where status in ('approved', 'sitter_started')
    and actual_end_time is null;

drop index if exists public.bookings_shift_end_reminder_idx;
create index if not exists bookings_shift_end_reminder_idx
  on public.bookings (end_time)
  where status in ('sitter_started', 'parent_started')
    and actual_end_time is null;

-- ---------------------------------------------------------------------------
-- 1. Dedupe keys — keep existing mappings, add new kinds
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
    when 'shift_end_reminder' then new.payload->>'booking_id'
    when 'shift_cancelled_no_start' then new.payload->>'booking_id'
    else new.dedupe_key
  end;

  if new.dedupe_key is not null and btrim(new.dedupe_key) = '' then
    new.dedupe_key := null;
  end if;

  return new;
end;
$$;

-- Canonical completed Double-Shake START: both start-shake timestamps are set.
-- Read-only. Does not write session state.
create or replace function public.booking_has_completed_double_shake_start(p_booking_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.sessions s
     where coalesce(s.booking_id, s.id) = p_booking_id
       and s.sitter_start_shake is not null
       and s.parent_start_shake is not null
  );
$$;

revoke all on function public.booking_has_completed_double_shake_start(uuid) from public;
revoke all on function public.booking_has_completed_double_shake_start(uuid) from anon;
revoke all on function public.booking_has_completed_double_shake_start(uuid) from authenticated;
do $$
begin
  execute 'grant execute on function public.booking_has_completed_double_shake_start(uuid) to postgres';
exception
  when others then null;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Auto-cancel approved / one-sided-start bookings with no completed START
-- ---------------------------------------------------------------------------
create or replace function public.cancel_approved_bookings_without_start()
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
  v_time_label text;
  v_body text;
  v_parent_created uuid;
  v_sitter_created uuid;
  v_count integer := 0;
begin
  for v_id, v_parent, v_sitter, v_date, v_start, v_end in
    select b.id, b.parent_id, b.sitter_id, b.booking_date, b.start_time, b.end_time
      from public.bookings b
     where lower(btrim(coalesce(b.status::text, ''))) in ('approved', 'sitter_started')
       and b.cancelled_at is null
       and b.actual_end_time is null
       and b.start_time is not null
       and b.start_time + interval '30 minutes' <= now()
       and not public.booking_has_completed_double_shake_start(b.id)
     for update skip locked
  loop
    if not exists (
      select 1
        from public.bookings live
       where live.id = v_id
         and lower(btrim(coalesce(live.status::text, ''))) in ('approved', 'sitter_started')
         and live.cancelled_at is null
         and live.actual_end_time is null
         and live.start_time + interval '30 minutes' <= now()
         and not public.booking_has_completed_double_shake_start(live.id)
    ) then
      continue;
    end if;

    update public.bookings
       set status = 'cancelled',
           cancelled_by = null,
           cancelled_at = now(),
           cancellation_message = 'no_start_confirmation',
           updated_at = now()
     where id = v_id
       and lower(btrim(coalesce(status::text, ''))) in ('approved', 'sitter_started')
       and cancelled_at is null
       and actual_end_time is null;

    if not found then
      continue;
    end if;

    begin
      update public.sessions
         set status = 'cancelled',
             session_status = 'cancelled',
             updated_at = now()
       where coalesce(booking_id, id) = v_id
         and end_time is null
         and lower(btrim(coalesce(status, ''))) not in (
           'completed', 'payment_pending', 'paid', 'cancelled'
         )
         and lower(btrim(coalesce(session_status, ''))) not in (
           'completed', 'paid', 'payment_pending'
         );
    exception
      when others then
        null;
    end;

    v_count := v_count + 1;
    v_time_label := to_char(timezone('Asia/Jerusalem', v_start), 'HH24:MI');
    v_body := format(
      'המשמרת שתוכננה להתחיל בשעה %s בוטלה אוטומטית מכיוון שלא אושרה התחלת המשמרת.',
      v_time_label
    );

    begin
      v_parent_created := public.create_canonical_notification(
        v_parent,
        'shift_cancelled_no_start',
        'המשמרת בוטלה',
        v_body,
        jsonb_build_object(
          'booking_id', v_id,
          'parent_id', v_parent,
          'sitter_id', v_sitter,
          'booking_date', v_date,
          'start_time', v_start,
          'end_time', v_end,
          'status', 'cancelled',
          'cancellation_reason', 'no_start_confirmation',
          'cancelled_role', 'system',
          'recipient_role', 'parent'
        ),
        v_id::text
      );
    exception
      when unique_violation then
        v_parent_created := null;
      when undefined_function then
        v_parent_created := null;
      when undefined_table then
        v_parent_created := null;
    end;

    begin
      v_sitter_created := public.create_canonical_notification(
        v_sitter,
        'shift_cancelled_no_start',
        'המשמרת בוטלה',
        v_body,
        jsonb_build_object(
          'booking_id', v_id,
          'parent_id', v_parent,
          'sitter_id', v_sitter,
          'booking_date', v_date,
          'start_time', v_start,
          'end_time', v_end,
          'status', 'cancelled',
          'cancellation_reason', 'no_start_confirmation',
          'cancelled_role', 'system',
          'recipient_role', 'sitter'
        ),
        v_id::text
      );
    exception
      when unique_violation then
        v_sitter_created := null;
      when undefined_function then
        v_sitter_created := null;
      when undefined_table then
        v_sitter_created := null;
    end;

    if v_parent_created is null and v_sitter_created is null then
      null;
    end if;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.cancel_approved_bookings_without_start() from public;
revoke all on function public.cancel_approved_bookings_without_start() from anon;
revoke all on function public.cancel_approved_bookings_without_start() from authenticated;
do $$
begin
  execute 'grant execute on function public.cancel_approved_bookings_without_start() to postgres';
exception
  when others then null;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Shift-end reminder — only after completed Double-Shake START
-- ---------------------------------------------------------------------------
create or replace function public.notify_shift_end_reminders()
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
  v_status text;
  v_time_label text;
  v_sitter_name text;
  v_parent_body text;
  v_sitter_body text;
  v_parent_created uuid;
  v_sitter_created uuid;
  v_count integer := 0;
begin
  for v_id, v_parent, v_sitter, v_date, v_start, v_end, v_status in
    select b.id, b.parent_id, b.sitter_id, b.booking_date, b.start_time, b.end_time, b.status
      from public.bookings b
     where lower(btrim(coalesce(b.status::text, ''))) in ('approved', 'sitter_started', 'parent_started')
       and b.parent_id is not null
       and b.sitter_id is not null
       and b.parent_id is distinct from b.sitter_id
       and b.cancelled_at is null
       and b.actual_end_time is null
       and b.end_time is not null
       and b.start_time <= now()
       and b.end_time - interval '30 minutes' <= now()
       and b.end_time > now()
       and public.booking_has_completed_double_shake_start(b.id)
       and not exists (
         select 1
           from public.sessions s
          where coalesce(s.booking_id, s.id) = b.id
            and (
              s.end_time is not null
              or lower(btrim(coalesce(s.status, ''))) in (
                'completed', 'payment_pending', 'cancelled', 'paid'
              )
              or lower(btrim(coalesce(s.session_status, ''))) in (
                'completed', 'paid', 'payment_pending', 'cancelled',
                'sitter_ended', 'sitter_completed'
              )
            )
       )
       and (
         not exists (
           select 1
             from public.notifications n
            where n.user_id = b.parent_id
              and n.kind = 'shift_end_reminder'
              and n.dedupe_key = b.id::text
         )
         or not exists (
           select 1
             from public.notifications n
            where n.user_id = b.sitter_id
              and n.kind = 'shift_end_reminder'
              and n.dedupe_key = b.id::text
         )
       )
  loop
    if not exists (
      select 1
        from public.bookings live
       where live.id = v_id
         and lower(btrim(coalesce(live.status::text, ''))) in ('approved', 'sitter_started', 'parent_started')
         and live.cancelled_at is null
         and live.actual_end_time is null
         and live.start_time <= now()
         and live.end_time - interval '30 minutes' <= now()
         and live.end_time > now()
         and public.booking_has_completed_double_shake_start(live.id)
    ) then
      continue;
    end if;

    if exists (
      select 1
        from public.sessions s
       where coalesce(s.booking_id, s.id) = v_id
         and (
           s.end_time is not null
           or lower(btrim(coalesce(s.status, ''))) in (
             'completed', 'payment_pending', 'cancelled', 'paid'
           )
           or lower(btrim(coalesce(s.session_status, ''))) in (
             'completed', 'paid', 'payment_pending', 'cancelled',
             'sitter_ended', 'sitter_completed'
           )
         )
    ) then
      continue;
    end if;

    v_time_label := to_char(timezone('Asia/Jerusalem', v_end), 'HH24:MI');

    select nullif(btrim(coalesce(p.first_name, '')), '')
      into v_sitter_name
      from public.profiles p
     where p.id = v_sitter;

    if v_sitter_name is not null then
      v_parent_body := format(
        'המשמרת עם %s מתוכננת להסתיים בשעה %s. אם אתם צפויים לאחר, מומלץ לעדכן אותה מראש.',
        v_sitter_name,
        v_time_label
      );
    else
      v_parent_body := format(
        'המשמרת מתוכננת להסתיים בשעה %s. אם אתם צפויים לאחר, מומלץ לעדכן אותה מראש.',
        v_time_label
      );
    end if;

    v_sitter_body := format(
      'שעת הסיום המתוכננת של המשמרת היא %s.',
      v_time_label
    );

    begin
      v_parent_created := public.create_canonical_notification(
        v_parent,
        'shift_end_reminder',
        'המשמרת מסתיימת בעוד 30 דקות',
        v_parent_body,
        jsonb_build_object(
          'booking_id', v_id,
          'parent_id', v_parent,
          'sitter_id', v_sitter,
          'booking_date', v_date,
          'start_time', v_start,
          'end_time', v_end,
          'status', v_status,
          'recipient_role', 'parent'
        ),
        v_id::text
      );
    exception
      when unique_violation then
        v_parent_created := null;
      when undefined_function then
        v_parent_created := null;
      when undefined_table then
        v_parent_created := null;
    end;

    begin
      v_sitter_created := public.create_canonical_notification(
        v_sitter,
        'shift_end_reminder',
        'המשמרת מסתיימת בעוד 30 דקות',
        v_sitter_body,
        jsonb_build_object(
          'booking_id', v_id,
          'parent_id', v_parent,
          'sitter_id', v_sitter,
          'booking_date', v_date,
          'start_time', v_start,
          'end_time', v_end,
          'status', v_status,
          'recipient_role', 'sitter'
        ),
        v_id::text
      );
    exception
      when unique_violation then
        v_sitter_created := null;
      when undefined_function then
        v_sitter_created := null;
      when undefined_table then
        v_sitter_created := null;
    end;

    if v_parent_created is not null or v_sitter_created is not null then
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.notify_shift_end_reminders() from public;
revoke all on function public.notify_shift_end_reminders() from anon;
revoke all on function public.notify_shift_end_reminders() from authenticated;
do $$
begin
  execute 'grant execute on function public.notify_shift_end_reminders() to postgres';
exception
  when others then null;
end $$;

-- Reuse the existing minute job. Cancel no-start before the end reminder.
create or replace function public.run_pending_booking_lifecycle_job()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.expire_pending_bookings();
  perform public.notify_pending_no_response_reminders();
  perform public.cancel_approved_bookings_without_start();
  perform public.notify_shift_end_reminders();
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

notify pgrst, 'reload schema';
