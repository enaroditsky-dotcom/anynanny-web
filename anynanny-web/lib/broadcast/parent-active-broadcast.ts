import type { SupabaseClient } from "@supabase/supabase-js";

export const BROADCAST_ALERTS_TABLE = "broadcast_alerts";
export const BROADCAST_RESPONSES_TABLE = "broadcast_responses";
export const ACTIVE_BROADCAST_STATUS = "active";

export type ParentActiveBroadcast = {
  id: string;
  parent_id: string;
  city: string;
  service_type: string;
  status: string;
  created_at: string;
};

const BROADCAST_SELECT =
  "id, parent_id, city, service_type, status, created_at";

export function broadcastRadarHref(broadcast: Pick<ParentActiveBroadcast, "id" | "city" | "service_type">): string {
  const params = new URLSearchParams({
    city: broadcast.city,
    alertId: broadcast.id
  });
  if (broadcast.service_type && broadcast.service_type !== "sitter") {
    params.set("type", broadcast.service_type);
  }
  return `/parent/search/broadcast-radar?${params.toString()}`;
}

export function formatBroadcastElapsed(startedAt: string, nowMs: number): string {
  const start = new Date(startedAt).getTime();
  if (!Number.isFinite(start)) return "00:00";
  const elapsed = Math.max(0, Math.floor((nowMs - start) / 1000));
  const hours = Math.floor(elapsed / 3600);
  const minutes = Math.floor((elapsed % 3600) / 60);
  const seconds = elapsed % 60;
  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export async function fetchActiveBroadcastForParent(
  supabase: SupabaseClient,
  parentId: string
): Promise<{ broadcast: ParentActiveBroadcast | null; error: string | null }> {
  const { data, error } = await supabase
    .from(BROADCAST_ALERTS_TABLE)
    .select(BROADCAST_SELECT)
    .eq("parent_id", parentId)
    .eq("status", ACTIVE_BROADCAST_STATUS)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return { broadcast: null, error: error.message };
  }
  return { broadcast: (data as ParentActiveBroadcast | null) ?? null, error: null };
}

export async function countBroadcastResponses(
  supabase: SupabaseClient,
  alertId: string
): Promise<number> {
  const { count, error } = await supabase
    .from(BROADCAST_RESPONSES_TABLE)
    .select("id", { count: "exact", head: true })
    .eq("alert_id", alertId);

  if (error) {
    console.warn("[broadcast] response count:", error.message);
    return 0;
  }
  return count ?? 0;
}

/** End an active search after the sitter confirms the shift. Does not delete history. */
export async function markActiveBroadcastFilled(
  supabase: SupabaseClient,
  alertId: string,
  parentId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from(BROADCAST_ALERTS_TABLE)
    .update({ status: "filled" })
    .eq("id", alertId)
    .eq("parent_id", parentId)
    .eq("status", ACTIVE_BROADCAST_STATUS);

  if (error) {
    return { error: error.message };
  }
  return { error: null };
}

export async function fetchBroadcastResponderIds(
  supabase: SupabaseClient,
  alertId: string
): Promise<string[]> {
  const { data, error } = await supabase
    .from(BROADCAST_RESPONSES_TABLE)
    .select("sitter_id")
    .eq("alert_id", alertId);

  if (error) {
    console.warn("[broadcast] responder ids:", error.message);
    return [];
  }

  return [
    ...new Set(
      (data ?? [])
        .map((row) => String((row as { sitter_id?: string }).sitter_id ?? "").trim())
        .filter(Boolean)
    )
  ];
}

/** Pending shift requests sent from this broadcast (parent select, not yet confirmed). */
export async function fetchPendingRequestedSitterIds(
  supabase: SupabaseClient,
  parentId: string,
  alertId: string,
  broadcastCreatedAt: string
): Promise<string[]> {
  const responderIds = await fetchBroadcastResponderIds(supabase, alertId);
  if (responderIds.length === 0) return [];

  const { data, error } = await supabase
    .from("bookings")
    .select("sitter_id")
    .eq("parent_id", parentId)
    .eq("status", "pending")
    .gte("created_at", broadcastCreatedAt)
    .in("sitter_id", responderIds);

  if (error) {
    console.warn("[broadcast] pending requests:", error.message);
    return [];
  }

  return [
    ...new Set(
      (data ?? [])
        .map((row) => String((row as { sitter_id?: string }).sitter_id ?? "").trim())
        .filter(Boolean)
    )
  ];
}

/**
 * Real sitter confirmation for this broadcast: a responder's booking
 * created after the broadcast started is now `approved`.
 * Bookings have no broadcast_id; this uses existing columns only.
 */
export async function findApprovedBroadcastLinkedBooking(
  supabase: SupabaseClient,
  parentId: string,
  alertId: string,
  broadcastCreatedAt: string
): Promise<{ bookingId: string } | null> {
  const responderIds = await fetchBroadcastResponderIds(supabase, alertId);
  if (responderIds.length === 0) return null;

  const { data, error } = await supabase
    .from("bookings")
    .select("id")
    .eq("parent_id", parentId)
    .eq("status", "approved")
    .gte("created_at", broadcastCreatedAt)
    .in("sitter_id", responderIds)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    console.warn("[broadcast] approved linked booking:", error.message);
    return null;
  }

  const id = data?.[0] && typeof (data[0] as { id?: string }).id === "string"
    ? String((data[0] as { id: string }).id)
    : "";
  return id ? { bookingId: id } : null;
}
