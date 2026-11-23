import { parseParentAddress } from "@/lib/parent/parent-profile";
import type { PublicUserReview } from "@/lib/ratings/fetch-user-rating-summary";

/**
 * Fields a babysitter sees on the parent card before any booking discloses a street.
 * The assigned-sitter preview route also leaves children counts empty, and never
 * returns medical details, identity numbers, or verification media.
 */
export type OwnParentProfileCardProjection = {
  first_name: string | null;
  avatar_url: string | null;
  rating_average: number;
  rating_count: number;
  reviews: Array<{
    rating: number;
    comment: string;
    created_at: string;
  }>;
  children_count: null;
  children_ages: null;
  identity_verified: boolean;
  /** City only. Street, house number, and entry notes are never copied here. */
  city: string | null;
  address: null;
  address_visible: false;
};

/**
 * City from the parent's own profile row.
 * A structured address contributes its city field only.
 * A plain address string is ignored because it can contain the street.
 */
export function parentProfileCityOnly(row: unknown): string | null {
  const record =
    row && typeof row === "object" ? (row as Record<string, unknown>) : {};
  const structured =
    record.address && typeof record.address === "object"
      ? parseParentAddress(record.address).city.trim()
      : "";
  const columnCity = typeof record.city === "string" ? record.city.trim() : "";
  return structured || columnCity || null;
}

export function projectOwnParentProfileCard(input: {
  firstName: string;
  avatarUrl: string | null;
  ratingAverage: number;
  ratingCount: number;
  identityVerified: boolean;
  reviews: readonly PublicUserReview[];
  city?: string | null;
}): OwnParentProfileCardProjection {
  const firstName = input.firstName.trim();
  const avatarUrl = input.avatarUrl?.trim() || "";

  return {
    first_name: firstName || null,
    avatar_url: avatarUrl || null,
    rating_average: input.ratingAverage,
    rating_count: input.ratingCount,
    reviews: input.reviews.map((review) => ({
      rating: review.rating,
      comment: review.comment,
      created_at: review.created_at
    })),
    children_count: null,
    children_ages: null,
    identity_verified: input.identityVerified === true,
    city: input.city?.trim() || null,
    address: null,
    address_visible: false
  };
}
