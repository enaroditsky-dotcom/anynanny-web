import type { SupabaseClient } from "@supabase/supabase-js";

import { isSupabaseRpcUnavailableError } from "@/lib/supabase/postgrest-schema";
import { PARENT_MAY_REQUEST_SITTER_RPC } from "@/lib/trust/request-recipient-filters";

/**
 * `parent_may_request_sitter` is false only when the signed-in parent cannot
 * send a request because `sitter_profiles.only_verified_parents` is on and
 * `profiles.identity_verification_status` is not `verified` (or the session
 * is missing). A missing RPC falls open so the booking modal still opens;
 * the bookings BEFORE INSERT trigger remains the enforcement.
 */
export function shouldOpenVerifiedParentBookingBlock(input: {
  parentMayRequest: boolean | null;
  rpcUnavailable: boolean;
}): boolean {
  if (input.rpcUnavailable) return false;
  return input.parentMayRequest === false;
}

export async function isDirectBookingBlockedForUnverifiedParent(
  supabase: SupabaseClient,
  sitterId: string
): Promise<boolean> {
  const trimmed = sitterId.trim();
  if (!trimmed) return false;

  const { data, error } = await supabase.rpc(PARENT_MAY_REQUEST_SITTER_RPC, {
    p_sitter_id: trimmed
  });

  return shouldOpenVerifiedParentBookingBlock({
    parentMayRequest: typeof data === "boolean" ? data : null,
    rpcUnavailable: Boolean(error && isSupabaseRpcUnavailableError(error))
  });
}
