const STORAGE_KEY = "anynanny_password_recovery";

let recoveryEventSeen = false;

/** Records that Supabase emitted PASSWORD_RECOVERY in this browser tab. */
export function markPasswordRecoveryEvent(): void {
  recoveryEventSeen = true;
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, "1");
  } catch {
    /* ignore quota / private mode */
  }
}

export function hasPasswordRecoveryEvent(): boolean {
  if (recoveryEventSeen) return true;
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function clearPasswordRecoveryEvent(): void {
  recoveryEventSeen = false;
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
