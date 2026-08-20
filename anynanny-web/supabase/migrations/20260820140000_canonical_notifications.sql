-- Canonical in-app notifications foundation (PUSH-1).
-- Makes public.notifications the durable event log for a later Web Push phase.
-- Does not send Web Push, store subscriptions, or change booking/payment/session authority.
--
-- Self-contained: production may not have public.notifications at all.
-- If the table already exists, this is additive (no DROP TABLE, no data wipe).
--
-- DO NOT apply until reviewed.

-- ---------------------------------------------------------------------------
-- 0. Create public.notifications if missing
-- ---------------------------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  dedupe_key text
);

-- Staging / older installs: keep existing rows and compatible columns.
alter table public.notifications
  add column if not exists dedupe_key text;

comment on table public.notifications is
  'Canonical in-app event log. Writers are SECURITY DEFINER triggers/RPCs; clients may only select own rows and update read_at.';

comment on column public.notifications.dedupe_key is
  'Idempotency key within (user_id, kind). Typically a booking/message/alert/session id.';

-- ---------------------------------------------------------------------------
-- 1. Indexes
-- ---------------------------------------------------------------------------
create unique index if not exists notifications_user_kind_dedupe_uidx
  on public.notifications (user_id, kind, dedupe_key)
  where dedupe_key is not null;

create index if not exists notifications_user_unread_idx
  on public.notifications (user_id, created_at desc)
  where read_at is null;

-- ---------------------------------------------------------------------------
-- 1b. Realtime — sitter dashboard INSERT toast
-- ---------------------------------------------------------------------------
alter table if exists public.notifications replica identity full;

do $$
begin
  if to_regclass('public.notifications') is not null
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'notifications'
     ) then
    execute 'alter publication supabase_realtime add table public.notifications';
  end if;
exception
  when undefined_object then null;
  when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Helper: insert-or-ignore (triggers / security definer writers only)
