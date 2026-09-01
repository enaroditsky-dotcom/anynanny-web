-- Phase 1a: hybrid manual payment lifecycle (schema + server RPCs only).
-- Additive and backward-compatible. Does not rewrite historical paid rows.
-- Does not replace finalize_verified_hyp_payment or HYP checkout.
-- Does not credit wallets or change Double-Shake / missed-shift / cancellation.

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------
alter table public.bookings
  add column if not exists payment_method text;

alter table public.bookings
  add column if not exists payment_rail text;

alter table public.bookings
  add column if not exists parent_reported_paid_at timestamptz;

alter table public.bookings
  add column if not exists sitter_confirmed_received_at timestamptz;

alter table public.bookings
  add column if not exists payment_dispute_at timestamptz;

alter table public.bookings
  add column if not exists parent_resolved_reported_at timestamptz;

comment on column public.bookings.payment_method is
  'Internal rail: cash | bit | paybox | credit_card | apple_pay | google_pay. UI labels are Hebrew.';

comment on column public.bookings.payment_rail is
  'manual = parent report + sitter confirm. processor = HYP/Grow captured charge.';

comment on column public.bookings.parent_reported_paid_at is
  'Parent pressed שילמתי / הסדרתי. Does not mark paid.';

comment on column public.bookings.sitter_confirmed_received_at is
  'Sitter pressed כן, קיבלתי. Payment stays awaiting_sitter_rating until sitter rates.';

comment on column public.bookings.payment_dispute_at is
  'Sitter pressed לא קיבלתי. Blocks new paid obligations for the parent.';

comment on column public.bookings.parent_resolved_reported_at is
  'Parent pressed הסדרתי את התשלום while in payment_dispute.';

alter table public.bookings
  drop constraint if exists bookings_payment_method_check;

alter table public.bookings
  add constraint bookings_payment_method_check
  check (
    payment_method is null
    or payment_method in (
      'cash',
      'bit',
      'paybox',
      'credit_card',
      'apple_pay',
      'google_pay'
    )
  );

alter table public.bookings
  drop constraint if exists bookings_payment_rail_check;

alter table public.bookings
  add constraint bookings_payment_rail_check
  check (
    payment_rail is null
    or payment_rail in ('manual', 'processor')
  );

-- ---------------------------------------------------------------------------
-- 2. Widen payment_status. Keep unpaid / pending_checkout / paid.
-- ---------------------------------------------------------------------------
alter table public.bookings
  drop constraint if exists bookings_payment_status_check;

alter table public.bookings
  add constraint bookings_payment_status_check
  check (
    payment_status in (
      'unpaid',
      'pending_checkout',
      'paid',
      'awaiting_sitter_confirmation',
      'payment_dispute',
      'awaiting_sitter_rating'
    )
  );

create index if not exists bookings_parent_payment_dispute_idx
  on public.bookings (parent_id)
  where payment_status = 'payment_dispute';

