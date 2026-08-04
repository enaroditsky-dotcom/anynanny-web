-- Atomic parent confirm-end: complete the session AND its linked booking in one transaction.
--
-- Why this exists:
--   recordParentConfirmEnd (lib/billing/session-billing.ts) previously issued two separate
--   client updates (sessions, then bookings). If the booking update failed, the session was
--   already marked completed -> split state, and the sitter dashboard could stay stuck.
--   This RPC performs both writes in a single transaction so a failure on either rolls back
--   the other. The session row is returned for the client to commit its completion state.
--
-- Security:
--   SECURITY DEFINER (so it can write bookings + sessions regardless of per-table RLS), but it
--   authorizes against auth.uid() rather than trusting the client-supplied p_parent_id.
--
-- Idempotent: safe to run repeatedly (create or replace).

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
  -- Authorize against the JWT, not the client-supplied id (security definer bypasses RLS).
  if auth.uid() is null or auth.uid() <> p_parent_id then
    raise exception 'not authorized for parent %', p_parent_id using errcode = '42501';
  end if;

  -- 1. Session -> payment_pending (parent confirmed end; Rating/Payment screen follows).
  --    `status` (free-text, read by the dashboards) drives the parent Rating/Payment view;
  --    `session_status` keeps the constrained lifecycle marker. `completed` stays reserved
  --    for the fully-done/idle terminal so we don't re-show the payment screen.
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

  -- 2. Booking -> completed in the SAME transaction (rolls back with the session on error).
  --    Resolve the linked booking via sessions.booking_id, fall back to id == session id.
  update public.bookings
     set status = 'completed'
   where parent_id = p_parent_id
     and id = coalesce(v_row.booking_id, p_session_id);

  return v_row;
end;
$$;

grant execute on function public.end_shift_atomic(uuid, uuid, timestamptz, integer, numeric) to authenticated;

-- Force PostgREST to expose the new function immediately.
notify pgrst, 'reload schema';
