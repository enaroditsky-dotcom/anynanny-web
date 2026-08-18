-- =============================================================================
-- PROPOSAL ONLY — DO NOT APPLY until explicitly approved.
-- This file is not a numbered live migration and must not be auto-run.
--
-- Purpose:
--   Persist the authoritative actual shift end onto bookings.actual_end_time
--   inside end_shift_atomic, using the SAME p_end_iso already written to
--   sessions.end_time / parent_end_shake.
--
-- Does not change payment amounts, elapsed seconds, ratings, or status semantics.
-- =============================================================================

create or replace function public.end_shift_atomic(
  p_session_id uuid,
  p_parent_id  uuid,
  p_end_iso    timestamptz,
  p_elapsed    integer,
  p_amount     numeric
)
returns public.sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.sessions;
begin
  if auth.uid() is null or auth.uid() <> p_parent_id then
    raise exception 'not authorized for parent %', p_parent_id using errcode = '42501';
  end if;

  update public.sessions
     set session_status        = 'completed',
         status                = 'payment_pending',
         parent_end_shake      = p_end_iso,
         end_time              = p_end_iso,
         final_elapsed_seconds = p_elapsed,
         total_amount_charged  = p_amount,
         final_amount_nis      = p_amount
   where id = p_session_id
     and parent_id = p_parent_id
  returning * into v_row;

  if not found then
    raise exception 'session % not found for parent %', p_session_id, p_parent_id
      using errcode = 'no_data_found';
  end if;

  update public.bookings
     set status = 'completed',
         actual_end_time = coalesce(actual_end_time, p_end_iso)
   where parent_id = p_parent_id
     and id = coalesce(v_row.booking_id, p_session_id);

  return v_row;
end;
$$;

grant execute on function public.end_shift_atomic(uuid, uuid, timestamptz, integer, numeric) to authenticated;

notify pgrst, 'reload schema';
