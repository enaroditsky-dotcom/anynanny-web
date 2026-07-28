-- Align billing_transactions type column naming used by parent wallet + deposit webhooks.
-- Production may already have either `type` or `transaction_type`; ensure both exist and stay in sync.

do $$
begin
  if to_regclass('public.billing_transactions') is null then
    create table public.billing_transactions (
      id uuid primary key default gen_random_uuid(),
      parent_id uuid references auth.users (id) on delete set null,
      user_id uuid references auth.users (id) on delete set null,
      transaction_type text not null default 'payment',
      type text not null default 'payment',
      amount numeric(12, 2) not null default 0,
      description text not null default '',
      status text not null default 'succeeded',
      stripe_payment_intent_id text,
      created_at timestamptz not null default now()
    );

    create index if not exists billing_transactions_parent_id_created_at_idx
      on public.billing_transactions (parent_id, created_at desc);
    create index if not exists billing_transactions_user_id_created_at_idx
      on public.billing_transactions (user_id, created_at desc);
  else
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'billing_transactions' and column_name = 'transaction_type'
    ) then
      alter table public.billing_transactions
        add column transaction_type text;
    end if;

    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'billing_transactions' and column_name = 'type'
    ) then
      alter table public.billing_transactions
        add column type text;
    end if;

    -- Backfill whichever side is missing.
    update public.billing_transactions
    set transaction_type = coalesce(nullif(transaction_type, ''), nullif(type, ''), 'payment')
    where transaction_type is null or transaction_type = '';

    update public.billing_transactions
    set type = coalesce(nullif(type, ''), nullif(transaction_type, ''), 'payment')
    where type is null or type = '';

    alter table public.billing_transactions
      alter column transaction_type set default 'payment';
    alter table public.billing_transactions
      alter column type set default 'payment';
  end if;
end $$;

-- Keep type and transaction_type mirrored on write when both columns exist.
create or replace function public.sync_billing_transaction_type_columns()
returns trigger
language plpgsql
as $$
begin
  if new.transaction_type is null or btrim(new.transaction_type) = '' then
    new.transaction_type := coalesce(nullif(btrim(new.type), ''), 'payment');
  end if;
  if new.type is null or btrim(new.type) = '' then
    new.type := coalesce(nullif(btrim(new.transaction_type), ''), 'payment');
  end if;
  -- Prefer explicit transaction_type when both provided differently.
  if new.transaction_type is distinct from new.type then
    if tg_op = 'INSERT' then
      new.type := new.transaction_type;
    else
      if new.transaction_type is distinct from old.transaction_type then
        new.type := new.transaction_type;
      elsif new.type is distinct from old.type then
        new.transaction_type := new.type;
      else
        new.type := new.transaction_type;
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_billing_transaction_type_columns on public.billing_transactions;
create trigger trg_sync_billing_transaction_type_columns
before insert or update on public.billing_transactions
for each row
execute function public.sync_billing_transaction_type_columns();
