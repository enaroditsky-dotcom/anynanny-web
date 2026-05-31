-- Session billing + Double-Shake timestamps on public.sessions (active work rows).
-- Idempotent: safe to re-run. Does not touch bookings workflow columns or dashboard code.

-- Double-Shake: explicit shake timestamps (replaces inferring from booleans alone).
alter table public.sessions
  add column if not exists sitter_start_shake timestamptz;

alter table public.sessions
  add column if not exists parent_start_shake timestamptz;

alter table public.sessions
  add column if not exists sitter_end_shake timestamptz;

alter table public.sessions
  add column if not exists parent_end_shake timestamptz;

comment on column public.sessions.sitter_start_shake is
  'When the sitter completed the start Double-Shake gesture.';

comment on column public.sessions.parent_start_shake is
  'When the parent completed the start Double-Shake gesture.';

comment on column public.sessions.sitter_end_shake is
  'When the sitter completed the end Double-Shake gesture.';

comment on column public.sessions.parent_end_shake is
  'When the parent completed the end Double-Shake gesture.';

-- Billing: rate, charged total, and Stripe payment intent for post-session capture.
alter table public.sessions
  add column if not exists billing_rate_per_minute numeric(10, 4);

alter table public.sessions
  add column if not exists total_amount_charged numeric(12, 2);

alter table public.sessions
  add column if not exists stripe_payment_intent_id text;

comment on column public.sessions.billing_rate_per_minute is
  'Locked per-minute rate (NIS) used to compute total_amount_charged for this session.';

comment on column public.sessions.total_amount_charged is
  'Final amount charged to the parent for this session (NIS).';

comment on column public.sessions.stripe_payment_intent_id is
  'Stripe PaymentIntent id after successful charge or authorization capture.';

-- Billing lifecycle (distinct from sessions.status Double-Shake workflow).
alter table public.sessions
  add column if not exists session_status text not null default 'pending';

alter table public.sessions
  drop constraint if exists sessions_session_status_check;

alter table public.sessions
  add constraint sessions_session_status_check
  check (session_status in ('pending', 'active', 'completed', 'paid'));

comment on column public.sessions.session_status is
  'Billing lifecycle: pending → active → completed → paid. Complements sessions.status workflow.';

create index if not exists sessions_session_status_idx
  on public.sessions (session_status, created_at desc);

create index if not exists sessions_stripe_payment_intent_id_idx
  on public.sessions (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

-- Best-effort backfill from legacy Double-Shake / billing columns (no-op on fresh rows).
update public.sessions
set parent_end_shake = parent_end_requested_at
where parent_end_shake is null
  and parent_end_requested_at is not null;

update public.sessions
set sitter_end_shake = sitter_end_confirmed_at
where sitter_end_shake is null
  and sitter_end_confirmed_at is not null;

update public.sessions
set parent_start_shake = start_time
where parent_start_shake is null
  and start_time is not null
  and status in ('active', 'completed');

update public.sessions
set sitter_start_shake = start_time
where sitter_start_shake is null
  and start_time is not null
  and coalesce(start_confirmed, false) = true;

update public.sessions
set total_amount_charged = final_amount_nis
where total_amount_charged is null
  and final_amount_nis is not null;

update public.sessions
set session_status = case
  when status = 'active' then 'active'
  when status = 'completed' then 'completed'
  else session_status
end
where session_status = 'pending'
  and status in ('active', 'completed');

notify pgrst, 'reload schema';
