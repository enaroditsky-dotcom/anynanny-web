import { welcomePlayedStorageKey } from "@/lib/welcome/constants";

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
