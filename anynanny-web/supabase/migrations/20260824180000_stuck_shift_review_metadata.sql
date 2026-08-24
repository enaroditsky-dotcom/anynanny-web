-- Stuck-shift recovery metadata for started shifts that need operator review.
-- Local-only in this task: do not apply remotely from the agent.
-- Does not change bookings.status and does not invent end times or amounts.

alter table public.bookings
  add column if not exists stuck_release_reason text;

alter table public.bookings
  add column if not exists stuck_release_detail text;

alter table public.bookings
  add column if not exists stuck_released_at timestamptz;

alter table public.bookings
  add column if not exists stuck_released_by uuid references auth.users (id) on delete set null;

comment on column public.bookings.stuck_release_reason is
  'Parent stuck-shift release reason code. Set only when requires_admin_review is true.';

comment on column public.bookings.stuck_release_detail is
  'Free-text detail when stuck_release_reason = other.';

comment on column public.bookings.stuck_released_at is
  'When the parent released the stuck live UI into operator review.';

comment on column public.bookings.stuck_released_by is
  'Auth user id of the parent who released the stuck shift.';

alter table public.bookings
  drop constraint if exists bookings_stuck_release_reason_check;

alter table public.bookings
  add constraint bookings_stuck_release_reason_check
  check (
    stuck_release_reason is null
    or stuck_release_reason in (
      'end_incomplete',
      'ended_still_active',
      'cannot_end_normally',
      'other_technical',
      'other'
    )
  );

alter table public.bookings
  drop constraint if exists bookings_stuck_release_detail_check;

alter table public.bookings
  add constraint bookings_stuck_release_detail_check
  check (
    stuck_release_reason is distinct from 'other'
    or (
      stuck_release_detail is not null
      and length(trim(stuck_release_detail)) > 0
    )
  );

create index if not exists bookings_stuck_released_at_idx
  on public.bookings (stuck_released_at desc)
  where requires_admin_review = true;

notify pgrst, 'reload schema';
