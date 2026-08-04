alter table public.profiles
  add column if not exists stripe_customer_id text,
  add column if not exists default_payment_method_id text;

create unique index if not exists profiles_stripe_customer_id_uidx
  on public.profiles (stripe_customer_id)
  where stripe_customer_id is not null;
