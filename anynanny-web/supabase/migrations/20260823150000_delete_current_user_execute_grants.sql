-- Harden EXECUTE grants on public.delete_current_user().
-- Do not replace the function body or signature.
-- Do not revoke service_role or postgres.

revoke all on function public.delete_current_user() from public;
revoke all on function public.delete_current_user() from anon;
grant execute on function public.delete_current_user() to authenticated;
