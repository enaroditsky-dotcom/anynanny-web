-- Secure finalize-after-payment RPC for the SessionFinalizer "Shell" component.
--
-- Why this exists:
--   The frontend SessionFinalizer (components/SessionFinalizer.tsx) marks a session
--   "completed" after a successful Stripe checkout return. Doing this as a direct
--   client UPDATE trips RLS (and could be abused to complete arbitrary sessions or
--   skip the payment_pending gate). Instead of loosening the per-table RLS policies,
--   this SECURITY DEFINER function performs the transition behind a strict guard:
--     * the caller must be authenticated (auth.uid() is not null),
--     * the session must belong to that user (sessions.parent_id = auth.uid()),
--     * the session must currently be in 'payment_pending'.
--   Only then is status advanced to 'completed'. This keeps the Core secure while the
--   Shell simply calls the RPC.
--
-- Security:
--   SECURITY DEFINER (bypasses RLS) but authorizes against auth.uid() only — never a
--   client-supplied id. search_path is pinned to public.
--
-- Idempotent: create or replace; safe to run repeatedly.

create or replace function public.finalize_session_after_payment(
  p_session_id uuid
)
returns public.sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.sessions;
begin
  -- Must be an authenticated caller.
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- Load the session and assert ownership against the JWT (not a client-supplied id).
  select * into v_row
    from public.sessions
   where id = p_session_id;

  if not found then
    raise exception 'session % not found', p_session_id using errcode = 'no_data_found';
  end if;

  if v_row.parent_id is distinct from auth.uid() then
    raise exception 'not authorized to finalize session %', p_session_id using errcode = '42501';
  end if;

  -- Only a session awaiting payment confirmation may be finalized.
  if v_row.status is distinct from 'payment_pending' then
    raise exception 'session % is not payment_pending (current: %)', p_session_id, v_row.status
      using errcode = 'invalid_parameter_value';
  end if;

  update public.sessions
     set status = 'completed'
   where id = p_session_id
     and parent_id = auth.uid()
     and status = 'payment_pending'
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.finalize_session_after_payment(uuid) to authenticated;

-- Force PostgREST to expose the new function immediately.
notify pgrst, 'reload schema';
