/**
 * Shared recipient rules for AnyNanny NOW and direct booking requests.
 *
 * Identity source of truth: profiles.identity_verification_status = 'verified'.
 * Favorites source of truth: parent_favorite_sitters (parent_id, sitter_id).
 * Sitter preference: sitter_profiles.only_verified_parents.
 *
 * The database functions in
 * supabase/migrations/20260930120000_request_trust_filters.sql
 * are the enforcement. These helpers mirror that logic for tests and must
 * not widen an empty match back to the full pool.
 */

export const SITTER_ONLY_VERIFIED_PARENTS_COLUMN = "only_verified_parents" as const;

export const NOW_BROADCAST_FAVORITES_ONLY_COLUMN = "favorites_only" as const;

export const NOW_BROADCAST_VERIFIED_SITTERS_ONLY_COLUMN = "verified_sitters_only" as const;

export const FILTER_NOW_BROADCASTS_FOR_CURRENT_SITTER_RPC =
  "filter_now_broadcasts_for_current_sitter" as const;

export const PARENT_MAY_REQUEST_SITTER_RPC = "parent_may_request_sitter" as const;

export const SITTER_ACCEPTS_VERIFIED_PARENTS_ONLY_MESSAGE =
  "הבייביסיטר מקבלת בקשות רק מהורים עם זהות מאומתת";

export const NOW_FAVORITES_ONLY_LABEL = "שלח רק לבייביסיטריות מועדפות";

export const NOW_VERIFIED_SITTERS_ONLY_LABEL = "שלח רק לבייביסיטריות עם זהות מאומתת";

export const SITTER_VERIFIED_PARENTS_ONLY_LABEL =
  "לקבל בקשות רק מהורים עם זהות מאומתת";

export const SITTER_VERIFIED_PARENTS_ONLY_HELP =
  "שימי לב: סינון זה עשוי לצמצם את כמות הפניות, אך הפניות שתקבלי יהיו רק מהורים עם זהות מאומתת.";

/** Highlighted phrase inside the parent booking block modal. */
export const VERIFIED_IDENTITY_PHRASE = "זהות מאומתת";

export const VERIFIED_PARENT_BOOKING_BLOCK_HELP =
  "זהות מאומתת של ההורה מעניקה לבייביסיטר תחושת ביטחון ואמון כבר לפני המפגש הראשון. יש בייביסיטריות שמעדיפות לקבל בקשות רק מהורים שעברו אימות זהות, ולכן מומלץ להשלים את האימות כדי להרחיב את מספר הבייביסיטריות הזמינות עבורך.";

/** Existing parent personal area, which opens IdentityVerificationForm. */
export const PARENT_IDENTITY_VERIFICATION_PATH = "/parent/profile";

export const PARENT_IDENTITY_VERIFICATION_QUERY = "verifyIdentity";

export function parentIdentityVerificationHref(): string {
  return `${PARENT_IDENTITY_VERIFICATION_PATH}?${PARENT_IDENTITY_VERIFICATION_QUERY}=1`;
}

export type NowRecipientCandidate = {
  sitterId: string;
  /** Working city contains the broadcast city. */
  cityMatch: boolean;
  isSelf: boolean;
  suspended: boolean;
  blocked: boolean;
  /** This parent has this sitter in parent_favorite_sitters. */
  isFavorite: boolean;
  /** profiles.identity_verification_status = 'verified' for the sitter. */
  sitterIdentityVerified: boolean;
  onlyVerifiedParents: boolean;
};

export type NowBroadcastAudience = {
  /** False when the parent row is missing or not exactly verified. */
  parentIdentityVerified: boolean;
  favoritesOnly: boolean;
  verifiedSittersOnly: boolean;
};

export function sitterAcceptsParentRequest(input: {
  onlyVerifiedParents: boolean;
  parentIdentityVerified: boolean;
}): boolean {
  if (!input.onlyVerifiedParents) return true;
  return input.parentIdentityVerified === true;
}

/**
 * One sitter against one NOW broadcast.
 * Favorites and verified-sitter flags are AND. An empty match is empty.
 */
export function sitterIsEligibleForNowBroadcast(
  sitter: NowRecipientCandidate,
  audience: NowBroadcastAudience
): boolean {
  if (!sitter.cityMatch) return false;
  if (sitter.isSelf) return false;
  if (sitter.suspended) return false;
  if (sitter.blocked) return false;
  if (audience.favoritesOnly && !sitter.isFavorite) return false;
  if (audience.verifiedSittersOnly && !sitter.sitterIdentityVerified) return false;
  if (
    !sitterAcceptsParentRequest({
      onlyVerifiedParents: sitter.onlyVerifiedParents,
      parentIdentityVerified: audience.parentIdentityVerified
    })
  ) {
    return false;
  }
  return true;
}

export function selectNowBroadcastRecipients<T extends NowRecipientCandidate>(
  sitters: readonly T[],
  audience: NowBroadcastAudience
): T[] {
  return sitters.filter((sitter) => sitterIsEligibleForNowBroadcast(sitter, audience));
}
