-- Missed-shift clarification: approved bookings whose scheduled end has passed
-- without a recorded start enter awaiting_missed_shift_reason.
-- Distinct from cancelled. Resolution is trusted-server RPC only.
-- Local-only in this task: do not apply remotely from the agent.

-- ---------------------------------------------------------------------------
-- 0. Widen bookings.status
-- ---------------------------------------------------------------------------
alter table public.bookings
  drop constraint if exists bookings_status_check;

alter table public.bookings
  add constraint bookings_status_check
  check (
    status in (
      'pending',
      'approved',
      'rejected',
      'cancelled',
      'sitter_started',
      'parent_started',
      'sitter_ended',
      'completed',
      'awaiting_missed_shift_reason',
      'did_not_occur',
      'happened_unverified',
      'missed_shift_disputed'
    )
  );

create index if not exists bookings_missed_shift_lifecycle_idx
  on public.bookings (parent_id, sitter_id, end_time desc)
  where status in (
    'awaiting_missed_shift_reason',
    'did_not_occur',
    'happened_unverified',
    'missed_shift_disputed'
  );

create index if not exists bookings_approved_end_time_idx
  on public.bookings (end_time)
  where status = 'approved'
    and actual_start_time is null;

-- ---------------------------------------------------------------------------
-- 1. Independent parent/sitter reports + audit
-- ---------------------------------------------------------------------------
create table if not exists public.booking_missed_shift_reports (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  role text not null check (role in ('parent', 'sitter')),
  reason_code text not null check (reason_code in (
    'nanny_no_show',
    'parent_unavailable',
    'mutual_off_app_agreement',
    'date_or_time_error',
    'forgot_shift',
    'technical_start_failure',
    'emergency_or_unexpected_change',
    'shift_happened_without_app_start'
  )),
  submitted_by uuid not null references auth.users (id) on delete restrict,
  submitted_at timestamptz not null default now(),
  unique (booking_id, role)
);

comment on table public.booking_missed_shift_reports is
  'Independent parent/sitter missed-shift reasons. Write-once via submit_missed_shift_reason.';

create index if not exists booking_missed_shift_reports_booking_idx
  on public.booking_missed_shift_reports (booking_id, submitted_at desc);

alter table public.booking_missed_shift_reports enable row level security;

drop policy if exists booking_missed_shift_reports_select_participant on public.booking_missed_shift_reports;
create policy booking_missed_shift_reports_select_participant
  on public.booking_missed_shift_reports
  for select
  to authenticated
  using (
    exists (
      select 1
        from public.bookings b
       where b.id = booking_id
         and (b.parent_id = auth.uid() or b.sitter_id = auth.uid())
    )
  );

revoke insert, update, delete on public.booking_missed_shift_reports from anon;
revoke insert, update, delete on public.booking_missed_shift_reports from authenticated;
grant select on public.booking_missed_shift_reports to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Notification dedupe for clarification kind
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
    when 'missed_shift_clarification' then new.payload->>'booking_id'
    else new.dedupe_key
  end;

  if new.dedupe_key is not null and btrim(new.dedupe_key) = '' then
    new.dedupe_key := null;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Reconcile approved past-end never-started bookings for the caller
-- ---------------------------------------------------------------------------
create or replace function public.reconcile_unstarted_past_bookings()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_ids uuid[] := '{}';
  v_id uuid;
  v_parent uuid;
  v_sitter uuid;
  v_date date;
  v_start timestamptz;
  v_end timestamptz;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  for v_id, v_parent, v_sitter, v_date, v_start, v_end in
    select b.id, b.parent_id, b.sitter_id, b.booking_date, b.start_time, b.end_time
      from public.bookings b
     where (b.parent_id = v_uid or b.sitter_id = v_uid)
       and b.status = 'approved'
       and b.cancelled_at is null
       and coalesce(b.requires_admin_review, false) is not true
       and b.actual_start_time is null
       and b.actual_end_time is null
       and b.end_time is not null
       and b.end_time < now()
       and not public.booking_has_completed_double_shake_start(b.id)
     for update skip locked
  loop
    update public.bookings
       set status = 'awaiting_missed_shift_reason',
           updated_at = now()
     where id = v_id
       and status = 'approved'
       and cancelled_at is null
       and actual_start_time is null;

    if not found then
      continue;
    end if;

    v_ids := array_append(v_ids, v_id);

    begin
      perform public.create_canonical_notification(
        v_parent,
        'missed_shift_clarification',
        'המשמרת לא התקיימה',
        'יש לבחור את הסיבה לכך שהמשמרת לא התקיימה.',
        jsonb_build_object(
          'booking_id', v_id,
          'parent_id', v_parent,
          'sitter_id', v_sitter,
          'booking_date', v_date,
          'start_time', v_start,
          'end_time', v_end,
          'status', 'awaiting_missed_shift_reason',
          'recipient_role', 'parent'
        ),
        v_id::text
      );
    exception
      when unique_violation then null;
      when undefined_function then null;
      when undefined_table then null;
    end;

    begin
      perform public.create_canonical_notification(
        v_sitter,
        'missed_shift_clarification',
        'המשמרת לא התקיימה',
        'יש לבחור את הסיבה לכך שהמשמרת לא התקיימה.',
        jsonb_build_object(
          'booking_id', v_id,
          'parent_id', v_parent,
          'sitter_id', v_sitter,
          'booking_date', v_date,
          'start_time', v_start,
          'end_time', v_end,
          'status', 'awaiting_missed_shift_reason',
          'recipient_role', 'sitter'
        ),
        v_id::text
      );
    exception
      when unique_violation then null;
      when undefined_function then null;
      when undefined_table then null;
    end;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'reconciled_count', coalesce(cardinality(v_ids), 0),
    'booking_ids', to_jsonb(coalesce(v_ids, '{}'))
  );
