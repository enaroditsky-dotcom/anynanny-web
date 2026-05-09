/** localStorage flag: user has registered or logged in successfully on this device. */
export const RETURNING_USER_STORAGE_KEY = "is_returning_user";

/** Last email used for login/signup on this device (prefill returning-user → login). */
export const LAST_EMAIL_STORAGE_KEY = "anynanny_last_email";

export function setReturningUserFlag(): void {
  try {
    localStorage.setItem(RETURNING_USER_STORAGE_KEY, "true");
  } catch {
    /* ignore quota */
  }
}

export function readReturningUserFlag(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(RETURNING_USER_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function saveLastUsedEmail(email: string): void {
  const trimmed = email.trim();
  if (!trimmed) return;
  try {
    localStorage.setItem(LAST_EMAIL_STORAGE_KEY, trimmed);
  } catch {
    /* ignore quota */
  }
}

export function readLastUsedEmail(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const v = localStorage.getItem(LAST_EMAIL_STORAGE_KEY);
    return v && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}
