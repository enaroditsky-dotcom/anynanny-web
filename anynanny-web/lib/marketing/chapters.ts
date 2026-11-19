export const MARKETING_CHAPTERS = [
  { id: "home", navLabel: "פתיחה" },
  { id: "about", navLabel: "נעים להכיר. מה מביא אתכם לכאן?" },
  { id: "founder", navLabel: "בואו להכיר את AnyNanny" },
  { id: "life", navLabel: "פשוט למצוא זמן לחיים" },
  { id: "community", navLabel: "משני הצדדים של אותה דלת" },
  { id: "parents", navLabel: "להורים — קצת זמן לעצמכם" },
  { id: "sitters", navLabel: "לבייביסיטריות — מקום לעבודה הטובה שלכן" },
  { id: "app", navLabel: "בואו נציץ פנימה" },
  { id: "respect", navLabel: "כבוד וביטחון מתחילים בהדדיות" },
  { id: "together", navLabel: "רק התחלנו. בואו נצמח יחד" }
] as const;

export type MarketingChapterId = (typeof MARKETING_CHAPTERS)[number]["id"];

export const MARKETING_CHAPTER_IDS: MarketingChapterId[] = MARKETING_CHAPTERS.map(
  (chapter) => chapter.id
);

export function isMarketingChapterId(value: string | null | undefined): value is MarketingChapterId {
  return MARKETING_CHAPTER_IDS.includes(value as MarketingChapterId);
}

export const MARKETING_STORY_PATH = "/story";

/** In-story anchor that is not one of the ten chapters. */
export const MARKETING_STORY_EXTRA_ANCHOR = "charters";

export function chapterIdFromHash(hash: string): MarketingChapterId | null {
  const id = hash.replace(/^#/, "").trim();
  return isMarketingChapterId(id) ? id : null;
}

export function storyChapterHref(id: MarketingChapterId): string {
  return `${MARKETING_STORY_PATH}#${id}`;
}

/**
 * Chapter hashes, plus the in-page charter anchor, that used to live on `/`.
 * Auth and recovery fragments are not story anchors.
 */
export function storyAnchorFromHash(hash: string): string | null {
  const chapterId = chapterIdFromHash(hash);
  if (chapterId) return chapterId;
  const id = hash.replace(/^#/, "").trim();
  return id === MARKETING_STORY_EXTRA_ANCHOR ? id : null;
}

export function storyLocationForAnchor(anchor: string, search = ""): string {
  const query = !search || search === "?" ? "" : search.startsWith("?") ? search : `?${search}`;
  return `${MARKETING_STORY_PATH}${query}#${anchor}`;
}
