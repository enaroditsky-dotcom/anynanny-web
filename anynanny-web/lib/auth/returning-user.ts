import type { ProfileRole } from "@/lib/supabase/profiles";

/** localStorage flag: user has registered or logged in successfully on this device. */
export const RETURNING_USER_STORAGE_KEY = "is_returning_user";

/** Last email used for login/signup on this device (prefill returning-user → login). */
export const LAST_EMAIL_STORAGE_KEY = "anynanny_last_email";

/** Temporary role picked on home before entering auth (parent | sitter). */
export const USER_ROLE_CHOICE_KEY = "user_role_choice";

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

export function setUserRoleChoice(role: ProfileRole): void {
  try {
    localStorage.setItem(USER_ROLE_CHOICE_KEY, role);
  } catch {
    /* ignore quota */
  }
}

export function readUserRoleChoice(): ProfileRole | null {
  if (typeof window === "undefined") return null;
  try {
    const v = localStorage.getItem(USER_ROLE_CHOICE_KEY);
    return v === "parent" || v === "sitter" ? v : null;
  } catch {
    return null;
  }
}

export function clearUserRoleChoice(): void {
  try {
    localStorage.removeItem(USER_ROLE_CHOICE_KEY);
  } catch {
    /* ignore */
  }
}

/** Clears app hints on device (not Supabase session — call signOut separately when needed). */
export function clearDeviceAuthHints(): void {
  try {
    localStorage.removeItem(RETURNING_USER_STORAGE_KEY);
    localStorage.removeItem(LAST_EMAIL_STORAGE_KEY);
    localStorage.removeItem(USER_ROLE_CHOICE_KEY);
    localStorage.removeItem("active_role");
    localStorage.removeItem("anynanny_payer_session_v1");
  } catch {
    /* ignore */
  }
}