end;
$$;

revoke all on function public.reconcile_unstarted_past_bookings() from public;
revoke all on function public.reconcile_unstarted_past_bookings() from anon;
grant execute on function public.reconcile_unstarted_past_bookings() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Submit one side's reason; resolve only through this RPC
-- ---------------------------------------------------------------------------
create or replace function public.submit_missed_shift_reason(
  p_booking_id uuid,
  p_reason_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_booking public.bookings%rowtype;
  v_role text;
  v_parent_reason text;
  v_sitter_reason text;
  v_outcome text;
  v_next_status text;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if p_booking_id is null then
    raise exception 'booking not found' using errcode = 'P0001';
  end if;

  if p_reason_code is null or p_reason_code not in (
    'nanny_no_show',
    'parent_unavailable',
    'mutual_off_app_agreement',
    'date_or_time_error',
    'forgot_shift',
    'technical_start_failure',
    'emergency_or_unexpected_change',
    'shift_happened_without_app_start'
  ) then
    raise exception 'invalid reason' using errcode = 'P0001';
  end if;

  select *
    into v_booking
    from public.bookings
   where id = p_booking_id
   for update;

  if not found then
    raise exception 'booking not found' using errcode = 'P0001';
  end if;

  if v_uid = v_booking.parent_id then
    v_role := 'parent';
  elsif v_uid = v_booking.sitter_id then
    v_role := 'sitter';
  else
    raise exception 'not authorized for booking' using errcode = '42501';
  end if;

  if v_booking.status is distinct from 'awaiting_missed_shift_reason' then
    raise exception 'booking is not awaiting missed-shift reason' using errcode = 'P0001';
  end if;

  insert into public.booking_missed_shift_reports (
    booking_id,
    role,
    reason_code,
    submitted_by
  )
  values (
    v_booking.id,
    v_role,
    p_reason_code,
    v_uid
  );

  select
    max(reason_code) filter (where role = 'parent'),
    max(reason_code) filter (where role = 'sitter')
    into v_parent_reason, v_sitter_reason
    from public.booking_missed_shift_reports
   where booking_id = v_booking.id;

  if v_parent_reason is not null and v_sitter_reason is not null then
    if v_parent_reason = 'shift_happened_without_app_start'
       and v_sitter_reason = 'shift_happened_without_app_start' then
      v_outcome := 'happened_unverified';
      v_next_status := 'happened_unverified';
    elsif v_parent_reason = 'shift_happened_without_app_start'
       or v_sitter_reason = 'shift_happened_without_app_start' then
      v_outcome := 'disputed';
      v_next_status := 'missed_shift_disputed';
    else
      v_outcome := 'did_not_occur';
      v_next_status := 'did_not_occur';
    end if;

    update public.bookings
       set status = v_next_status,
           updated_at = now()
     where id = v_booking.id
       and status = 'awaiting_missed_shift_reason';
  else
    v_outcome := 'awaiting_other_side';
    v_next_status := 'awaiting_missed_shift_reason';
  end if;

  return jsonb_build_object(
    'ok', true,
    'booking_id', v_booking.id,
    'status', v_next_status,
    'outcome', v_outcome,
    'role', v_role,
    'parent_reason', v_parent_reason,
    'sitter_reason', v_sitter_reason
  );
exception
  when unique_violation then
    raise exception 'already submitted' using errcode = 'P0001';
end;
$$;

revoke all on function public.submit_missed_shift_reason(uuid, text) from public;
revoke all on function public.submit_missed_shift_reason(uuid, text) from anon;
grant execute on function public.submit_missed_shift_reason(uuid, text) to authenticated;

-- Past-end approved rows belong to clarification, not the +30min auto-cancel.
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
       and b.end_time is not null
       and b.end_time >= now()
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
         and live.end_time >= now()
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

notify pgrst, 'reload schema';
