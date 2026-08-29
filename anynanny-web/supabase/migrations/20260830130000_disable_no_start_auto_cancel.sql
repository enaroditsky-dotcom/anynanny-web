-- Disable +30-minute auto-cancel for approved unstarted bookings.
-- That rule used cancelled as a technical fallback for "never started".
-- Unstarted approved rows now stay approved until scheduled end, then
-- reconcile_unstarted_past_bookings() moves them to awaiting_missed_shift_reason.
--
-- The RPC name is kept so run_pending_booking_lifecycle_job() stays intact.
-- The retired no-start notification kind is no longer emitted here.
-- Local-only in this task: do not apply remotely from the agent.

create or replace function public.cancel_approved_bookings_without_start()
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Intentionally a no-op. Do not auto-cancel unstarted approved bookings.
  return 0;
end;
$$;

revoke all on function public.cancel_approved_bookings_without_start() from public;
revoke all on function public.cancel_approved_bookings_without_start() from anon;
revoke all on function public.cancel_approved_bookings_without_start() from authenticated;

do $$
begin
  execute 'grant execute on function public.cancel_approved_bookings_without_start() to postgres';
exception
  when others then null;
end $$;

notify pgrst, 'reload schema';
