export const MARKETING_CHAPTERS = [
  { id: "home", navLabel: "פתיחה" },
  { id: "about", navLabel: "מה זה AnyNanny?" },
  { id: "founder", navLabel: "הסיפור שלי" },
  { id: "community", navLabel: "הקהילה שלנו" },
  { id: "parents", navLabel: "להורים" },
  { id: "sitters", navLabel: "לבייביסיטריות" },
  { id: "app", navLabel: "הצצה לאפליקציה" },
  { id: "respect", navLabel: "כבוד וביטחון" },
  { id: "profile", navLabel: "נעים להכיר" },
  { id: "together", navLabel: "גדלים יחד" }
] as const;

export type MarketingChapterId = (typeof MARKETING_CHAPTERS)[number]["id"];

export const MARKETING_CHAPTER_IDS: MarketingChapterId[] = MARKETING_CHAPTERS.map(
  (chapter) => chapter.id
);

export function isMarketingChapterId(value: string | null | undefined): value is MarketingChapterId {
  return MARKETING_CHAPTER_IDS.includes(value as MarketingChapterId);
}

export function chapterIdFromHash(hash: string): MarketingChapterId | null {
  const id = hash.replace(/^#/, "").trim();
  return isMarketingChapterId(id) ? id : null;
}
