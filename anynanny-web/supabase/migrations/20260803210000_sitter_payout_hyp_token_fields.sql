-- Sitter payout card: Israeli ID + Hyp token fields for live payout readiness.
-- Never store full PAN or CVV.

alter table public.sitter_profiles
  add column if not exists payout_card_id_number text;

alter table public.sitter_profiles
  add column if not exists payout_hyp_token text;

alter table public.sitter_profiles
  add column if not exists payout_hyp_tokef text;

alter table public.sitter_profiles
  add column if not exists payout_card_brand text;

alter table public.sitter_profiles
  add column if not exists payout_hyp_trans_id text;

comment on column public.sitter_profiles.payout_card_id_number is
  'Israeli ID (ת.ז.) for payout card / HYP — private; never expose to parents.';
comment on column public.sitter_profiles.payout_hyp_token is
  'Hyp card token for sitter payouts — server-side only; never return to browser clients.';
comment on column public.sitter_profiles.payout_hyp_tokef is
  'Hyp Tokef (MMYY) for the saved payout token.';
comment on column public.sitter_profiles.payout_card_brand is
  'Card brand hint from Hyp (Visa / Mastercard / …).';
comment on column public.sitter_profiles.payout_hyp_trans_id is
  'Last Hyp TransId used to register the payout card token.';

notify pgrst, 'reload schema';
