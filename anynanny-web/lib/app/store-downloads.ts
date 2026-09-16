export const STORE_DOWNLOAD_SOON_LABEL = "בקרוב";

export const APP_DOWNLOAD_HEADING = "הורידו את אפליקציית AnyNanny";
export const APP_DOWNLOAD_SUPPORTING_TEXT =
  "גישה נוחה ל־AnyNanny מכל מקום. בחרו את המכשיר שלכם והתחילו למצוא זמן לחיים.";

export type StorePlatformId = "android" | "iphone";

export type StoreDownloadOption = {
  id: StorePlatformId;
  label: string;
  /** Verified https store listing only. Null means the button must stay disabled. */
  href: string | null;
};

/**
 * Official store destinations. Keep href null until a real Play/App Store
 * listing URL is supplied. Do not invent URLs.
 */
export const STORE_DOWNLOADS: readonly StoreDownloadOption[] = [
  { id: "android", label: "Android", href: null },
  { id: "iphone", label: "iPhone", href: null }
];

const ALLOWED_STORE_HOSTS = new Set(["play.google.com", "apps.apple.com", "itunes.apple.com"]);

export function verifiedStoreHref(href: string | null | undefined): string | null {
  if (!href) return null;
  try {
    const url = new URL(href);
    if (url.protocol !== "https:") return null;
    return ALLOWED_STORE_HOSTS.has(url.hostname) ? href : null;
  } catch {
    return null;
  }
}
