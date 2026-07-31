-- Sitter digital-wallet payout destinations (Bit / PayBox / card).
-- Never store full PAN or CVV — only last4 + expiry + holder for card.

alter table public.sitter_profiles
  add column if not exists payout_preferred_method text
    check (payout_preferred_method is null or payout_preferred_method in ('bit', 'paybox', 'card', 'bank'));

alter table public.sitter_profiles
  add column if not exists payout_bit_phone text;

alter table public.sitter_profiles
  add column if not exists payout_paybox_phone text;

alter table public.sitter_profiles
  add column if not exists payout_card_holder text;

alter table public.sitter_profiles
  add column if not exists payout_card_last4 text;

alter table public.sitter_profiles
  add column if not exists payout_card_exp_month smallint
    check (payout_card_exp_month is null or (payout_card_exp_month between 1 and 12));

alter table public.sitter_profiles
  add column if not exists payout_card_exp_year smallint
    check (payout_card_exp_year is null or (payout_card_exp_year between 2000 and 2100));

alter table public.sitter_profiles
  add column if not exists payout_methods_updated_at timestamptz;

comment on column public.sitter_profiles.payout_preferred_method is
  'Preferred sitter payout rail: bit | paybox | card | bank.';
comment on column public.sitter_profiles.payout_bit_phone is
  'Israeli mobile for Bit payouts — private.';
comment on column public.sitter_profiles.payout_paybox_phone is
  'Israeli mobile for PayBox payouts — private.';
comment on column public.sitter_profiles.payout_card_last4 is
  'Last 4 digits only for payout card reference — never store full PAN/CVV.';
