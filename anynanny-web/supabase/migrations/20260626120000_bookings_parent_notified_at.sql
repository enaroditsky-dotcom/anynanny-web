-- Parent dashboard acknowledgment for sitter approve/reject responses.
alter table public.bookings
  add column if not exists parent_notified_at timestamptz null;

comment on column public.bookings.parent_notified_at is
  'Set when the parent dismisses the dashboard approve/reject response modal.';

create index if not exists bookings_parent_unnotified_response_idx
  on public.bookings (parent_id, updated_at desc)
  where parent_notified_at is null and status in ('approved', 'rejected');

notify pgrst, 'reload schema';
