-- Run in Supabase SQL Editor if "Release Stuck Shift" delete fails with RLS errors.

drop policy if exists sessions_delete_participant on public.sessions;
create policy sessions_delete_participant
  on public.sessions for delete
  to authenticated
  using (auth.uid() = parent_id or auth.uid() = sitter_id);

drop policy if exists bookings_delete_participant on public.bookings;
create policy bookings_delete_participant
  on public.bookings for delete
  to authenticated
  using (parent_id = auth.uid() or sitter_id = auth.uid());

notify pgrst, 'reload schema';
