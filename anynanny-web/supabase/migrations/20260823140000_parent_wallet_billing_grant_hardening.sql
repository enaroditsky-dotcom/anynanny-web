-- F9/F10: Harden Data API grants on parent wallet / billing ledger.
-- Production already has RLS enabled and SELECT-only authenticated policies.
-- Do not change those SELECT policies.
-- Do not revoke or grant anything to service_role.

revoke all on table public.parent_wallet_balances from public;
revoke all on table public.parent_wallet_balances from anon;
revoke all on table public.parent_wallet_balances from authenticated;
grant select on table public.parent_wallet_balances to authenticated;

revoke all on table public.billing_transactions from public;
revoke all on table public.billing_transactions from anon;
revoke all on table public.billing_transactions from authenticated;
grant select on table public.billing_transactions to authenticated;

drop policy if exists parent_wallet_balances_upsert_own
  on public.parent_wallet_balances;
