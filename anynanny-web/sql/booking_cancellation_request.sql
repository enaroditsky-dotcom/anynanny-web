-- Cancellation REQUEST flow for scheduled bookings.
-- A scheduled shift stays active until the other participant approves.
-- Does not delete rows. Does not touch payment / refunds.

alter table public.bookings
  add column if not exists cancellation_requested_by uuid references auth.users (id) on delete set null;

alter table public.bookings
  add column if not exists cancellation_requested_role text;

alter table public.bookings
  add column if not exists cancellation_requested_at timestamptz;

alter table public.bookings
  add column if not exists cancellation_message text;

alter table public.bookings
  add column if not exists cancellation_approved_by uuid references auth.users (id) on delete set null;

alter table public.bookings
  add column if not exists cancellation_approved_at timestamptz;

alter table public.bookings
  add column if not exists cancelled_by uuid references auth.users (id) on delete set null;

alter table public.bookings
  add column if not exists cancelled_at timestamptz;

alter table public.bookings
  drop constraint if exists bookings_cancellation_requested_role_check;

alter table public.bookings
  add constraint bookings_cancellation_requested_role_check
  check (
    cancellation_requested_role is null
    or cancellation_requested_role in ('parent', 'sitter')
  );

alter table public.bookings
  drop constraint if exists bookings_cancellation_message_length_check;

alter table public.bookings
  add constraint bookings_cancellation_message_length_check
  check (
    cancellation_message is null
    or char_length(cancellation_message) <= 500
  );

create index if not exists bookings_cancellation_pending_idx
  on public.bookings (status, cancellation_requested_at desc)
  where cancellation_requested_by is not null
    and cancelled_at is null
    and status = 'approved';

comment on column public.bookings.cancellation_requested_by is
  'auth.users id of the participant who requested cancellation. Role is stored separately and must not be inferred from display names.';
comment on column public.bookings.cancellation_requested_role is
  'Stable role of the original requester: parent or sitter.';
comment on column public.bookings.cancellation_message is
  'Optional plain-text explanation from the requester. HTML is stripped. Max 500 chars.';
comment on column public.bookings.cancelled_by is
  'Original requester identity copied at approval time so history stays accurate.';

create or replace function public.anynanny_sanitize_cancellation_message(p_message text)
returns text
language plpgsql
immutable
as $$
declare
  v_clean text;
begin
  if p_message is null then
    return null;
  end if;

  v_clean := regexp_replace(p_message, '<[^>]*>', '', 'g');
  v_clean := regexp_replace(v_clean, E'[\\n\\r\\t]+', ' ', 'g');
  v_clean := btrim(v_clean);

  if v_clean = '' then
    return null;
  end if;

  return left(v_clean, 500);
end;
$$;

