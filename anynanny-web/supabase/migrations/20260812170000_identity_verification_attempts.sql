-- Phase 2 identity verification attempts: correlate HYP J2 hosted-page
-- returns to inquireTransactions without treating redirect idStatus as truth.

create table if not exists public.identity_verification_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'parent'
    check (role in ('parent', 'sitter')),
  inquiry_user text not null,
  hyp_info text,
  hyp_order text,
  hyp_pay_id text,
  hyp_uid text,
  hyp_cg_uid text,
  hyp_tx_id text,
  hyp_mpi_transaction_id text,
  lookup_kind text,
  id_status text,
  inquiry_ok boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint identity_verification_attempts_inquiry_user_unique unique (inquiry_user)
);

create index if not exists identity_verification_attempts_user_created_idx
  on public.identity_verification_attempts (user_id, created_at desc);

comment on table public.identity_verification_attempts is
  'One HYP identity-verification J2 attempt. inquiry_user is the merchant-unique inquireTransactions user field (max 19 chars).';
comment on column public.identity_verification_attempts.inquiry_user is
  'Merchant-controlled unique user identifier sent as Order/Fild2 and used for inquireTransactions lookup when cgUid is absent.';
comment on column public.identity_verification_attempts.id_status is
  'idStatus from inquireTransactions, not from the hosted-page redirect.';

alter table public.identity_verification_attempts enable row level security;

drop policy if exists identity_verification_attempts_select_own on public.identity_verification_attempts;
create policy identity_verification_attempts_select_own
  on public.identity_verification_attempts for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists identity_verification_attempts_insert_own on public.identity_verification_attempts;
create policy identity_verification_attempts_insert_own
  on public.identity_verification_attempts for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists identity_verification_attempts_update_own on public.identity_verification_attempts;
create policy identity_verification_attempts_update_own
  on public.identity_verification_attempts for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

notify pgrst, 'reload schema';
