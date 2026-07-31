-- Parent saved payment methods (Hyp Pay card tokens).
-- Tokens are PCI-safe 19-digit Hyp identifiers; last4 matches the real card.

create table if not exists public.parent_payment_methods (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references auth.users (id) on delete cascade,
  provider text not null default 'hyp'
    check (provider in ('hyp', 'cardcom', 'stripe')),
  -- Hyp 19-digit token (CC when Token=True on soft charge)
  hyp_token text not null,
  -- Expiration from Hyp Tokef (YYMM) — stored as MMYY for soft Tmonth/Tyear
  exp_month smallint not null
    check (exp_month between 1 and 12),
  exp_year smallint not null
    check (exp_year between 2000 and 2100),
  last4 text not null default '',
  brand text not null default 'card',
  label text not null default '',
  israeli_id text null,
  is_default boolean not null default false,
  hyp_trans_id text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint parent_payment_methods_token_unique unique (parent_id, hyp_token)
);

create index if not exists parent_payment_methods_parent_id_idx
  on public.parent_payment_methods (parent_id, created_at desc);

create index if not exists parent_payment_methods_parent_default_idx
  on public.parent_payment_methods (parent_id)
  where is_default = true;

comment on table public.parent_payment_methods is
  'Saved parent tender for Hyp Pay (card tokens). Never store raw PAN/CVV.';
comment on column public.parent_payment_methods.hyp_token is
  'Hyp Pay Token from action=getToken — use as CC with Token=True on action=soft.';
comment on column public.parent_payment_methods.israeli_id is
  'Optional Israeli ID required by some terminals for soft charges.';

alter table public.parent_payment_methods enable row level security;

drop policy if exists parent_payment_methods_select_own on public.parent_payment_methods;
create policy parent_payment_methods_select_own
  on public.parent_payment_methods for select
  to authenticated
  using (parent_id = auth.uid());

drop policy if exists parent_payment_methods_insert_own on public.parent_payment_methods;
create policy parent_payment_methods_insert_own
  on public.parent_payment_methods for insert
  to authenticated
  with check (parent_id = auth.uid());

drop policy if exists parent_payment_methods_update_own on public.parent_payment_methods;
create policy parent_payment_methods_update_own
  on public.parent_payment_methods for update
  to authenticated
  using (parent_id = auth.uid())
  with check (parent_id = auth.uid());

drop policy if exists parent_payment_methods_delete_own on public.parent_payment_methods;
create policy parent_payment_methods_delete_own
  on public.parent_payment_methods for delete
  to authenticated
  using (parent_id = auth.uid());

-- Ensure only one default method per parent.
create or replace function public.parent_payment_methods_enforce_single_default()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_default is true then
    update public.parent_payment_methods
    set is_default = false, updated_at = now()
    where parent_id = new.parent_id
      and id is distinct from new.id
      and is_default = true;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_parent_payment_methods_single_default on public.parent_payment_methods;
create trigger trg_parent_payment_methods_single_default
before insert or update of is_default on public.parent_payment_methods
for each row
execute function public.parent_payment_methods_enforce_single_default();

-- Wallet balances table (used by parent wallet UI / deposits) if missing.
create table if not exists public.parent_wallet_balances (
  parent_id uuid primary key references auth.users (id) on delete cascade,
  balance numeric(12, 2) not null default 0
    check (balance >= 0),
  updated_at timestamptz not null default now()
);

alter table public.parent_wallet_balances enable row level security;

drop policy if exists parent_wallet_balances_select_own on public.parent_wallet_balances;
create policy parent_wallet_balances_select_own
  on public.parent_wallet_balances for select
  to authenticated
  using (parent_id = auth.uid());

drop policy if exists parent_wallet_balances_upsert_own on public.parent_wallet_balances;
create policy parent_wallet_balances_upsert_own
  on public.parent_wallet_balances for all
  to authenticated
  using (parent_id = auth.uid())
  with check (parent_id = auth.uid());