-- ---------------------------------------------------------------------------
-- 3. Dispute helper — used by insert/approve policies and RPCs
-- ---------------------------------------------------------------------------
create or replace function public.parent_has_unresolved_payment_dispute(p_parent_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_parent_id is not null
    and exists (
      select 1
      from public.bookings b
      where b.parent_id = p_parent_id
        and b.payment_status = 'payment_dispute'
    );
$$;

comment on function public.parent_has_unresolved_payment_dispute(uuid) is
  'True when the parent has any booking in payment_dispute. Soft booking freeze only.';

revoke all on function public.parent_has_unresolved_payment_dispute(uuid) from public;
revoke all on function public.parent_has_unresolved_payment_dispute(uuid) from anon;
grant execute on function public.parent_has_unresolved_payment_dispute(uuid) to authenticated;
grant execute on function public.parent_has_unresolved_payment_dispute(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 4. Block NEW paid obligations while a dispute exists
-- ---------------------------------------------------------------------------
create or replace function public.bookings_block_new_obligation_during_payment_dispute()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if public.parent_has_unresolved_payment_dispute(new.parent_id) then
      raise exception 'קיים תשלום שטרם אושר. יש להסדיר אותו לפני הזמנה חדשה.'
        using errcode = 'P0001';
    end if;
    return new;
  end if;

  if lower(btrim(coalesce(old.status, ''))) is distinct from 'approved'
     and lower(btrim(coalesce(new.status, ''))) = 'approved'
     and public.parent_has_unresolved_payment_dispute(new.parent_id)
  then
    raise exception 'קיים תשלום שטרם אושר. יש להסדיר אותו לפני הזמנה חדשה.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists bookings_block_new_obligation_during_payment_dispute on public.bookings;
create trigger bookings_block_new_obligation_during_payment_dispute
  before insert or update of status on public.bookings
  for each row
  execute function public.bookings_block_new_obligation_during_payment_dispute();

revoke all on function public.bookings_block_new_obligation_during_payment_dispute() from public;
revoke all on function public.bookings_block_new_obligation_during_payment_dispute() from anon;
revoke all on function public.bookings_block_new_obligation_during_payment_dispute() from authenticated;

drop policy if exists bookings_insert_parent on public.bookings;
create policy bookings_insert_parent on public.bookings
  for insert to authenticated
  with check (
    parent_id = auth.uid()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'parent'
    )
    and public.is_public_sitter(sitter_id)
    and not public.is_account_suspended(auth.uid())
    and not public.is_account_suspended(sitter_id)
    and not public.is_blocked_pair(parent_id, sitter_id)
    and not public.parent_has_unresolved_payment_dispute(auth.uid())
  );

drop policy if exists bookings_update_sitter on public.bookings;
create policy bookings_update_sitter on public.bookings
  for update to authenticated
  using (sitter_id = auth.uid())
  with check (
    sitter_id = auth.uid()
    and (
      lower(btrim(coalesce(status, ''))) is distinct from 'approved'
      or (
        not public.is_account_suspended(auth.uid())
        and not public.is_account_suspended(parent_id)
        and not public.is_blocked_pair(parent_id, sitter_id)
        and not public.parent_has_unresolved_payment_dispute(parent_id)
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 5. Prevent authenticated clients from forging payment lifecycle writes.
--    SECURITY INVOKER so current_user is authenticated for PostgREST updates
--    and the function owner inside SECURITY DEFINER RPCs (including HYP finalize).
--    Allowed client write: parent unpaid → pending_checkout (existing HYP checkout).
-- ---------------------------------------------------------------------------
create or replace function public.bookings_protect_payment_lifecycle_columns()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_from text := lower(btrim(coalesce(old.payment_status, 'unpaid')));
  v_to text := lower(btrim(coalesce(new.payment_status, 'unpaid')));
begin
  if current_user is distinct from 'authenticated'
     and current_user is distinct from 'anon'
  then
    return new;
  end if;

  if v_from is distinct from v_to then
    if v_from = 'unpaid'
       and v_to = 'pending_checkout'
       and new.parent_id is not distinct from auth.uid()
    then
      null;
    else
      raise exception 'payment status cannot be changed directly'
        using errcode = '42501';
    end if;
  end if;

  if new.paid_at is distinct from old.paid_at
     or new.payment_method is distinct from old.payment_method
     or new.payment_rail is distinct from old.payment_rail
     or new.parent_reported_paid_at is distinct from old.parent_reported_paid_at
     or new.sitter_confirmed_received_at is distinct from old.sitter_confirmed_received_at
     or new.payment_dispute_at is distinct from old.payment_dispute_at
     or new.parent_resolved_reported_at is distinct from old.parent_resolved_reported_at
     or new.hyp_trans_id is distinct from old.hyp_trans_id
     or new.charged_amount_nis is distinct from old.charged_amount_nis
  then
    raise exception 'payment fields cannot be changed directly'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists bookings_protect_payment_lifecycle_columns on public.bookings;
create trigger bookings_protect_payment_lifecycle_columns
  before update on public.bookings
  for each row
  execute function public.bookings_protect_payment_lifecycle_columns();

revoke all on function public.bookings_protect_payment_lifecycle_columns() from public;
revoke all on function public.bookings_protect_payment_lifecycle_columns() from anon;
revoke all on function public.bookings_protect_payment_lifecycle_columns() from authenticated;

-- ---------------------------------------------------------------------------
-- 6. Shared helpers for manual RPCs
-- ---------------------------------------------------------------------------
create or replace function public.manual_payment_booking_has_parent_rating(p_booking public.bookings)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.sessions s
    join public.ratings r on r.session_id = s.id
    where s.booking_id = p_booking.id
      and r.from_user_id = p_booking.parent_id
      and r.to_user_id = p_booking.sitter_id
  );
$$;

create or replace function public.manual_payment_booking_has_sitter_rating(p_booking public.bookings)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.sessions s
    join public.ratings r on r.session_id = s.id
    where s.booking_id = p_booking.id
      and r.from_user_id = p_booking.sitter_id
      and r.to_user_id = p_booking.parent_id
  );
$$;

revoke all on function public.manual_payment_booking_has_parent_rating(public.bookings) from public;
revoke all on function public.manual_payment_booking_has_parent_rating(public.bookings) from anon;
revoke all on function public.manual_payment_booking_has_parent_rating(public.bookings) from authenticated;
revoke all on function public.manual_payment_booking_has_sitter_rating(public.bookings) from public;
revoke all on function public.manual_payment_booking_has_sitter_rating(public.bookings) from anon;
revoke all on function public.manual_payment_booking_has_sitter_rating(public.bookings) from authenticated;

create or replace function public.publish_parent_ratings_for_booking(p_booking_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer := 0;
  v_sitter uuid;
begin
  if p_booking_id is null then
    return 0;
  end if;

  with published as (
    update public.ratings r
       set published_at = now()
      from public.sessions s
      join public.bookings b on b.id = s.booking_id
     where s.booking_id = p_booking_id
       and r.session_id = s.id
       and r.from_user_id = b.parent_id
       and r.to_user_id = b.sitter_id
       and r.published_at is null
    returning r.to_user_id
  )
  select count(*)::integer into v_updated from published;

  for v_sitter in
    select distinct r.to_user_id
    from public.ratings r
    join public.sessions s on s.id = r.session_id
    where s.booking_id = p_booking_id
      and r.published_at is not null
      and r.to_user_id is not null
  loop
    perform public.refresh_sitter_avg_rating_for_user(v_sitter);
  end loop;

  return coalesce(v_updated, 0);
end;
$$;

revoke all on function public.publish_parent_ratings_for_booking(uuid) from public;
revoke all on function public.publish_parent_ratings_for_booking(uuid) from anon;
revoke all on function public.publish_parent_ratings_for_booking(uuid) from authenticated;
grant execute on function public.publish_parent_ratings_for_booking(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 7. RPCs
-- ---------------------------------------------------------------------------
create or replace function public.report_manual_payment(
  p_booking_id uuid,
  p_payment_method text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings;
  v_method text := lower(btrim(coalesce(p_payment_method, '')));
  v_now timestamptz := now();
  v_status text;
begin
  if auth.uid() is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if v_method not in ('cash', 'bit', 'paybox') then
    raise exception 'invalid payment method' using errcode = '22023';
  end if;

  select * into v_booking
    from public.bookings
   where id = p_booking_id
   for update;

  if not found then
    raise exception 'booking not found' using errcode = 'P0002';
  end if;

  if v_booking.parent_id is distinct from auth.uid() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  v_status := lower(btrim(coalesce(v_booking.payment_status, 'unpaid')));

  if v_status = 'awaiting_sitter_confirmation' then
    return jsonb_build_object(
      'ok', true,
      'noop', true,
      'booking_id', v_booking.id,
      'payment_status', v_status
    );
  end if;

  if v_status is distinct from 'unpaid' and v_status is distinct from 'payment_dispute' then
    raise exception 'invalid payment transition' using errcode = 'P0001';
  end if;

  if lower(btrim(coalesce(v_booking.status, ''))) is distinct from 'completed' then
    raise exception 'shift is not completed' using errcode = 'P0001';
  end if;

  if not public.manual_payment_booking_has_parent_rating(v_booking) then
    raise exception 'parent rating required' using errcode = 'P0001';
  end if;

  update public.bookings
     set payment_status = 'awaiting_sitter_confirmation',
         payment_method = v_method,
         payment_rail = 'manual',
         parent_reported_paid_at = v_now,
         parent_resolved_reported_at = case
           when v_status = 'payment_dispute' then v_now
           else parent_resolved_reported_at
         end
   where id = v_booking.id
     and parent_id = auth.uid();

  return jsonb_build_object(
    'ok', true,
    'noop', false,
    'booking_id', v_booking.id,
    'payment_status', 'awaiting_sitter_confirmation'
  );
end;
$$;

create or replace function public.confirm_manual_payment_received(p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings;
  v_status text;
  v_now timestamptz := now();
begin
  if auth.uid() is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select * into v_booking
    from public.bookings
   where id = p_booking_id
   for update;

  if not found then
    raise exception 'booking not found' using errcode = 'P0002';
  end if;

  if v_booking.sitter_id is distinct from auth.uid() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  v_status := lower(btrim(coalesce(v_booking.payment_status, 'unpaid')));

  if v_status = 'awaiting_sitter_rating' then
    return jsonb_build_object(
      'ok', true,
      'noop', true,
      'booking_id', v_booking.id,
      'payment_status', v_status
    );
  end if;

  if v_status is distinct from 'awaiting_sitter_confirmation' then
    raise exception 'invalid payment transition' using errcode = 'P0001';
  end if;

  update public.bookings
     set payment_status = 'awaiting_sitter_rating',
         sitter_confirmed_received_at = coalesce(sitter_confirmed_received_at, v_now)
   where id = v_booking.id
     and sitter_id = auth.uid();

  return jsonb_build_object(
    'ok', true,
    'noop', false,
    'booking_id', v_booking.id,
    'payment_status', 'awaiting_sitter_rating'
  );
end;
$$;

create or replace function public.deny_manual_payment_received(p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings;
  v_status text;
  v_now timestamptz := now();
begin
  if auth.uid() is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select * into v_booking
    from public.bookings
   where id = p_booking_id
   for update;

  if not found then
    raise exception 'booking not found' using errcode = 'P0002';
  end if;

  if v_booking.sitter_id is distinct from auth.uid() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  v_status := lower(btrim(coalesce(v_booking.payment_status, 'unpaid')));

  if v_status = 'payment_dispute' then
    return jsonb_build_object(
      'ok', true,
      'noop', true,
      'booking_id', v_booking.id,
      'payment_status', v_status
    );
  end if;

  if v_status is distinct from 'awaiting_sitter_confirmation' then
    raise exception 'invalid payment transition' using errcode = 'P0001';
  end if;

  update public.bookings
     set payment_status = 'payment_dispute',
         payment_dispute_at = v_now
   where id = v_booking.id
     and sitter_id = auth.uid();

  return jsonb_build_object(
    'ok', true,
    'noop', false,
    'booking_id', v_booking.id,
    'payment_status', 'payment_dispute'
  );
end;
$$;

create or replace function public.mark_manual_payment_paid_after_sitter_rating(p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings;
  v_status text;
  v_now timestamptz := now();
begin
  if auth.uid() is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select * into v_booking
    from public.bookings
   where id = p_booking_id
   for update;

  if not found then
    raise exception 'booking not found' using errcode = 'P0002';
  end if;

  if v_booking.sitter_id is distinct from auth.uid() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  v_status := lower(btrim(coalesce(v_booking.payment_status, 'unpaid')));

  if v_status = 'paid' then
    return jsonb_build_object(
      'ok', true,
      'noop', true,
      'booking_id', v_booking.id,
      'payment_status', v_status
    );
  end if;

  if v_status is distinct from 'awaiting_sitter_rating' then
    raise exception 'invalid payment transition' using errcode = 'P0001';
  end if;

  if not public.manual_payment_booking_has_sitter_rating(v_booking) then
    raise exception 'sitter rating required' using errcode = 'P0001';
  end if;

  update public.bookings
     set payment_status = 'paid',
         paid_at = coalesce(paid_at, v_now)
   where id = v_booking.id
     and sitter_id = auth.uid()
     and payment_status = 'awaiting_sitter_rating';

  perform public.publish_parent_ratings_for_booking(v_booking.id);

  return jsonb_build_object(
    'ok', true,
    'noop', false,
    'booking_id', v_booking.id,
    'payment_status', 'paid'
  );
end;
$$;

revoke all on function public.report_manual_payment(uuid, text) from public;
revoke all on function public.report_manual_payment(uuid, text) from anon;
grant execute on function public.report_manual_payment(uuid, text) to authenticated;
grant execute on function public.report_manual_payment(uuid, text) to service_role;

revoke all on function public.confirm_manual_payment_received(uuid) from public;
revoke all on function public.confirm_manual_payment_received(uuid) from anon;
grant execute on function public.confirm_manual_payment_received(uuid) to authenticated;
grant execute on function public.confirm_manual_payment_received(uuid) to service_role;

revoke all on function public.deny_manual_payment_received(uuid) from public;
revoke all on function public.deny_manual_payment_received(uuid) from anon;
grant execute on function public.deny_manual_payment_received(uuid) to authenticated;
grant execute on function public.deny_manual_payment_received(uuid) to service_role;

revoke all on function public.mark_manual_payment_paid_after_sitter_rating(uuid) from public;
revoke all on function public.mark_manual_payment_paid_after_sitter_rating(uuid) from anon;
grant execute on function public.mark_manual_payment_paid_after_sitter_rating(uuid) to authenticated;
grant execute on function public.mark_manual_payment_paid_after_sitter_rating(uuid) to service_role;

comment on function public.report_manual_payment(uuid, text) is
  'Parent only. unpaid|payment_dispute → awaiting_sitter_confirmation. Never marks paid.';

comment on function public.confirm_manual_payment_received(uuid) is
  'Sitter only. awaiting_sitter_confirmation → awaiting_sitter_rating. Never marks paid.';

comment on function public.deny_manual_payment_received(uuid) is
  'Sitter only. awaiting_sitter_confirmation → payment_dispute.';

comment on function public.mark_manual_payment_paid_after_sitter_rating(uuid) is
  'Sitter only. awaiting_sitter_rating → paid after a sitter→parent rating exists.';

-- ---------------------------------------------------------------------------
-- 8. After a valid sitter→parent rating, close the manual payment.
-- ---------------------------------------------------------------------------
create or replace function public.trg_ratings_mark_manual_payment_paid()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking_id uuid;
  v_parent uuid;
  v_sitter uuid;
  v_payment_status text;
begin
  select s.booking_id, s.parent_id, s.sitter_id
    into v_booking_id, v_parent, v_sitter
  from public.sessions s
  where s.id = new.session_id;

  if v_booking_id is null then
    return new;
  end if;

  if new.from_user_id is distinct from v_sitter
     or new.to_user_id is distinct from v_parent
  then
    return new;
  end if;

  select b.payment_status
    into v_payment_status
  from public.bookings b
  where b.id = v_booking_id;

  if lower(btrim(coalesce(v_payment_status, ''))) is distinct from 'awaiting_sitter_rating' then
    return new;
  end if;

  if auth.uid() is distinct from v_sitter then
    return new;
  end if;

  perform public.mark_manual_payment_paid_after_sitter_rating(v_booking_id);
  return new;
end;
$$;

drop trigger if exists ratings_after_insert_mark_manual_payment_paid on public.ratings;
create trigger ratings_after_insert_mark_manual_payment_paid
  after insert on public.ratings
  for each row
  execute function public.trg_ratings_mark_manual_payment_paid();

revoke all on function public.trg_ratings_mark_manual_payment_paid() from public;
revoke all on function public.trg_ratings_mark_manual_payment_paid() from anon;
revoke all on function public.trg_ratings_mark_manual_payment_paid() from authenticated;

-- ---------------------------------------------------------------------------
-- 9. Sitter rating eligibility: awaiting_sitter_rating (manual) or paid (HYP).
--    Parent → sitter remains unpublished until final paid.
-- ---------------------------------------------------------------------------
create or replace function public.trg_ratings_enforce_published_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent uuid;
  v_sitter uuid;
  v_status text;
  v_booking_id uuid;
  v_payment_status text;
begin
  select s.parent_id, s.sitter_id, s.status::text, s.booking_id
    into v_parent, v_sitter, v_status, v_booking_id
  from public.sessions s
  where s.id = new.session_id;

  if v_parent is null and v_sitter is null then
    raise exception 'rating session not found' using errcode = 'foreign_key_violation';
  end if;

  if v_booking_id is not null then
    select b.payment_status
      into v_payment_status
    from public.bookings b
    where b.id = v_booking_id;
  end if;

  if new.from_user_id = v_parent and new.to_user_id = v_sitter then
    new.published_at := null;
  elsif new.from_user_id = v_sitter and new.to_user_id = v_parent then
    if lower(btrim(coalesce(v_payment_status, ''))) in (
         'unpaid',
         'pending_checkout',
         'awaiting_sitter_confirmation',
         'payment_dispute'
       )
    then
      raise exception 'sitter may rate only after payment confirmation'
        using errcode = 'check_violation';
    end if;

    if lower(btrim(coalesce(v_payment_status, ''))) is distinct from 'awaiting_sitter_rating'
       and lower(btrim(coalesce(v_payment_status, ''))) is distinct from 'paid'
       and v_status is distinct from 'paid'
    then
      raise exception 'sitter may rate only after payment confirmation'
        using errcode = 'check_violation';
    end if;

    new.published_at := coalesce(new.published_at, now());
  end if;

  return new;
end;
$$;

drop trigger if exists ratings_before_insert_enforce_published_at on public.ratings;
create trigger ratings_before_insert_enforce_published_at
  before insert on public.ratings
  for each row
  execute function public.trg_ratings_enforce_published_at();

drop policy if exists "ratings_insert_session_participant" on public.ratings;
create policy "ratings_insert_session_participant"
  on public.ratings
  for insert
  to authenticated
  with check (
    from_user_id = auth.uid()
    and from_user_id is distinct from to_user_id
    and exists (
      select 1
      from public.sessions s
      where s.id = session_id
        and (
          (
            s.parent_id = auth.uid()
            and s.sitter_id is not null
            and to_user_id = s.sitter_id
            and s.status::text in ('completed', 'payment_pending', 'paid', 'sitter_completed')
          )
          or
          (
            s.sitter_id = auth.uid()
            and s.parent_id is not null
            and to_user_id = s.parent_id
            and (
              s.status::text = 'paid'
              or exists (
                select 1
                from public.bookings b
                where b.id = s.booking_id
                  and b.payment_status in ('awaiting_sitter_rating', 'paid')
              )
            )
          )
        )
    )
  );

notify pgrst, 'reload schema';
