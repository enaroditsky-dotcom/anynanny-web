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
