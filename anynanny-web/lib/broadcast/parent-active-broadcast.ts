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

/**
 * Permanently close a paused Broadcast UI.
 * Only the current paused row can be updated — never an active one.
 * Uses existing terminal status `cancelled` so history/responses stay intact.
 * Prefer requestBroadcastStatusChange("cancel") from the browser.
 */
export async function closePausedBroadcastForParent(
  supabase: SupabaseClient,
  alertId: string,
  parentId: string
): Promise<{ error: string | null }> {
  const { data, error } = await supabase
    .from(BROADCAST_ALERTS_TABLE)
    .update({ status: "cancelled" })
    .eq("id", alertId)
    .eq("parent_id", parentId)
    .eq("status", "paused")
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[broadcast close]", {
      alertId,
      parentId,
      error
    });
    return { error: error.message };
  }
  if (!data) {
    return { error: "לא ניתן לסגור שידור שאינו במצב עצור." };
  }
  return { error: null };
}

/** End an active search after the sitter confirms the shift. Does not delete history. */
export async function markActiveBroadcastFilled(
  supabase: SupabaseClient,
  alertId: string,
  parentId: string
): Promise<{ error: string | null }> {
  const { data, error } = await supabase
    .from(BROADCAST_ALERTS_TABLE)
    .update({ status: "filled" })
    .eq("id", alertId)
    .eq("parent_id", parentId)
    .eq("status", ACTIVE_BROADCAST_STATUS)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[broadcast fill]", {
      alertId,
      parentId,
      error
    });
    return { error: error.message };
  }
  if (!data) {
    return { error: "broadcast fill affected 0 rows" };
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
  const { pendingIds } = await fetchBroadcastRequestStatuses(
    supabase,
    parentId,
    alertId,
    broadcastCreatedAt
  );
  return pendingIds;
}

/**
 * Radar available-list rule for a single alert:
 * the sitter positively responded to that alert AND has not declined
 * the parent's request for that same alert.
 *
 * Does not touch general availability, other alerts, or Search.
 */
export function filterAvailableBroadcastSitterIds(
  responderIds: readonly string[],
  declinedSitterIds: Iterable<string>
): string[] {
  const declined = new Set(
    [...declinedSitterIds].map((id) => String(id).trim()).filter(Boolean)
  );

  return [
    ...new Set(
      responderIds
        .map((id) => String(id).trim())
        .filter((id) => id.length > 0 && !declined.has(id))
    )
  ];
}

/**
 * Latest request outcome per responding sitter for this broadcast window.
 * Pending is used for "בקשה נשלחה". Rejected ids hide the sitter from this
 * alert's available list only. Rejected booking ids drive auto-minimize
 * to the dashboard rejection card (UI-only).
 */
export async function fetchBroadcastRequestStatuses(
  supabase: SupabaseClient,
  parentId: string,
  alertId: string,
  broadcastCreatedAt: string
): Promise<{
  pendingIds: string[];
  rejectedIds: string[];
  rejectedBookingIds: string[];
  availableIds: string[];
}> {
  const responderIds = await fetchBroadcastResponderIds(supabase, alertId);
  if (responderIds.length === 0) {
    return {
      pendingIds: [],
      rejectedIds: [],
      rejectedBookingIds: [],
      availableIds: []
    };
  }

  const { data, error } = await supabase
    .from("bookings")
    .select("id, sitter_id, status, created_at")
    .eq("parent_id", parentId)
    .in("status", ["pending", "rejected"])
    .gte("created_at", broadcastCreatedAt)
    .in("sitter_id", responderIds)
    .order("created_at", { ascending: false });

  if (error) {
    console.warn("[broadcast] request statuses:", error.message);
    return {
      pendingIds: [],
      rejectedIds: [],
      rejectedBookingIds: [],
      availableIds: responderIds
    };
  }

  const pendingIds: string[] = [];
  const rejectedIds: string[] = [];
  const rejectedBookingIds: string[] = [];
  const seenSitters = new Set<string>();

  for (const row of data ?? []) {
    const sitterId = String((row as { sitter_id?: string }).sitter_id ?? "").trim();
    const status = String((row as { status?: string }).status ?? "").trim();
    const bookingId = String((row as { id?: string }).id ?? "").trim();
    if (!sitterId) continue;

    if (status === "rejected" && bookingId) {
      rejectedBookingIds.push(bookingId);
    }

    if (seenSitters.has(sitterId)) continue;
    seenSitters.add(sitterId);
    if (status === "pending") pendingIds.push(sitterId);
    else if (status === "rejected") rejectedIds.push(sitterId);
  }

  return {
    pendingIds,
    rejectedIds,
    rejectedBookingIds,
    availableIds: filterAvailableBroadcastSitterIds(responderIds, rejectedIds)
  };
}

/**
 * Real sitter confirmation for this broadcast: a responder's booking
 * created after the broadcast started has been accepted (or progressed
 * past acceptance into the live/completed shift lifecycle).
 * Bookings have no broadcast_id; this uses existing columns only.
 *
 * IMPORTANT: after approval the booking often advances quickly to
 * sitter_started / parent_started ("המשמרת פעילה עכשיו"). Matching only
 * `approved` misses that window and leaves the search bar stuck.
 */
const BROADCAST_CONFIRMED_BOOKING_STATUSES = [
  "approved",
  "sitter_started",
  "parent_started",
  "sitter_ended",
  "completed"
] as const;

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
    .select("id, status")
    .eq("parent_id", parentId)
    .in("status", [...BROADCAST_CONFIRMED_BOOKING_STATUSES])
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