create or replace function public.request_booking_cancellation(
  p_booking_id uuid,
  p_message text default null
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
  v_other_id uuid;
  v_requester_name text;
  v_date_label text;
  v_time_label text;
  v_clean_message text;
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

  if v_uid = v_booking.parent_id then
    v_role := 'parent';
    v_other_id := v_booking.sitter_id;
  elsif v_uid = v_booking.sitter_id then
    v_role := 'sitter';
    v_other_id := v_booking.parent_id;
  else
    raise exception 'not authorized for booking %', p_booking_id using errcode = '42501';
  end if;

  if v_booking.status = 'cancelled' then
    return jsonb_build_object(
      'ok', true,
      'state', 'already_cancelled',
      'booking_id', v_booking.id,
      'status', v_booking.status,
      'cancellation_requested_by', v_booking.cancellation_requested_by,
      'cancellation_requested_role', v_booking.cancellation_requested_role,
      'cancellation_requested_at', v_booking.cancellation_requested_at,
      'cancellation_message', v_booking.cancellation_message,
      'cancelled_by', v_booking.cancelled_by,
      'cancelled_at', v_booking.cancelled_at
    );
  end if;

  if v_booking.status <> 'approved' then
    raise exception 'shift is not cancellable' using errcode = 'P0001';
  end if;

  if coalesce(v_booking.payment_status, 'unpaid') = 'paid' then
    raise exception 'shift is not cancellable' using errcode = 'P0001';
  end if;

  if v_booking.cancellation_requested_by is not null
     and v_booking.cancelled_at is null then
    if v_booking.cancellation_requested_by = v_uid then
      return jsonb_build_object(
        'ok', true,
        'state', 'already_pending',
        'booking_id', v_booking.id,
        'status', v_booking.status,
        'cancellation_requested_by', v_booking.cancellation_requested_by,
        'cancellation_requested_role', v_booking.cancellation_requested_role,
        'cancellation_requested_at', v_booking.cancellation_requested_at,
        'cancellation_message', v_booking.cancellation_message
      );
    end if;

    return jsonb_build_object(
      'ok', true,
      'state', 'pending_from_other',
      'booking_id', v_booking.id,
      'status', v_booking.status,
      'cancellation_requested_by', v_booking.cancellation_requested_by,
      'cancellation_requested_role', v_booking.cancellation_requested_role,
      'cancellation_requested_at', v_booking.cancellation_requested_at,
      'cancellation_message', v_booking.cancellation_message
    );
  end if;

  v_clean_message := public.anynanny_sanitize_cancellation_message(p_message);

  update public.bookings
     set cancellation_requested_by = v_uid,
         cancellation_requested_role = v_role,
         cancellation_requested_at = now(),
         cancellation_message = v_clean_message,
         updated_at = now()
   where id = v_booking.id
  returning * into v_booking;

  select coalesce(nullif(btrim(p.first_name), ''), case when v_role = 'parent' then 'ההורה' else 'הנני' end)
    into v_requester_name
    from public.profiles p
   where p.id = v_uid;

  if v_requester_name is null or btrim(v_requester_name) = '' then
    v_requester_name := case when v_role = 'parent' then 'ההורה' else 'הנני' end;
  end if;

  v_date_label := to_char(v_booking.booking_date, 'DD/MM/YYYY');
  v_time_label := to_char(timezone('Asia/Jerusalem', v_booking.start_time), 'HH24:MI');

  begin
    insert into public.notifications (user_id, kind, title, body, payload)
    values (
      v_other_id,
      'booking_cancellation_requested',
      'בקשת ביטול משמרת',
      format('%s ביקש/ה לבטל את המשמרת ב־%s בשעה %s.', v_requester_name, v_date_label, v_time_label),
      jsonb_build_object(
        'booking_id', v_booking.id,
        'requested_by', v_uid,
        'requested_role', v_role,
        'booking_date', v_booking.booking_date,
        'start_time', v_booking.start_time,
        'end_time', v_booking.end_time
      )
    );
  exception
    when undefined_table then
      null;
  end;

  return jsonb_build_object(
    'ok', true,
    'state', 'requested',
    'booking_id', v_booking.id,
    'status', v_booking.status,
    'cancellation_requested_by', v_booking.cancellation_requested_by,
    'cancellation_requested_role', v_booking.cancellation_requested_role,
    'cancellation_requested_at', v_booking.cancellation_requested_at,
    'cancellation_message', v_booking.cancellation_message
  );
end;
$$;

create or replace function public.approve_booking_cancellation(p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_booking public.bookings%rowtype;
  v_approver_role text;
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

  if v_uid = v_booking.parent_id then
    v_approver_role := 'parent';
  elsif v_uid = v_booking.sitter_id then
    v_approver_role := 'sitter';
  else
    raise exception 'not authorized for booking %', p_booking_id using errcode = '42501';
  end if;

  if v_booking.status = 'cancelled' then
    return jsonb_build_object(
      'ok', true,
      'state', 'already_cancelled',
      'booking_id', v_booking.id,
      'status', v_booking.status,
      'cancellation_requested_by', v_booking.cancellation_requested_by,
      'cancellation_requested_role', v_booking.cancellation_requested_role,
      'cancellation_message', v_booking.cancellation_message,
      'cancellation_approved_by', v_booking.cancellation_approved_by,
      'cancellation_approved_at', v_booking.cancellation_approved_at,
      'cancelled_by', v_booking.cancelled_by,
      'cancelled_at', v_booking.cancelled_at
    );
  end if;

  if v_booking.cancellation_requested_by is null or v_booking.cancelled_at is not null then
    raise exception 'no pending cancellation request' using errcode = 'P0001';
  end if;

  if v_booking.cancellation_requested_by = v_uid then
    raise exception 'cannot approve own cancellation request' using errcode = '42501';
  end if;

  if v_booking.status <> 'approved' then
    raise exception 'shift is no longer cancellable' using errcode = 'P0001';
  end if;

  if coalesce(v_booking.payment_status, 'unpaid') = 'paid' then
    raise exception 'shift is no longer cancellable' using errcode = 'P0001';
  end if;

  update public.bookings
     set status = 'cancelled',
         cancellation_approved_by = v_uid,
         cancellation_approved_at = now(),
         cancelled_by = v_booking.cancellation_requested_by,
         cancelled_at = now(),
         updated_at = now()
   where id = v_booking.id
  returning * into v_booking;

  begin
    update public.sessions
       set status = 'cancelled'
     where coalesce(booking_id, id) = v_booking.id
       and status in (
         'pending_sitter_approval',
         'pending',
         'pending_confirmation',
         'active'
       );
  exception
    when undefined_table then
      null;
    when undefined_column then
      update public.sessions
         set status = 'cancelled'
       where parent_id = v_booking.parent_id
         and sitter_id = v_booking.sitter_id
         and status in (
           'pending_sitter_approval',
           'pending',
           'pending_confirmation',
           'active'
         );
  end;

  begin
    insert into public.notifications (user_id, kind, title, body, payload)
    values (
      v_booking.cancellation_requested_by,
      'booking_cancellation_approved',
      'ביטול המשמרת אושר',
      'ביטול המשמרת אושר.',
      jsonb_build_object(
        'booking_id', v_booking.id,
        'approved_by', v_uid,
        'approved_role', v_approver_role,
        'cancelled_by', v_booking.cancelled_by,
        'cancelled_role', v_booking.cancellation_requested_role,
        'booking_date', v_booking.booking_date,
        'start_time', v_booking.start_time,
        'end_time', v_booking.end_time
      )
    );
  exception
    when undefined_table then
      null;
  end;

  return jsonb_build_object(
    'ok', true,
    'state', 'cancelled',
    'booking_id', v_booking.id,
    'status', v_booking.status,
    'cancellation_requested_by', v_booking.cancellation_requested_by,
    'cancellation_requested_role', v_booking.cancellation_requested_role,
    'cancellation_message', v_booking.cancellation_message,
    'cancellation_approved_by', v_booking.cancellation_approved_by,
    'cancellation_approved_at', v_booking.cancellation_approved_at,
    'cancelled_by', v_booking.cancelled_by,
    'cancelled_at', v_booking.cancelled_at
  );
end;
$$;

revoke all on function public.anynanny_sanitize_cancellation_message(text) from public;
grant execute on function public.anynanny_sanitize_cancellation_message(text) to authenticated;

revoke all on function public.request_booking_cancellation(uuid, text) from public;
grant execute on function public.request_booking_cancellation(uuid, text) to authenticated;

revoke all on function public.approve_booking_cancellation(uuid) from public;
grant execute on function public.approve_booking_cancellation(uuid) to authenticated;

notify pgrst, 'reload schema';
