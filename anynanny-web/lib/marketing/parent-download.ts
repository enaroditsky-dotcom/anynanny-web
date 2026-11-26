import {
  GOOGLE_PLAY_LISTING_URL,
  IPHONE_APP_STORE_URL,
  withStoreCampaign
} from "@/lib/marketing/site-nav";
import { readStudentJobsUtm, utmSearchFromRecord as readUtmSearchFromRecord } from "@/lib/marketing/student-jobs";

export const DOWNLOAD_LANDING_PATH = "/download";
export const DOWNLOAD_LANDING_CANONICAL = "https://www.anynanny.org/download";

export const DOWNLOAD_LANDING_TITLE = "הורדת AnyNanny | App Store ו-Google Play";
export const DOWNLOAD_LANDING_DESCRIPTION =
  "הורידו את AnyNanny להורים. האפליקציה זמינה ב-Google Play וב-App Store.";
export const DOWNLOAD_LANDING_H1 = "הורדת AnyNanny";

export const DOWNLOAD_LANDING_APP_STORE_LABEL = "הורדת AnyNanny ב-App Store";
export const DOWNLOAD_LANDING_GOOGLE_PLAY_LABEL = "הורדת AnyNanny ב-Google Play";

export const DOWNLOAD_LANDING_APP_STORE_URL = IPHONE_APP_STORE_URL;
export const DOWNLOAD_LANDING_GOOGLE_PLAY_URL = GOOGLE_PLAY_LISTING_URL;

/** Original approved poster. Served as-is from the marketing public folder. */
export const DOWNLOAD_LANDING_POSTER_SRC = "/SEO pages/פוסטר AnyNanny למציאת בייביסיטר.png";
export const DOWNLOAD_LANDING_POSTER_ALT =
  "פוסטר AnyNanny: מחפשים בייביסיטר? הורידו את האפליקציה ב-App Store או ב-Google Play";
export const DOWNLOAD_LANDING_POSTER_WIDTH = 1254;
export const DOWNLOAD_LANDING_POSTER_HEIGHT = 1254;

export const DOWNLOAD_LANDING_OG_URL = `https://www.anynanny.org${encodeURI(DOWNLOAD_LANDING_POSTER_SRC)}`;

export const DOWNLOAD_CLICK_EVENT = "store_download_click";
export const DOWNLOAD_CLICK_PATH = "/api/marketing/download-click";

export type DownloadStorePlatform = "app_store" | "google_play";

/**
 * Physical boxes on the 1254×1254 poster, as percentages of the image.
 * App Store is the left badge (x 220–608, y 1087–1205).
 * Google Play is the right badge (x 643–1033, y 1087–1205).
 * `left` is the physical left edge. RTL must not swap these boxes.
 */
export const DOWNLOAD_STORE_HIT_BOXES: Record<
  DownloadStorePlatform,
  { left: number; top: number; width: number; height: number }
> = {
  app_store: { left: 17.544, top: 86.683, width: 31.021, height: 9.49 },
  google_play: { left: 51.276, top: 86.683, width: 31.18, height: 9.49 }
};

export type DownloadStoreClickEvent = {
  event: typeof DOWNLOAD_CLICK_EVENT;
  platform: DownloadStorePlatform;
  source?: string;
  medium?: string;
  campaign?: string;
  content?: string;
  term?: string;
};

const CLICK_UTM_FIELDS = [
  ["utm_source", "source"],
  ["utm_medium", "medium"],
  ["utm_campaign", "campaign"],
  ["utm_content", "content"],
  ["utm_term", "term"]
] as const;

export function utmSearchFromRecord(
  params: Record<string, string | string[] | undefined>
): URLSearchParams {
  return readUtmSearchFromRecord(params);
}

export function downloadAppStoreHref(search: string | URLSearchParams = ""): string {
  return withStoreCampaign(DOWNLOAD_LANDING_APP_STORE_URL, search);
}

export function downloadGooglePlayHref(search: string | URLSearchParams = ""): string {
  return withStoreCampaign(DOWNLOAD_LANDING_GOOGLE_PLAY_URL, search);
}

/** Campaign fields only. Tokens, codes, and any other query keys are dropped. */
export function buildDownloadStoreClickEvent(
  platform: DownloadStorePlatform,
  search: string | URLSearchParams = ""
): DownloadStoreClickEvent {
  const utm = readStudentJobsUtm(search);
  const event: DownloadStoreClickEvent = {
    event: DOWNLOAD_CLICK_EVENT,
    platform
  };
  for (const [queryKey, field] of CLICK_UTM_FIELDS) {
    const value = utm.get(queryKey);
    if (value) event[field] = value;
  }
  return event;
}

const MAX_CLICK_SEARCH_LENGTH = 1500;

/** Accepts only a store platform and a query string. Extra fields are ignored. */
export function parseDownloadClickRequest(body: unknown): DownloadStoreClickEvent | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  const platform = record.platform;
  if (platform !== "app_store" && platform !== "google_play") return null;
  if (record.search !== undefined && typeof record.search !== "string") return null;
  const search = typeof record.search === "string" ? record.search.slice(0, MAX_CLICK_SEARCH_LENGTH) : "";
  return buildDownloadStoreClickEvent(platform, search);
}

export function buildDownloadLandingStructuredData() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${DOWNLOAD_LANDING_CANONICAL}#webpage`,
        url: DOWNLOAD_LANDING_CANONICAL,
        name: DOWNLOAD_LANDING_TITLE,
        description: DOWNLOAD_LANDING_DESCRIPTION,
        inLanguage: "he",
        primaryImageOfPage: DOWNLOAD_LANDING_OG_URL,
        image: DOWNLOAD_LANDING_OG_URL
      }
    ]
  };
}
