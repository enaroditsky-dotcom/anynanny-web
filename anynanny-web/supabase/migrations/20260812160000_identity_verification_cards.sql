-- Phase 2 identity verification: optional HYP card token metadata.
-- Never stores PAN or CVV. Token is the Hyp Pay getToken value only.

create table if not exists public.identity_verification_cards (
  user_id uuid primary key references auth.users (id) on delete cascade,
  hyp_token text not null,
  tokef text,
  last4 text not null default '',
  brand text not null default 'card',
  hyp_trans_id text,
  id_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.identity_verification_cards is
  'Optional Hyp token/metadata from identity-verification J2 card check. Never store PAN/CVV.';
comment on column public.identity_verification_cards.hyp_token is
  'Hyp Pay Token from action=getToken after identity verification. Not a card PAN.';
comment on column public.identity_verification_cards.id_status is
  'Raw HYP/SHVA idStatus from the verification return, if present.';

alter table public.identity_verification_cards enable row level security;

drop policy if exists identity_verification_cards_select_own on public.identity_verification_cards;
create policy identity_verification_cards_select_own
  on public.identity_verification_cards for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists identity_verification_cards_insert_own on public.identity_verification_cards;
create policy identity_verification_cards_insert_own
  on public.identity_verification_cards for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists identity_verification_cards_update_own on public.identity_verification_cards;
create policy identity_verification_cards_update_own
  on public.identity_verification_cards for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

notify pgrst, 'reload schema';
