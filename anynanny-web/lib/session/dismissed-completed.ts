"use client";

import { mapSupabaseRowToProtocol, type SessionProtocolState, type SupabaseSessionRow } from "@/lib/session/protocol";

export type CompletedSessionDismissRole = "parent" | "sitter";

function storageKey(role: CompletedSessionDismissRole) {
  return role === "parent"
    ? "anynanny_dismissed_completed_session_id_parent"
    : "anynanny_dismissed_completed_session_id_sitter";
}

export function readDismissedCompletedSessionId(role: CompletedSessionDismissRole): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(storageKey(role));
  } catch {
    return null;
  }
}

export function dismissCompletedSession(sessionId: string, role: CompletedSessionDismissRole) {
  try {
    localStorage.setItem(storageKey(role), String(sessionId));
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