-- ---------------------------------------------------------------------------
create or replace function public.create_canonical_notification(
  p_user_id uuid,
  p_kind text,
  p_title text,
  p_body text,
  p_payload jsonb,
  p_dedupe_key text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_key text := nullif(btrim(coalesce(p_dedupe_key, '')), '');
begin
  if p_user_id is null or p_kind is null or btrim(p_kind) = '' then
    return null;
  end if;

  insert into public.notifications (
    user_id,
    kind,
    title,
    body,
    payload,
    dedupe_key
  )
  values (
    p_user_id,
    p_kind,
    coalesce(nullif(btrim(p_title), ''), 'AnyNanny'),
    coalesce(p_body, ''),
    coalesce(p_payload, '{}'::jsonb),
    v_key
  )
  on conflict (user_id, kind, dedupe_key) where dedupe_key is not null
  do nothing
  returning id into v_id;

  return v_id;
exception
  when unique_violation then
    return null;
end;
$$;

revoke all on function public.create_canonical_notification(uuid, text, text, text, jsonb, text) from public;
revoke all on function public.create_canonical_notification(uuid, text, text, text, jsonb, text) from anon;
revoke all on function public.create_canonical_notification(uuid, text, text, text, jsonb, text) from authenticated;

-- Stamp dedupe_key for legacy writers that omit it (cancellation RPCs, older booking_request).
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
    else new.dedupe_key
  end;

  if new.dedupe_key is not null and btrim(new.dedupe_key) = '' then
    new.dedupe_key := null;
  end if;

  return new;
end;
$$;

drop trigger if exists notifications_assign_dedupe_key on public.notifications;
create trigger notifications_assign_dedupe_key
  before insert on public.notifications
  for each row
  execute function public.notifications_assign_dedupe_key();

revoke all on function public.notifications_assign_dedupe_key() from public;
revoke all on function public.notifications_assign_dedupe_key() from anon;
revoke all on function public.notifications_assign_dedupe_key() from authenticated;

-- ---------------------------------------------------------------------------
-- 3. booking_request — preserve single existing trigger, add dedupe + pending guard
-- ---------------------------------------------------------------------------
create or replace function public.notify_booking_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.sitter_id is null then
    return new;
  end if;

  if new.parent_id is not null and new.sitter_id = new.parent_id then
    return new;
  end if;

  if lower(coalesce(new.status, '')) is distinct from 'pending' then
    return new;
  end if;

  perform public.create_canonical_notification(
    new.sitter_id,
    'booking_request',
    'בקשת תיאום משמרת',
    'הורה שלח בקשה לתיאום משמרת',
    jsonb_build_object(
      'booking_id', new.id,
      'parent_id', new.parent_id,
      'booking_date', new.booking_date,
      'start_time', new.start_time,
      'end_time', new.end_time,
      'status', new.status
    ),
    new.id::text
  );

  return new;
end;
$$;

drop trigger if exists bookings_notify_sitter on public.bookings;
create trigger bookings_notify_sitter
  after insert on public.bookings
  for each row
  execute function public.notify_booking_insert();

-- ---------------------------------------------------------------------------
-- 4. booking_approved / booking_rejected — parent only, pending → approved|rejected
-- ---------------------------------------------------------------------------
create or replace function public.notify_booking_status_response()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old text := lower(btrim(coalesce(old.status::text, '')));
  v_new text := lower(btrim(coalesce(new.status::text, '')));
  v_kind text;
  v_title text;
  v_body text;
begin
  if new.parent_id is null then
    return new;
  end if;

  if v_old is not distinct from v_new then
    return new;
  end if;

  if v_old is distinct from 'pending' then
    return new;
  end if;

  if v_new = 'approved' then
    v_kind := 'booking_approved';
    v_title := 'המשמרת אושרה';
    v_body := 'הבייביסיטר אישר/ה את בקשת המשמרת';
  elsif v_new = 'rejected' then
    v_kind := 'booking_rejected';
    v_body := 'הבייביסיטר דחה/תה את בקשת המשמרת';
    v_title := 'הבקשה נדחתה';
  else
    return new;
  end if;

  perform public.create_canonical_notification(
    new.parent_id,
    v_kind,
    v_title,
    v_body,
    jsonb_build_object(
      'booking_id', new.id,
      'sitter_id', new.sitter_id,
      'booking_date', new.booking_date,
      'start_time', new.start_time,
      'end_time', new.end_time,
      'status', new.status
    ),
    new.id::text
  );

  -- Acting on the request is the meaningful read for the sitter's booking_request row.
  update public.notifications
     set read_at = coalesce(read_at, now())
   where user_id = new.sitter_id
     and kind = 'booking_request'
     and read_at is null
     and (
       dedupe_key = new.id::text
       or payload->>'booking_id' = new.id::text
     );

  return new;
end;
$$;

drop trigger if exists bookings_notify_parent_response on public.bookings;
create trigger bookings_notify_parent_response
  after update of status on public.bookings
  for each row
  execute function public.notify_booking_status_response();

revoke all on function public.notify_booking_status_response() from public;
revoke all on function public.notify_booking_status_response() from anon;
revoke all on function public.notify_booking_status_response() from authenticated;

-- ---------------------------------------------------------------------------
-- 5. chat_message — LIVE public.messages (not legacy chat_messages)
-- ---------------------------------------------------------------------------
create or replace function public.notify_live_chat_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent uuid;
  v_sitter uuid;
  v_recipient uuid;
  v_preview text;
begin
  select b.parent_id, b.sitter_id
    into v_parent, v_sitter
    from public.bookings b
   where b.id = new.booking_id;

  if not found then
    return new;
  end if;

  if new.sender_id = v_parent then
    v_recipient := v_sitter;
  elsif new.sender_id = v_sitter then
    v_recipient := v_parent;
  else
    return new;
  end if;

  if v_recipient is null or v_recipient = new.sender_id then
    return new;
  end if;

  v_preview := left(btrim(coalesce(new.content, '')), 80);
  if length(btrim(coalesce(new.content, ''))) > 80 then
    v_preview := v_preview || '…';
  end if;

  perform public.create_canonical_notification(
    v_recipient,
    'chat_message',
    'הודעה חדשה',
    v_preview,
    jsonb_build_object(
      'booking_id', new.booking_id,
      'message_id', new.id,
      'sender_id', new.sender_id
    ),
    new.id::text
  );

  return new;
end;
$$;

drop trigger if exists messages_notify_recipient on public.messages;
create trigger messages_notify_recipient
  after insert on public.messages
  for each row
  execute function public.notify_live_chat_message();

revoke all on function public.notify_live_chat_message() from public;
revoke all on function public.notify_live_chat_message() from anon;
revoke all on function public.notify_live_chat_message() from authenticated;

-- ---------------------------------------------------------------------------
-- 6. broadcast_alert — sitters whose working_cities contain the alert city
-- ---------------------------------------------------------------------------
create or replace function public.notify_broadcast_alert_recipients()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_city text := nullif(btrim(coalesce(new.city, '')), '');
begin
  if v_city is null then
    return new;
  end if;

  if lower(coalesce(new.status, '')) is distinct from 'active' then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and lower(coalesce(old.status, '')) = 'active' then
    return new;
  end if;

  insert into public.notifications (
    user_id,
    kind,
    title,
    body,
    payload,
    dedupe_key
  )
  select
    sp.id,
    'broadcast_alert',
    'AnyNanny Now',
    'שידור דחוף באזור השירות שלך',
    jsonb_build_object(
      'broadcast_id', new.id,
      'alert_id', new.id,
      'city', v_city,
      'service_type', new.service_type
    ),
    new.id::text
  from public.sitter_profiles sp
  where coalesce(sp.working_cities, '{}'::text[]) @> array[v_city]::text[]
    and (new.parent_id is null or sp.id is distinct from new.parent_id)
  on conflict (user_id, kind, dedupe_key) where dedupe_key is not null
  do nothing;

  return new;
end;
$$;

drop trigger if exists broadcast_alerts_notify_recipients on public.broadcast_alerts;
create trigger broadcast_alerts_notify_recipients
  after insert or update of status on public.broadcast_alerts
  for each row
  execute function public.notify_broadcast_alert_recipients();

revoke all on function public.notify_broadcast_alert_recipients() from public;
revoke all on function public.notify_broadcast_alert_recipients() from anon;
revoke all on function public.notify_broadcast_alert_recipients() from authenticated;

-- ---------------------------------------------------------------------------
-- 7. payment_required — session status becomes payment_pending exactly once
-- ---------------------------------------------------------------------------
create or replace function public.notify_session_payment_required()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old text := lower(btrim(coalesce(old.status, '')));
  v_new text := lower(btrim(coalesce(new.status, '')));
  v_booking_id uuid := new.booking_id;
begin
  if new.parent_id is null then
    return new;
  end if;

  if v_new is distinct from 'payment_pending' then
    return new;
  end if;

  if v_old is not distinct from v_new then
    return new;
  end if;

  perform public.create_canonical_notification(
    new.parent_id,
    'payment_required',
    'נדרש תשלום',
    'המשמרת הסתיימה. נדרש תשלום מאובטח.',
    jsonb_strip_nulls(
      jsonb_build_object(
        'session_id', new.id,
        'booking_id', v_booking_id
      )
    ),
    new.id::text
  );

  return new;
end;
$$;

drop trigger if exists sessions_notify_payment_required on public.sessions;
create trigger sessions_notify_payment_required
  after update of status on public.sessions
  for each row
  execute function public.notify_session_payment_required();

revoke all on function public.notify_session_payment_required() from public;
revoke all on function public.notify_session_payment_required() from anon;
revoke all on function public.notify_session_payment_required() from authenticated;

-- ---------------------------------------------------------------------------
-- 7b. payment_received — bookings.payment_status becomes paid exactly once
--     Complements (does not replace) notifySitterPaymentReceived(); unique dedupe_key.
-- ---------------------------------------------------------------------------
create or replace function public.notify_booking_payment_received()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old text := lower(btrim(coalesce(old.payment_status, '')));
  v_new text := lower(btrim(coalesce(new.payment_status, '')));
begin
  if new.sitter_id is null then
    return new;
  end if;

  if v_new is distinct from 'paid' then
    return new;
  end if;

  if v_old is not distinct from v_new then
    return new;
  end if;

  perform public.create_canonical_notification(
    new.sitter_id,
    'payment_received',
    'תשלום התקבל',
    'התקבל תשלום מאובטח. הפרטים עודכנו ב«הארנק שלי».',
    jsonb_build_object(
      'booking_id', new.id,
      'gateway', 'hyp'
    ),
    new.id::text
  );

  return new;
end;
$$;

drop trigger if exists bookings_notify_payment_received on public.bookings;
create trigger bookings_notify_payment_received
  after update of payment_status on public.bookings
  for each row
  execute function public.notify_booking_payment_received();

revoke all on function public.notify_booking_payment_received() from public;
revoke all on function public.notify_booking_payment_received() from anon;
revoke all on function public.notify_booking_payment_received() from authenticated;

-- ---------------------------------------------------------------------------
-- 8. RLS / grants — own rows only; read_at is the only client-writable column
-- ---------------------------------------------------------------------------
alter table public.notifications enable row level security;

drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists notifications_insert_own on public.notifications;
drop policy if exists notifications_insert_authenticated on public.notifications;
drop policy if exists notifications_delete_own on public.notifications;

revoke insert, delete, update on table public.notifications from public;
revoke insert, delete, update on table public.notifications from anon;
revoke insert, delete, update on table public.notifications from authenticated;

grant select on table public.notifications to authenticated;
grant update (read_at) on table public.notifications to authenticated;

notify pgrst, 'reload schema';
