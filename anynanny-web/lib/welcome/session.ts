import { welcomePlayedStorageKey } from "@/lib/welcome/constants";

export function signupWelcomeStorageKey(role: string): string {
  return welcomePlayedStorageKey(`signup:${role}`);
}

export function hasPlayedWelcomeVideo(userId: string): boolean {
  if (typeof window === "undefined" || !userId) return false;
  try {
    return window.sessionStorage.getItem(welcomePlayedStorageKey(userId)) === "1";
  } catch {
    return false;
  }
}

export function markWelcomeVideoPlayed(userId: string): void {
  if (typeof window === "undefined" || !userId) return;
  try {
    window.sessionStorage.setItem(welcomePlayedStorageKey(userId), "1");
  } catch {
    /* ignore quota */
  }
}

export function hasPlayedSignupWelcome(role: string): boolean {
  if (typeof window === "undefined" || !role) return false;
  try {
    return window.sessionStorage.getItem(signupWelcomeStorageKey(role)) === "1";
  } catch {
    return false;
  }
}

export function markSignupWelcomePlayed(role: string): void {
  if (typeof window === "undefined" || !role) return;
  try {
    window.sessionStorage.setItem(signupWelcomeStorageKey(role), "1");
  } catch {
    /* ignore quota */
  }
}
