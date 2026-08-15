-- Legal acceptance audit fields for new registrations only.
-- Existing rows stay NULL. NULL must not be treated as acceptance.
-- No backfill. No RLS changes.

alter table public.profiles
  add column if not exists terms_accepted_at timestamptz;

alter table public.profiles
  add column if not exists terms_version text;

alter table public.profiles
  add column if not exists privacy_accepted_at timestamptz;

alter table public.profiles
  add column if not exists privacy_version text;

comment on column public.profiles.terms_accepted_at is
  'When the user explicitly accepted Terms of Use at registration. NULL means no recorded acceptance.';

comment on column public.profiles.terms_version is
  'Terms of Use version accepted at registration, e.g. 1.0. NULL means no recorded acceptance.';

comment on column public.profiles.privacy_accepted_at is
  'When the user explicitly accepted the Privacy Policy at registration. NULL means no recorded acceptance.';

comment on column public.profiles.privacy_version is
  'Privacy Policy version accepted at registration, e.g. 1.0. NULL means no recorded acceptance.';

notify pgrst, 'reload schema';
