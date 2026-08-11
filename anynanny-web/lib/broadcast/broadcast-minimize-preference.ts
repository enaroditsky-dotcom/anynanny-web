/** UI-only. Not the source of truth for whether a broadcast is active. */
const MINIMIZED_KEY = "anynanny_now_minimized";

export function isBroadcastMinimized(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(MINIMIZED_KEY) === "1";
  } catch {
    return false;
  }
}

export function setBroadcastMinimized(minimized: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (minimized) {
      sessionStorage.setItem(MINIMIZED_KEY, "1");
    } else {
      sessionStorage.removeItem(MINIMIZED_KEY);
    }
  } catch {
    /* ignore */
  }
}
