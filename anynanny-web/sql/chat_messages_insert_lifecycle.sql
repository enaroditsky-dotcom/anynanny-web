-- =============================================================================
-- PROPOSAL ONLY — DO NOT APPLY until explicitly approved.
-- This file is not a numbered Supabase migration and must not be auto-run.
--
-- Why this is required:
--   public.messages inserts happen directly from the browser (supabase-js).
--   Current INSERT RLS only checks that the sender is the booking parent or
--   sitter. There is no send RPC / server action. UI hiding the composer is
--   not enough — a client can still INSERT after the 24h grace window.
--
-- What this does:
--   Tightens messages_insert_participant WITH CHECK so new rows are allowed
--   only while the booking chat is still writable. SELECT is unchanged, so
--   history remains readable. mark_booking_messages_read is unchanged.
--
-- Completed-shift end time:
--   coalesce(b.actual_end_time, b.end_time) + interval '24 hours'
--   actual_end_time is populated from p_end_iso in end_shift_atomic
--   (same value as sessions.end_time). Scheduled b.end_time is only a
--   fallback for legacy completed bookings where actual_end_time is NULL.
-- =============================================================================

drop policy if exists messages_insert_participant on public.messages;

create policy messages_insert_participant
  on public.messages for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1
      from public.bookings b
      where b.id = booking_id
        and (b.parent_id = auth.uid() or b.sitter_id = auth.uid())
        and (
          b.status in (
            'pending',
            'approved',
            'sitter_started',
            'parent_started',
            'sitter_ended'
          )
          or (
            b.status = 'completed'
            and now() <= coalesce(b.actual_end_time, b.end_time) + interval '24 hours'
          )
          or (
            b.status = 'cancelled'
            and b.cancelled_at is not null
            and now() <= b.cancelled_at + interval '24 hours'
          )
        )
    )
  );

notify pgrst, 'reload schema';
