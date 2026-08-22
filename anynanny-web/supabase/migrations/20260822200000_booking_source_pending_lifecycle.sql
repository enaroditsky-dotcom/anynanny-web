-- Distinguish scheduled direct requests from AnyNanny NOW / broadcast bookings.
-- Additive only. Does not backfill broadcast history.
-- Does not enable the approval-block trigger.
-- Does not schedule anynanny-pending-booking-lifecycle.

-- ---------------------------------------------------------------------------
-- 1. booking_source
-- ---------------------------------------------------------------------------
alter table public.bookings
  add column if not exists booking_source text not null default 'direct';

alter table public.bookings
  drop constraint if exists bookings_booking_source_check;

alter table public.bookings
  add constraint bookings_booking_source_check
  check (booking_source in ('direct', 'broadcast_now'));

comment on column public.bookings.booking_source is
  'direct = scheduled parent-to-sitter request. broadcast_now = AnyNanny NOW parent select.';

-- ---------------------------------------------------------------------------
-- 2. expire_pending_bookings — direct scheduled requests only
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
       and b.booking_source = 'direct'
       and b.start_time <= now()
     for update skip locked
  loop
    update public.bookings
       set status = 'cancelled',
           cancelled_by = null,
           cancelled_at = now(),
           updated_at = now()
     where id = v_id
       and status = 'pending'
       and booking_source = 'direct';

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
-- 3. notify_pending_no_response_reminders — direct scheduled requests only
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
       and b.booking_source = 'direct'
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
         and live.booking_source = 'direct'
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

-- ---------------------------------------------------------------------------
-- 4. Block pending → approved after start_time for DIRECT only.
--    Replaces function body only. Does not CREATE/ENABLE the trigger.
-- ---------------------------------------------------------------------------
create or replace function public.bookings_block_expired_pending_approval()
returns trigger
language plpgsql
as $$
begin
  if lower(btrim(coalesce(old.status, ''))) = 'pending'
     and lower(btrim(coalesce(new.status, ''))) = 'approved'
     and old.booking_source = 'direct'
     and old.start_time <= now() then
    raise exception 'pending booking has expired' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

revoke all on function public.bookings_block_expired_pending_approval() from public;
revoke all on function public.bookings_block_expired_pending_approval() from anon;
revoke all on function public.bookings_block_expired_pending_approval() from authenticated;

notify pgrst, 'reload schema';
