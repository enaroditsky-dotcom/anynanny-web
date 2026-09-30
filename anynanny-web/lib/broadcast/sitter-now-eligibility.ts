import type { SupabaseClient } from "@supabase/supabase-js";
import { FILTER_NOW_BROADCASTS_FOR_CURRENT_SITTER_RPC } from "@/lib/trust/request-recipient-filters";
import { isSupabaseRpcUnavailableError } from "@/lib/supabase/postgrest-schema";

export type NowBroadcastEligibility = {
  /**
   * False only when the eligibility RPC is not deployed yet.
   * In that case callers keep the existing city match.
   * Any other failure stays closed so an unverified match is not shown.
   */
  enforced: boolean;
  allowedIds: Set<string>;
};

function readAllowedIds(data: unknown): Set<string> {
  const allowedIds = new Set<string>();
  const values = Array.isArray(data) ? data : data == null ? [] : [data];
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      allowedIds.add(value.trim());
    }
  }
  return allowedIds;
}

/**
 * Server-side NOW eligibility for the signed-in sitter.
 * The RPC applies favorites, verified-sitter, and verified-parent filters.
 */
export async function filterNowBroadcastIdsForCurrentSitter(
  supabase: SupabaseClient,
  alertIds: readonly string[]
): Promise<NowBroadcastEligibility> {
  const unique = [...new Set(alertIds.map((id) => id.trim()).filter(Boolean))];
  if (unique.length === 0) {
    return { enforced: true, allowedIds: new Set() };
  }

  const { data, error } = await supabase.rpc(FILTER_NOW_BROADCASTS_FOR_CURRENT_SITTER_RPC, {
    p_alert_ids: unique
  });

  if (error) {
    if (isSupabaseRpcUnavailableError(error)) {
      return { enforced: false, allowedIds: new Set(unique) };
    }
    console.warn("[sitter broadcast] eligibility:", error.message);
    return { enforced: true, allowedIds: new Set() };
  }

  return { enforced: true, allowedIds: readAllowedIds(data) };
}

export function applyNowBroadcastEligibility<T extends { id?: string | null }>(
  rows: readonly T[],
  eligibility: NowBroadcastEligibility
): T[] {
  if (!eligibility.enforced) return [...rows];
  return rows.filter((row) => eligibility.allowedIds.has(String(row.id ?? "").trim()));
}
