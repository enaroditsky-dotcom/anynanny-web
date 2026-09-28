export const PARENT_FAVORITE_SITTERS_TABLE = "parent_favorite_sitters" as const;

export const FAVORITE_SITTER_NOTIFICATION_KIND = "favorite_sitter_added" as const;

export const FAVORITE_PROMPT_PRIMARY_LABEL = "הוסיפו למועדפות ❤️";
export const FAVORITE_PROMPT_SECONDARY_LABEL = "לא עכשיו";

export const PARENT_SEARCH_FAVORITES_ONLY_LABEL = "הצג רק בייביסיטריות מועדפות";
export const PARENT_FAVORITES_SEARCH_EMPTY =
  "אין כרגע בייביסיטריות מועדפות שמתאימות לחיפוש הזה.";

export const PARENT_FAVORITES_ACCORDION_TITLE = "❤️ הבייביסיטריות המועדפות שלי";
export const PARENT_FAVORITES_EMPTY_COPY =
  "עדיין אין בייביסיטריות מועדפות. אפשר להוסיף בייביסיטרית אחרי משמרת, או ישירות מכרטיס הבייביסיטרית.";

export const PARENT_SITTER_CALENDAR_BUTTON_LABEL = "📅 לראות את היומן";

export type FavoriteInsertClassification = {
  created: boolean;
  alreadyFavorite: boolean;
  notify: boolean;
  error: string | null;
};

export function favoriteSitterFamilyLabel(lastName: string | null | undefined): string {
  const last = String(lastName ?? "").trim();
  return last ? `משפחת ${last}` : "משפחה";
}

/** In-app body sent to the sitter only when a new favorite row is created. */
export function favoriteSitterNotificationBody(lastName: string | null | undefined): string {
  return `איזה כיף! 🎉 ${favoriteSitterFamilyLabel(lastName)} הוסיפה אותך לרשימת הבייביסיטריות המועדפות שלה ב-AnyNanny ❤️`;
}

export function favoritePromptMessage(sitterName: string | null | undefined): string {
  const name = String(sitterName ?? "").trim() || "הבייביסיטרית";
  return `הייתם רוצים להוסיף את ${name} לרשימת הבייביסיטריות המועדפות שלכם?`;
}

/** Ask only when this sitter is not already on the parent's list. */
export function shouldOfferFavoritePrompt(alreadyFavorite: boolean): boolean {
  return alreadyFavorite !== true;
}

export function isFavoriteUniqueViolation(code: string | null | undefined, message: string | null | undefined): boolean {
  if (String(code ?? "") === "23505") return true;
  return /duplicate key|unique constraint|parent_favorite_sitters_parent_sitter_key/i.test(
    String(message ?? "")
  );
}

/**
 * A successful insert creates the relationship and is the only case that notifies.
 * A unique violation means the favorite already exists: no second row, no notification.
 */
export function classifyFavoriteInsert(input: {
  errorCode?: string | null;
  errorMessage?: string | null;
}): FavoriteInsertClassification {
  if (!input.errorCode && !input.errorMessage) {
    return { created: true, alreadyFavorite: false, notify: true, error: null };
  }
  if (isFavoriteUniqueViolation(input.errorCode, input.errorMessage)) {
    return { created: false, alreadyFavorite: true, notify: false, error: null };
  }
  return {
    created: false,
    alreadyFavorite: false,
    notify: false,
    error: String(input.errorMessage ?? "").trim() || "לא ניתן לשמור את הבייביסיטרית במועדפות."
  };
}

/** Removing a favorite never notifies the sitter. */
export function favoriteRemovalNotifies(): false {
  return false;
}

export function applyFavoritesOnlyFilter<T extends { id: string }>(
  cards: readonly T[],
  favoriteIds: ReadonlySet<string> | readonly string[],
  favoritesOnly: boolean
): T[] {
  if (!favoritesOnly) return [...cards];
  const ids = favoriteIds instanceof Set ? favoriteIds : new Set(favoriteIds);
  return cards.filter((card) => ids.has(card.id));
}

export function parentFavoritesSearchEmptyMessage(favoritesOnly: boolean, resultCount: number): string | null {
  if (!favoritesOnly || resultCount > 0) return null;
  return PARENT_FAVORITES_SEARCH_EMPTY;
}
