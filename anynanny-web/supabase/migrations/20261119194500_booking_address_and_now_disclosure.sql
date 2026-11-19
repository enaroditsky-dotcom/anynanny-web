-- Ordinary booking street address is returned only to the assigned sitter,
-- and only after approval. AnyNanny NOW location_label stays on the alert,
-- but only the parent and an eligible candidate sitter can read the row.
--
-- Reversible:
--   drop function if exists public.sitter_assigned_booking_parent_contacts(uuid[]);
--   drop policy if exists "broadcast_alerts_select_owner_or_eligible_sitter"
--     on public.broadcast_alerts;
--   create policy "Users can view all active alerts"
--     on public.broadcast_alerts for select to authenticated
--     with the previous open predicate for authenticated users.
--
-- Not applied by this change. Apply only with an explicit database release.

create or replace function public.sitter_assigned_booking_parent_contacts(p_booking_ids uuid[])
returns table (
  booking_id uuid,
  parent_id uuid,
  first_name text,
  last_name text,
  avatar_url text,
  identity_verified boolean,
  address_line text,
  address_visible boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    b.id as booking_id,
    b.parent_id,
    p.first_name,
    p.last_name,
    nullif(btrim(coalesce(p.avatar_url, '')), '') as avatar_url,
    (p.identity_verification_status = 'verified') as identity_verified,
    case
      when lower(btrim(coalesce(b.status, ''))) in (
        'approved',
        'sitter_started',
        'parent_started',
        'sitter_ended',
        'completed'
      )
      then nullif(
        concat_ws(
          ', ',
          nullif(
            concat_ws(
              ' ',
              nullif(btrim(coalesce(p.address ->> 'street', p.address ->> 'streetName', p.address ->> 'street_name', '')), ''),
              nullif(btrim(coalesce(p.address ->> 'houseNumber', p.address ->> 'house_number', p.address ->> 'number', p.address ->> 'house', '')), '')
            ),
            ''
          ),
          nullif(btrim(coalesce(p.address ->> 'city', p.address ->> 'cityName', p.address ->> 'city_name', '')), '')
        ),
        ''
      )
      else null
    end as address_line,
    lower(btrim(coalesce(b.status, ''))) in (
      'approved',
      'sitter_started',
      'parent_started',
      'sitter_ended',
      'completed'
    ) as address_visible
  from public.bookings b
  join public.profiles p on p.id = b.parent_id
  where auth.uid() is not null
    and b.sitter_id = auth.uid()
    and b.id = any (coalesce(p_booking_ids, '{}'::uuid[]));
$$;

comment on function public.sitter_assigned_booking_parent_contacts(uuid[]) is
  'Assigned sitter only. Name for that booking. Street, house number and city only after approval. No medical fields, phone, or identity number.';

revoke all on function public.sitter_assigned_booking_parent_contacts(uuid[]) from public;
revoke all on function public.sitter_assigned_booking_parent_contacts(uuid[]) from anon;
grant execute on function public.sitter_assigned_booking_parent_contacts(uuid[]) to authenticated;

-- Signed-in users cannot execute sitter_is_eligible_for_now_broadcast.
-- The SELECT policy calls this wrapper instead. The sitter id is auth.uid().
-- A direct call returns only whether the caller may read that alert id.
-- Missing, inactive, and unauthorized alerts all return false.
create or replace function public.current_user_may_read_broadcast_alert(p_alert_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    auth.uid() is not null
    and p_alert_id is not null
    and exists (
      select 1
      from public.broadcast_alerts as alert
      where alert.id = p_alert_id
        and (
          alert.parent_id = auth.uid()
          or (
            pg_catalog.lower(pg_catalog.btrim(COALESCE(alert.status, ''::text))) = 'active'
            and public.sitter_is_eligible_for_now_broadcast(
              auth.uid(),
              alert.parent_id,
              alert.city,
              COALESCE(alert.favorites_only, false),
              COALESCE(alert.verified_sitters_only, false)
            )
          )
        )
    );
$$;

comment on function public.current_user_may_read_broadcast_alert(uuid) is
  'True when auth.uid() owns the alert or is eligible for that active alert. No caller-supplied sitter id. False when missing or unauthorized.';

revoke all on function public.current_user_may_read_broadcast_alert(uuid) from public;
revoke all on function public.current_user_may_read_broadcast_alert(uuid) from anon;
revoke all on function public.current_user_may_read_broadcast_alert(uuid) from authenticated;
revoke all on function public.current_user_may_read_broadcast_alert(uuid) from service_role;
grant execute on function public.current_user_may_read_broadcast_alert(uuid) to authenticated;

revoke all on function public.sitter_is_eligible_for_now_broadcast(uuid, uuid, text, boolean, boolean) from public;
revoke all on function public.sitter_is_eligible_for_now_broadcast(uuid, uuid, text, boolean, boolean) from anon;
revoke all on function public.sitter_is_eligible_for_now_broadcast(uuid, uuid, text, boolean, boolean) from authenticated;

drop policy if exists "Users can insert their own alerts" on public.broadcast_alerts;
drop policy if exists "broadcast_alerts_insert_own" on public.broadcast_alerts;
create policy "broadcast_alerts_insert_own"
  on public.broadcast_alerts
  for insert
  to authenticated
  with check (auth.uid() = parent_id);

drop policy if exists "Users can view all active alerts" on public.broadcast_alerts;

drop policy if exists "broadcast_alerts_select_owner_or_eligible_sitter" on public.broadcast_alerts;
create policy "broadcast_alerts_select_owner_or_eligible_sitter"
  on public.broadcast_alerts
  for select
  to authenticated
  using (public.current_user_may_read_broadcast_alert(id));
