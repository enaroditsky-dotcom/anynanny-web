-- PUSH-2: Web Push subscriptions + per-user notification preferences.
-- Does not send Web Push by itself. Delivery is a secret Vercel webhook
-- that reads canonical public.notifications rows.
--
-- DO NOT apply until reviewed.
--
-- Delivery is NOT performed in SQL. After this migration, configure a Supabase
-- Database Webhook (Dashboard → Database → Webhooks):
--   Table: public.notifications
--   Events: INSERT
--   POST https://<production-host>/api/push/deliver
--   HTTP Header: Authorization = Bearer <PUSH_WEBHOOK_SECRET>
--   or x-anynanny-push-secret = <PUSH_WEBHOOK_SECRET>
-- The Vercel route reloads the canonical row and sends Web Push. Clients cannot
-- invoke it with a user JWT.

-- ---------------------------------------------------------------------------
-- 1. Preference columns on profiles (canonical per-user settings)
--    Defaults ON. Existing rows get true. Preference is not OS permission.
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists push_enabled boolean not null default true;

alter table public.profiles
  add column if not exists sound_enabled boolean not null default true;

comment on column public.profiles.push_enabled is
  'User preference allowing Web Push. Does not imply Notification.permission or a PushSubscription.';

comment on column public.profiles.sound_enabled is
  'In-app sounds/haptics while AnyNanny is open. Does not control OS lock-screen notification sound.';

-- ---------------------------------------------------------------------------
-- 2. Device push subscriptions
-- ---------------------------------------------------------------------------
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz
);

comment on table public.push_subscriptions is
  'Web Push subscriptions. One endpoint per device. Recipients are user_id; clients may only manage their own rows.';

create unique index if not exists push_subscriptions_endpoint_uidx
  on public.push_subscriptions (endpoint);

create index if not exists push_subscriptions_user_id_idx
  on public.push_subscriptions (user_id);

create or replace function public.push_subscriptions_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists push_subscriptions_touch_updated_at on public.push_subscriptions;
create trigger push_subscriptions_touch_updated_at
  before update on public.push_subscriptions
  for each row
  execute function public.push_subscriptions_touch_updated_at();

alter table public.push_subscriptions enable row level security;

drop policy if exists push_subscriptions_select_own on public.push_subscriptions;
create policy push_subscriptions_select_own
  on public.push_subscriptions
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists push_subscriptions_insert_own on public.push_subscriptions;
create policy push_subscriptions_insert_own
  on public.push_subscriptions
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists push_subscriptions_update_own on public.push_subscriptions;
create policy push_subscriptions_update_own
  on public.push_subscriptions
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists push_subscriptions_delete_own on public.push_subscriptions;
create policy push_subscriptions_delete_own
  on public.push_subscriptions
  for delete
  to authenticated
  using (user_id = auth.uid());

revoke all on table public.push_subscriptions from public;
revoke all on table public.push_subscriptions from anon;
grant select, insert, update, delete on table public.push_subscriptions to authenticated;

-- Claim/rotate an endpoint onto the current user (same device, account switch).
create or replace function public.upsert_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_endpoint is null or btrim(p_endpoint) = '' then
    raise exception 'invalid_endpoint';
  end if;

  if p_p256dh is null or btrim(p_p256dh) = '' or p_auth is null or btrim(p_auth) = '' then
    raise exception 'invalid_keys';
  end if;

  insert into public.push_subscriptions (
    user_id,
    endpoint,
    p256dh,
    auth,
    user_agent,
    last_seen_at
  )
  values (
    v_uid,
    btrim(p_endpoint),
    btrim(p_p256dh),
    btrim(p_auth),
    nullif(btrim(coalesce(p_user_agent, '')), ''),
    now()
  )
  on conflict (endpoint) do update
    set user_id = v_uid,
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        user_agent = excluded.user_agent,
        last_seen_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.upsert_push_subscription(text, text, text, text) from public;
revoke all on function public.upsert_push_subscription(text, text, text, text) from anon;
grant execute on function public.upsert_push_subscription(text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Idempotent dispatch log — duplicate database webhooks do not re-send
--    Clients have no access. Service role bypasses RLS.
-- ---------------------------------------------------------------------------
create table if not exists public.notification_push_dispatches (
  notification_id uuid primary key references public.notifications (id) on delete cascade,
  dispatched_at timestamptz not null default now()
);

comment on table public.notification_push_dispatches is
  'Exactly-once (best-effort) Web Push dispatch marker keyed by canonical notification id.';

alter table public.notification_push_dispatches enable row level security;

revoke all on table public.notification_push_dispatches from public;
revoke all on table public.notification_push_dispatches from anon;
revoke all on table public.notification_push_dispatches from authenticated;

notify pgrst, 'reload schema';
