alter table public.sitter_profiles
  add column if not exists payout_preferred_method text;

comment on column public.sitter_profiles.payout_preferred_method is
  'Preferred sitter receiving/payout declaration: bit | paybox | card | bank | cash.';

alter table public.sitter_profiles
  drop constraint if exists sitter_profiles_payout_preferred_method_check;

alter table public.sitter_profiles
  add constraint sitter_profiles_payout_preferred_method_check
  check (
    payout_preferred_method is null
    or payout_preferred_method in ('bit', 'paybox', 'card', 'bank', 'cash')
  );

grant select (payout_preferred_method)
  on public.sitter_profiles
  to authenticated;

grant update (payout_preferred_method)
  on public.sitter_profiles
  to authenticated;

notify pgrst, 'reload schema';
