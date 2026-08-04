-- Force-end / dispute flags for admin (Eddie) review.

alter table public.bookings
  add column if not exists requires_admin_review boolean not null default false;

alter table public.bookings
  add column if not exists admin_notes text;

alter table public.bookings
  add column if not exists actual_end_time timestamptz;

alter table public.bookings drop constraint if exists bookings_status_check;

alter table public.bookings
  add constraint bookings_status_check
  check (
    status in (
      'pending',
      'approved',
      'rejected',
      'cancelled',
      'sitter_started',
      'completed'
    )
  );

create index if not exists bookings_admin_review_idx
  on public.bookings (requires_admin_review, updated_at desc)
  where requires_admin_review = true;
