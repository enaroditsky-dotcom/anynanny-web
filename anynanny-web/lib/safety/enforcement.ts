import type { SupabaseClient } from "@supabase/supabase-js";
import { isPostgrestSchemaDriftError } from "@/lib/supabase/postgrest-schema";
import {
  ACCOUNT_SUSPENDED_MESSAGE,
  BLOCKED_PAIR_MESSAGE,
  isSafetyUuid
} from "@/lib/safety/constants";
import { PROFILES_TABLE } from "@/lib/supabase/profiles";

export async function fetchOwnSuspendedAt(
  supabase: SupabaseClient,
  userId: string
): Promise<{ suspendedAt: string | null; schemaReady: boolean }> {
  if (!isSafetyUuid(userId)) return { suspendedAt: null, schemaReady: false };

  const { data, error } = await supabase
    .from(PROFILES_TABLE)
    .select("suspended_at")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    if (isPostgrestSchemaDriftError(error.message)) {
      return { suspendedAt: null, schemaReady: false };
    }
    return { suspendedAt: null, schemaReady: true };
  }

  const raw =
    data && typeof data === "object" && "suspended_at" in data
      ? (data as { suspended_at?: string | null }).suspended_at
      : null;
  return { suspendedAt: raw ? String(raw) : null, schemaReady: true };
}

async function rpcBoolean(
  supabase: SupabaseClient,
  fn: "is_blocked_pair" | "is_account_suspended",
  args: Record<string, string>
): Promise<boolean> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    if (isPostgrestSchemaDriftError(error.message)) return false;
    return false;
  }
  return data === true;
}

export async function fetchIsBlockedPair(
  supabase: SupabaseClient,
  userA: string,
  userB: string
): Promise<boolean> {
  if (!isSafetyUuid(userA) || !isSafetyUuid(userB) || userA === userB) return false;
  return rpcBoolean(supabase, "is_blocked_pair", { p_user_a: userA, p_user_b: userB });
}

export async function fetchIsAccountSuspended(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  if (!isSafetyUuid(userId)) return false;
  return rpcBoolean(supabase, "is_account_suspended", { p_user_id: userId });
}

export async function assertMarketplacePairAllowed(
  supabase: SupabaseClient,
  actorId: string,
  counterpartId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (await fetchIsAccountSuspended(supabase, actorId)) {
    return { ok: false, error: ACCOUNT_SUSPENDED_MESSAGE };
  }

  if (await fetchIsAccountSuspended(supabase, counterpartId)) {
    return { ok: false, error: BLOCKED_PAIR_MESSAGE };
  }

  if (await fetchIsBlockedPair(supabase, actorId, counterpartId)) {
    return { ok: false, error: BLOCKED_PAIR_MESSAGE };
  }

  return { ok: true };
}
