import { isIdentityVerified, parseIdentityVerificationStatus } from "@/lib/identity/identity-verification";
import { interpretProductProfileOwnership } from "@/lib/auth/product-profiles";
import { hasSitterCompletedOnboarding } from "@/lib/sitter/sitter-profile";

export const BROADCAST_AUDIENCE_TYPES = [
  "all_users",
  "parents",
  "sitters",
  "identity_unverified",
  "identity_verified",
  "profile_incomplete",
  "profile_complete"
] as const;

export type BroadcastAudienceType = (typeof BROADCAST_AUDIENCE_TYPES)[number];

export const BROADCAST_AUDIENCE_LABELS: Record<BroadcastAudienceType, string> = {
  all_users: "כל המשתמשים",
  parents: "הורים בלבד",
  sitters: "נני בלבד",
  identity_unverified: "משתמשים שלא אימתו זהות",
  identity_verified: "משתמשים שאימתו זהות",
  profile_incomplete: "פרופיל לא הושלם",
  profile_complete: "פרופיל הושלם"
};

export function isBroadcastAudienceType(value: unknown): value is BroadcastAudienceType {
  return (
    typeof value === "string" &&
    (BROADCAST_AUDIENCE_TYPES as readonly string[]).includes(value)
  );
}

/**
 * Fixture row used to unit-test the same rules as the SQL RPC.
 * Fields are the authoritative product columns — not UI labels.
 */
export type BroadcastAudienceProfile = {
  id: string;
  role: string | null;
  parent_onboarding_completed_at: string | null;
  sitter_onboarding_completed_at: string | null;
  identity_verification_status: string | null;
};

function ownershipOf(row: BroadcastAudienceProfile) {
  return interpretProductProfileOwnership({
    role: row.role,
    parent_onboarding_completed_at: row.parent_onboarding_completed_at,
    sitter_onboarding_completed_at: hasSitterCompletedOnboarding({
      onboarding_completed_at: row.sitter_onboarding_completed_at
    })
      ? row.sitter_onboarding_completed_at
      : null
  });
}

function primaryRoleOnboardingComplete(row: BroadcastAudienceProfile): boolean {
  const ownership = ownershipOf(row);
  if (ownership.role === "parent") return ownership.parentOnboardingComplete;
  if (ownership.role === "sitter") return ownership.sitterOnboardingComplete;
  return false;
}

/**
 * Audience membership.
 *
 * - all_users: every profiles row
 * - parents: product ownership hasParent (profiles.role = parent OR parent_onboarding_completed_at set)
 * - sitters: product ownership hasSitter (profiles.role = sitter OR sitter onboarding completed)
 * - identity_verified: profiles.identity_verification_status = 'verified'
 * - identity_unverified: any other identity status (unverified / pending / failed / null)
 * - profile_complete / incomplete: onboarding for the primary profiles.role only
 *   (parent → parent_onboarding_completed_at; sitter → sitter_profiles.onboarding_completed_at).
 *   Dual-role second product is not used for this pair.
 */
export function profileMatchesBroadcastAudience(
  row: BroadcastAudienceProfile,
  audience: BroadcastAudienceType
): boolean {
  const ownership = ownershipOf(row);
  const identityVerified = isIdentityVerified(
    parseIdentityVerificationStatus(row.identity_verification_status)
  );

  switch (audience) {
    case "all_users":
      return true;
    case "parents":
      return ownership.hasParent;
    case "sitters":
      return ownership.hasSitter;
    case "identity_verified":
      return identityVerified;
    case "identity_unverified":
      return !identityVerified;
    case "profile_complete":
      return primaryRoleOnboardingComplete(row);
    case "profile_incomplete":
      return !primaryRoleOnboardingComplete(row);
    default:
      return false;
  }
}

export function countBroadcastAudience(
  rows: BroadcastAudienceProfile[],
  audience: BroadcastAudienceType
): number {
  return rows.filter((row) => profileMatchesBroadcastAudience(row, audience)).length;
}

export function recipientIdsForBroadcastAudience(
  rows: BroadcastAudienceProfile[],
  audience: BroadcastAudienceType
): string[] {
  return rows.filter((row) => profileMatchesBroadcastAudience(row, audience)).map((row) => row.id);
}
