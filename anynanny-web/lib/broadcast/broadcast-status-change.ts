/**
 * Client helpers for broadcast lifecycle status transitions.
 * Minimize is intentionally NOT here — it must remain UI-only.
 */

export type BroadcastStatusAction = "pause" | "fill" | "cancel";

export type BroadcastStatusChangeResult = {
  ok: boolean;
  error: string | null;
  row: { id: string; status: string } | null;
};

/**
 * Prefer the shared API when present; otherwise call via the helpers
 * that perform a guarded Supabase update from the browser session.
 */
export async function requestBroadcastStatusChange(
  action: BroadcastStatusAction,
  alertId: string
): Promise<BroadcastStatusChangeResult> {
  try {
    const response = await fetch("/api/broadcast/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, alertId })
    });

    const payload = (await response.json().catch(() => null)) as
      | { error?: string; row?: { id: string; status: string } | null }
      | null;

    if (!response.ok) {
      return {
        ok: false,
        error: payload?.error ?? `HTTP ${response.status}`,
        row: null
      };
    }

    return {
      ok: true,
      error: null,
      row: payload?.row ?? null
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "network error",
      row: null
    };
  }
}
