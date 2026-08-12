import type { ParentActiveBroadcast } from "@/lib/broadcast/parent-active-broadcast";

/**
 * UI warm-cache only — not the source of truth.
 * Lets the compact dock render immediately after minimize
 * (/parent/broadcast → dashboard) while the live fetch settles.
 */
const ACTIVE_SNAPSHOT_KEY = "anynanny_now_active_snapshot";

export function rememberActiveBroadcast(
  broadcast: ParentActiveBroadcast | null
): void {
  if (typeof window === "undefined") return;
  try {
    if (!broadcast) {
      sessionStorage.removeItem(ACTIVE_SNAPSHOT_KEY);
      return;
    }
    sessionStorage.setItem(
      ACTIVE_SNAPSHOT_KEY,
      JSON.stringify({
        id: broadcast.id,
        parent_id: broadcast.parent_id,
        city: broadcast.city,
        service_type: broadcast.service_type,
        status: broadcast.status,
        created_at: broadcast.created_at
      } satisfies ParentActiveBroadcast)
    );
  } catch {
    /* ignore */
  }
}

export function readRememberedActiveBroadcast(): ParentActiveBroadcast | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(ACTIVE_SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ParentActiveBroadcast>;
    if (
      typeof parsed.id !== "string" ||
      !parsed.id ||
      typeof parsed.parent_id !== "string" ||
      typeof parsed.city !== "string" ||
      typeof parsed.created_at !== "string" ||
      parsed.status !== "active"
    ) {
      return null;
    }
    return {
      id: parsed.id,
      parent_id: parsed.parent_id,
      city: parsed.city,
      service_type:
        typeof parsed.service_type === "string" ? parsed.service_type : "sitter",
      status: "active",
      created_at: parsed.created_at
    };
  } catch {
    return null;
  }
}
