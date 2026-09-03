/** Static public asset — loaded only by the Welcome video component. */
export const WELCOME_VIDEO_SRC = "/welcome/anynanny-welcome.mp4";

export const WELCOME_VIDEO_ARIA_LABEL = "סרטון ברוכים הבאים ל-AnyNanny";

export const WELCOME_HOMEPAGE_PLAY_LABEL = "הפעלת סרטון היכרות AnyNanny";

export const WELCOME_HOMEPAGE_REPLAY_LABEL = "צפייה חוזרת בסרטון AnyNanny";

/** ~10s video; allow load + playback without creating a dead-end. */
export const WELCOME_PLAYBACK_TIMEOUT_MS = 20_000;

/** If autoplay never starts, continue instead of blocking signup. */
export const WELCOME_AUTOPLAY_FALLBACK_MS = 4_000;

/** If currentTime stops advancing after playback started. */
export const WELCOME_STALL_FALLBACK_MS = 8_000;

export const WELCOME_PLAYED_STORAGE_PREFIX = "anynanny_welcome_played";

export function welcomePlayedStorageKey(userId: string): string {
  return `${WELCOME_PLAYED_STORAGE_PREFIX}:${userId}`;
}
