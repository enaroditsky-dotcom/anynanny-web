/** localStorage flag: user has registered or logged in successfully on this device. */
export const RETURNING_USER_STORAGE_KEY = "is_returning_user";

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
