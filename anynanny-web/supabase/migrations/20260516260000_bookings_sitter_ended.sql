-- Double-Shake: parent_started (shift live) → sitter_ended (sitter requested end) → completed / force-end.

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
      'parent_started',
      'sitter_ended',
      'completed'
    )
  );

notify pgrst, 'reload schema';
