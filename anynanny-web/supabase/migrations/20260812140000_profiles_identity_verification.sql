-- Phase 1 identity verification: status on profiles + parent Israeli ID.
-- Does NOT mark anyone verified. Existing rows default to unverified.
-- Canonical Israeli ID:
--   parent → profiles.identity_id_number
--   sitter → existing sitter_profiles.id_number (do not duplicate onto profiles).

alter table public.profiles
  add column if not exists identity_verification_status text not null default 'unverified';

alter table public.profiles
  drop constraint if exists profiles_identity_verification_status_check;

alter table public.profiles
  add constraint profiles_identity_verification_status_check
  check (identity_verification_status in ('unverified', 'pending', 'verified', 'failed'));

alter table public.profiles
  add column if not exists identity_verified_at timestamptz;

alter table public.profiles
  add column if not exists identity_verification_method text;

alter table public.profiles
  add column if not exists identity_id_number text;

comment on column public.profiles.identity_verification_status is
  'Identity verification state: unverified | pending | verified | failed. Default unverified; never auto-set to verified in Phase 1.';

comment on column public.profiles.identity_verified_at is
  'Set only when identity_verification_status becomes verified (Phase 2 HYP/SHVA).';

comment on column public.profiles.identity_verification_method is
  'Future provider method, e.g. card_id_match. Nullable until Phase 2.';

comment on column public.profiles.identity_id_number is
  'Parent Israeli ID (ת.ז.) for identity verification — private; never expose to other users. Sitters use sitter_profiles.id_number.';

notify pgrst, 'reload schema';
