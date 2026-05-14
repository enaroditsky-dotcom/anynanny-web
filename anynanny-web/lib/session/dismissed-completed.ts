"use client";

import { mapSupabaseRowToProtocol, type SessionProtocolState, type SupabaseSessionRow } from "@/lib/session/protocol";

const DISMISSED_COMPLETED_SESSION_KEY = "anynanny_dismissed_completed_session_id";
export function readDismissedCompletedSessionId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(DISMISSED_COMPLETED_SESSION_KEY);
  } catch {
    return null;
  }
}

export function dismissCompletedSession(sessionId: string) {
  try {
    localStorage.setItem(DISMISSED_COMPLETED_SESSION_KEY, String(sessionId));
  } catch {
    /* ignore */
  }
}

/** Latest DB row mapped for parent UI — hides a completed session the user already dismissed. */
export function parentSessionStateFromSupabaseRow(
  row: SupabaseSessionRow | null | undefined,
  dismissedCompletedSessionId: string | null
): SessionProtocolState | null {
  if (!row) return null;
  if (
    row.status === "completed" &&
    dismissedCompletedSessionId != null &&
    String(row.id) === dismissedCompletedSessionId
  ) {
    return { status: "idle" };
  }
  return mapSupabaseRowToProtocol(row);
}
