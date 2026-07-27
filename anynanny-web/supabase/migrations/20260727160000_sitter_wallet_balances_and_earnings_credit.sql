-- Sitter wallet: balances + transactions + auto-credit on completed/paid shifts.
-- Fixes PostgREST 404 for sitter_wallet_balances / sitter_transactions.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.sitter_wallet_balances (
  sitter_id uuid primary key references auth.users (id) on delete cascade,
  balance numeric(12, 2) not null default 0
    check (balance >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.sitter_transactions (
  id uuid primary key default gen_random_uuid(),
  sitter_id uuid not null references auth.users (id) on delete cascade,
  booking_id uuid null references public.bookings (id) on delete set null,
  session_id uuid null references public.sessions (id) on delete set null,
  type text not null
    check (type in ('earnings', 'payout', 'bonus')),
  amount numeric(12, 2) not null
    check (amount > 0),
  description text not null default '',
  status text not null default 'succeeded'
    check (status in ('succeeded', 'pending', 'failed')),
  created_at timestamptz not null default now()
);

create index if not exists sitter_transactions_sitter_created_idx
  on public.sitter_transactions (sitter_id, created_at desc);

-- One earnings credit per booking / session (idempotent).
create unique index if not exists sitter_transactions_unique_booking_earnings_idx
  on public.sitter_transactions (booking_id)
  where booking_id is not null and type = 'earnings';

create unique index if not exists sitter_transactions_unique_session_earnings_idx
  on public.sitter_transactions (session_id)
  where session_id is not null and type = 'earnings';

comment on table public.sitter_wallet_balances is
  'Available withdrawal balance for each sitter (credited after completed/paid shifts).';
comment on table public.sitter_transactions is
  'Sitter wallet ledger: earnings, payouts, bonuses.';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.sitter_wallet_balances enable row level security;
alter table public.sitter_transactions enable row level security;

drop policy if exists sitter_wallet_balances_select_own on public.sitter_wallet_balances;
create policy sitter_wallet_balances_select_own
  on public.sitter_wallet_balances for select
  to authenticated
  using (sitter_id = auth.uid());

drop policy if exists sitter_transactions_select_own on public.sitter_transactions;
create policy sitter_transactions_select_own
  on public.sitter_transactions for select
  to authenticated
  using (sitter_id = auth.uid());

-- Sitters may insert their own payout requests; earnings are written by SECURITY DEFINER.
drop policy if exists sitter_transactions_insert_own_payout on public.sitter_transactions;
create policy sitter_transactions_insert_own_payout
  on public.sitter_transactions for insert
  to authenticated
  with check (
    sitter_id = auth.uid()
    and type = 'payout'
  );

-- ---------------------------------------------------------------------------
-- Ensure wallet row for current sitter
-- ---------------------------------------------------------------------------

create or replace function public.ensure_sitter_wallet()
returns public.sitter_wallet_balances
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.sitter_wallet_balances;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  insert into public.sitter_wallet_balances (sitter_id, balance, updated_at)
  values (v_uid, 0, now())
  on conflict (sitter_id) do update
    set updated_at = public.sitter_wallet_balances.updated_at
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.ensure_sitter_wallet() from public;
grant execute on function public.ensure_sitter_wallet() to authenticated;

-- ---------------------------------------------------------------------------
-- Core credit helper (idempotent)
-- ---------------------------------------------------------------------------

create or replace function public.credit_sitter_wallet_earnings(
  p_sitter_id uuid,
  p_amount numeric,
  p_booking_id uuid default null,
  p_session_id uuid default null,
  p_description text default null,
  p_status text default 'succeeded'
)
returns public.sitter_transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_amount numeric(12, 2);
  v_status text := coalesce(nullif(trim(p_status), ''), 'succeeded');
  v_tx public.sitter_transactions;
  v_desc text;
begin
  if p_sitter_id is null then
    return null;
  end if;

  v_amount := round(coalesce(p_amount, 0)::numeric, 2);
  if v_amount <= 0 then
    return null;
  end if;

  if v_status not in ('succeeded', 'pending', 'failed') then
    v_status := 'succeeded';
  end if;

  v_desc := coalesce(nullif(trim(p_description), ''), 'רווח ממשמרת שהושלמה');

  insert into public.sitter_wallet_balances (sitter_id, balance, updated_at)
  values (p_sitter_id, 0, now())
  on conflict (sitter_id) do nothing;

  -- Existing earnings row for this booking or session?
  select * into v_tx
    from public.sitter_transactions
   where type = 'earnings'
     and (
       (p_booking_id is not null and booking_id = p_booking_id)
       or (p_session_id is not null and session_id = p_session_id)
     )
   order by created_at desc
   limit 1;

  if v_tx.id is not null then
    if v_tx.status = 'pending' and v_status = 'succeeded' then
      update public.sitter_transactions
         set status = 'succeeded',
             description = v_desc,
             session_id = coalesce(session_id, p_session_id),
             booking_id = coalesce(booking_id, p_booking_id),
             amount = v_amount
       where id = v_tx.id
      returning * into v_tx;

      update public.sitter_wallet_balances
         set balance = balance + v_tx.amount,
             updated_at = now()
       where sitter_id = p_sitter_id;
    elsif p_session_id is not null and v_tx.session_id is null then
      update public.sitter_transactions
         set session_id = p_session_id
       where id = v_tx.id
      returning * into v_tx;
    end if;
    return v_tx;
  end if;

  insert into public.sitter_transactions (
    sitter_id,
    booking_id,
    session_id,
    type,
    amount,
    description,
    status,
    created_at
  )
  values (
    p_sitter_id,
    p_booking_id,
    p_session_id,
    'earnings',
    v_amount,
    v_desc,
    v_status,
    now()
  )
  returning * into v_tx;

  if v_status = 'succeeded' then
    update public.sitter_wallet_balances
       set balance = balance + v_amount,
           updated_at = now()
     where sitter_id = p_sitter_id;
  end if;

  return v_tx;
exception
  when unique_violation then
    select * into v_tx
      from public.sitter_transactions
     where type = 'earnings'
       and (
         (p_booking_id is not null and booking_id = p_booking_id)
         or (p_session_id is not null and session_id = p_session_id)
       )
     order by created_at desc
     limit 1;
    return v_tx;
end;
$$;

revoke all on function public.credit_sitter_wallet_earnings(uuid, numeric, uuid, uuid, text, text) from public;
grant execute on function public.credit_sitter_wallet_earnings(uuid, numeric, uuid, uuid, text, text) to service_role;

-- Resolve amount + sitter from a booking and credit.
create or replace function public.credit_sitter_wallet_for_booking(p_booking_id uuid)
returns public.sitter_transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings;
  v_session public.sessions;
  v_amount numeric(12, 2);
  v_desc text;
begin
  if p_booking_id is null then
    return null;
  end if;

  select * into v_booking
    from public.bookings
   where id = p_booking_id;

  if not found or v_booking.sitter_id is null then
    return null;
  end if;

  if auth.uid() is not null
     and auth.uid() is distinct from v_booking.parent_id
     and auth.uid() is distinct from v_booking.sitter_id then
    raise exception 'not authorized to credit booking %', p_booking_id using errcode = '42501';
  end if;

  -- Prefer linked session amount (sitter base NIS).
  select * into v_session
    from public.sessions
   where booking_id = p_booking_id
      or id = p_booking_id
   order by
     case
       when status in ('paid', 'completed') then 0
       when status = 'payment_pending' then 1
       else 2
     end,
     created_at desc nulls last
   limit 1;

  v_amount := coalesce(
    nullif(v_session.final_amount_nis, 0),
    nullif(v_session.total_amount_charged, 0),
    0
  );

  if v_amount <= 0 then
    return null;
  end if;

  v_desc := format(
    'רווח ממשמרת · ₪%s',
    to_char(v_amount, 'FM999999990.00')
  );

  -- If payment already cleared, credit available balance; otherwise pending ledger.
  if coalesce(v_session.status, '') in ('paid', 'completed')
     or coalesce(v_session.session_status, '') = 'paid' then
    return public.credit_sitter_wallet_earnings(
      v_booking.sitter_id,
      v_amount,
      v_booking.id,
      v_session.id,
      v_desc,
      'succeeded'
    );
  end if;

  return public.credit_sitter_wallet_earnings(
    v_booking.sitter_id,
    v_amount,
    v_booking.id,
    v_session.id,
    v_desc,
    'pending'
  );
end;
$$;

revoke all on function public.credit_sitter_wallet_for_booking(uuid) from public;
grant execute on function public.credit_sitter_wallet_for_booking(uuid) to service_role;
grant execute on function public.credit_sitter_wallet_for_booking(uuid) to authenticated;

create or replace function public.credit_sitter_wallet_for_session(p_session_id uuid)
returns public.sitter_transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.sessions;
  v_amount numeric(12, 2);
  v_booking_id uuid;
  v_desc text;
begin
  if p_session_id is null then
    return null;
  end if;

  select * into v_session
    from public.sessions
   where id = p_session_id;

  if not found or v_session.sitter_id is null then
    return null;
  end if;

  if auth.uid() is not null
     and auth.uid() is distinct from v_session.parent_id
     and auth.uid() is distinct from v_session.sitter_id then
    raise exception 'not authorized to credit session %', p_session_id using errcode = '42501';
  end if;

  v_amount := coalesce(
    nullif(v_session.final_amount_nis, 0),
    nullif(v_session.total_amount_charged, 0),
    0
  );
  if v_amount <= 0 then
    return null;
  end if;

  v_booking_id := coalesce(v_session.booking_id, v_session.id);
  v_desc := format(
    'רווח ממשמרת · ₪%s',
    to_char(v_amount, 'FM999999990.00')
  );

  return public.credit_sitter_wallet_earnings(
    v_session.sitter_id,
    v_amount,
    v_booking_id,
    v_session.id,
    v_desc,
    'succeeded'
  );
end;
$$;

revoke all on function public.credit_sitter_wallet_for_session(uuid) from public;
grant execute on function public.credit_sitter_wallet_for_session(uuid) to service_role;
grant execute on function public.credit_sitter_wallet_for_session(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create or replace function public.trg_credit_sitter_wallet_on_booking_completed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and new.status is distinct from old.status
     and new.status::text = 'completed' then
    perform public.credit_sitter_wallet_for_booking(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists credit_sitter_wallet_on_booking_completed on public.bookings;
create trigger credit_sitter_wallet_on_booking_completed
  after update of status on public.bookings
  for each row
  execute function public.trg_credit_sitter_wallet_on_booking_completed();

create or replace function public.trg_credit_sitter_wallet_on_session_paid()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and (
    (
      new.status is distinct from old.status
      and new.status::text in ('paid', 'completed')
    )
    or (
      new.session_status is distinct from old.session_status
      and new.session_status::text = 'paid'
    )
  ) then
    perform public.credit_sitter_wallet_for_session(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists credit_sitter_wallet_on_session_paid on public.sessions;
create trigger credit_sitter_wallet_on_session_paid
  after update on public.sessions
  for each row
  execute function public.trg_credit_sitter_wallet_on_session_paid();

-- ---------------------------------------------------------------------------
-- Backfill existing completed/paid shifts (idempotent)
-- ---------------------------------------------------------------------------

do $$
declare
  r record;
begin
  for r in
    select b.id
      from public.bookings b
     where b.status::text = 'completed'
       and b.sitter_id is not null
  loop
    perform public.credit_sitter_wallet_for_booking(r.id);
  end loop;

  for r in
    select s.id
      from public.sessions s
     where s.sitter_id is not null
       and (
         s.status::text in ('paid', 'completed')
         or coalesce(s.session_status::text, '') = 'paid'
       )
       and coalesce(s.final_amount_nis, s.total_amount_charged, 0) > 0
  loop
    perform public.credit_sitter_wallet_for_session(r.id);
  end loop;
exception
  when undefined_table then null;
  when undefined_column then null;
end $$;

notify pgrst, 'reload schema';


-- ---------------------------------------------------------------------------
-- Also credit when payment finalize RPC marks the session completed
-- ---------------------------------------------------------------------------

create or replace function public.finalize_session_after_payment(
  p_session_id uuid
)
returns public.sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.sessions;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select * into v_row
    from public.sessions
   where id = p_session_id;

  if not found then
    raise exception 'session % not found', p_session_id using errcode = 'no_data_found';
  end if;

  if v_row.parent_id is distinct from auth.uid() then
    raise exception 'not authorized to finalize session %', p_session_id using errcode = '42501';
  end if;

  if v_row.status is distinct from 'payment_pending' then
    raise exception 'session % is not payment_pending (current: %)', p_session_id, v_row.status
      using errcode = 'invalid_parameter_value';
  end if;

  update public.sessions
     set status = 'completed'
   where id = p_session_id
     and parent_id = auth.uid()
     and status = 'payment_pending'
  returning * into v_row;

  -- Trigger also fires; explicit call keeps credit path resilient.
  perform public.credit_sitter_wallet_for_session(p_session_id);

  return v_row;
end;
$$;

grant execute on function public.finalize_session_after_payment(uuid) to authenticated;
