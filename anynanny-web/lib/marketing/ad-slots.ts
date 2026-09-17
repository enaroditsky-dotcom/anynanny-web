/**
 * AnyNanny advertising infrastructure (ad-ready, not activated).
 *
 * First-party slot configuration only. Do not load ad-network scripts, pixels,
 * cookies, or tracking from this module. Activation requires flipping both the
 * master switch and an individual placement — and a privacy/consent review
 * before any personalized or third-party advertising.
 *
 * Rules (also documented in docs/advertising-infrastructure.md):
 * - Sponsored content must always be clearly labeled.
 * - Ads must never look like nanny profiles, user reviews, safety guidance,
 *   or AnyNanny editorial recommendations.
 * - No intrusive popups.
 * - No autoplay advertising.
 * - No full-screen interstitials (`marketing_story_interstitial` is in-flow only).
 * - Mobile usability must be preserved.
 * - Page performance and Core Web Vitals must be protected.
 * - Future personalized advertising or tracking must require a separate
 *   privacy/consent review before activation.
 */

export const ADVERTISING_MASTER_ENABLED = false;

export const AD_NETWORK_INTEGRATION = "none" as const;

export const SPONSORED_LABEL = "ממומן";
export const SPONSORED_ACCESSIBILITY_LABEL = "תוכן ממומן";

export const ADVERTISING_RULES = [
  "Sponsored content must always be clearly labeled.",
  "Ads must never look like nanny profiles, user reviews, safety guidance, or AnyNanny editorial recommendations.",
  "No intrusive popups.",
  "No autoplay advertising.",
  "No full-screen interstitials.",
  "Mobile usability must be preserved.",
  "Page performance and Core Web Vitals must be protected.",
  "Future personalized advertising or tracking must require a separate privacy/consent review before activation."
] as const;

export const AD_PLACEMENT_IDS = [
  "knowledge_article_inline",
  "knowledge_article_bottom",
  "community_sponsor",
  "marketplace_sponsored",
  "marketing_story_interstitial",
  "faq_sponsor"
] as const;

export type AdPlacementId = (typeof AD_PLACEMENT_IDS)[number];

/**
 * Visual size keys. `section-break` is an in-article / in-story gap — never a
 * full-screen overlay.
 */
export type AdSlotVariant =
  | "inline"
  | "bottom"
  | "sponsor"
  | "sponsored-card"
  | "section-break";

export type AdSlotSize = {
  minHeightPx: number;
  maxWidthClass: string;
};

export const AD_SLOT_VARIANT_SIZES: Record<AdSlotVariant, AdSlotSize> = {
  inline: {
    minHeightPx: 90,
    maxWidthClass: "w-full max-w-md sm:max-w-lg"
  },
  bottom: {
    minHeightPx: 120,
    maxWidthClass: "w-full max-w-md sm:max-w-lg"
  },
  sponsor: {
    minHeightPx: 88,
    maxWidthClass: "w-full max-w-md sm:max-w-lg"
  },
  "sponsored-card": {
    minHeightPx: 140,
    maxWidthClass: "w-full max-w-md sm:max-w-lg"
  },
  "section-break": {
    minHeightPx: 100,
    maxWidthClass: "w-full max-w-md sm:max-w-lg"
  }
};

export type AdSlotDefinition = {
  id: AdPlacementId;
  /** Per-placement switch. Still hidden unless the master switch is also on. */
  enabled: boolean;
  variant: AdSlotVariant;
  surface: AdAllowedSurfaceId;
};

export const AD_ALLOWED_SURFACE_IDS = [
  "knowledge_article",
  "faq",
  "community",
  "marketplace",
  "marketing_story"
] as const;

export type AdAllowedSurfaceId = (typeof AD_ALLOWED_SURFACE_IDS)[number];

export const AD_FORBIDDEN_SURFACE_IDS = [
  "login",
  "registration",
  "onboarding",
  "booking",
  "payments",
  "identity_verification",
  "safety_reporting"
] as const;

export type AdForbiddenSurfaceId = (typeof AD_FORBIDDEN_SURFACE_IDS)[number];

/**
 * Product-critical paths that must never host advertising. The public root is
 * currently the login/register landing, so `/` is also excluded.
 */
export const AD_FORBIDDEN_PATH_PREFIXES = [
  "/login",
  "/register",
  "/auth",
  "/parent/onboarding",
  "/sitter/onboarding",
  "/welcome",
  "/charter",
  "/parent/checkout",
  "/billing",
  "/identity",
  "/verify",
  "/session",
  "/parent/search",
  "/parent/sitter",
  "/parent/calendar",
  "/parent/broadcast",
  "/sitter/shifts",
  "/sitter/session",
  "/admin/reports"
] as const;

function slot(
  id: AdPlacementId,
  variant: AdSlotVariant,
  surface: AdAllowedSurfaceId
): AdSlotDefinition {
  return { id, enabled: false, variant, surface };
}

export const AD_SLOT_REGISTRY: Record<AdPlacementId, AdSlotDefinition> = {
  knowledge_article_inline: slot("knowledge_article_inline", "inline", "knowledge_article"),
  knowledge_article_bottom: slot("knowledge_article_bottom", "bottom", "knowledge_article"),
  community_sponsor: slot("community_sponsor", "sponsor", "community"),
  marketplace_sponsored: slot("marketplace_sponsored", "sponsored-card", "marketplace"),
  marketing_story_interstitial: slot(
    "marketing_story_interstitial",
    "section-break",
    "marketing_story"
  ),
  faq_sponsor: slot("faq_sponsor", "sponsor", "faq")
};

export function getAdSlotConfig(placement: AdPlacementId): AdSlotDefinition {
  return AD_SLOT_REGISTRY[placement];
}

export function isAdvertisingMasterEnabled(): boolean {
  return ADVERTISING_MASTER_ENABLED;
}

export function isAdSlotEnabled(placement: AdPlacementId): boolean {
  return ADVERTISING_MASTER_ENABLED && AD_SLOT_REGISTRY[placement].enabled;
}

export function listEnabledAdPlacements(): AdPlacementId[] {
  return AD_PLACEMENT_IDS.filter((id) => isAdSlotEnabled(id));
}

export function isPathAllowedForAdvertising(pathname: string): boolean {
  const path = (pathname.split("?")[0] || pathname).replace(/\/+$/, "") || "/";
  if (path === "/") return false;
  return !AD_FORBIDDEN_PATH_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`)
  );
}

export type HiddenAdSlotView = {
  visible: false;
  placement: AdPlacementId;
};

export type VisibleAdSlotView = {
  visible: true;
  placement: AdPlacementId;
  variant: AdSlotVariant;
  minHeightPx: number;
  maxWidthClass: string;
  sponsoredLabel: string;
  accessibilityLabel: string;
};

export type AdSlotView = HiddenAdSlotView | VisibleAdSlotView;

/**
 * Resolve whether a slot should occupy layout. Hidden slots reserve no space
 * and must not render a placeholder box.
 */
export function resolveAdSlotView(
  placement: AdPlacementId,
  variantOverride?: AdSlotVariant
): AdSlotView {
  if (!isAdSlotEnabled(placement)) {
    return { visible: false, placement };
  }

  const variant = variantOverride ?? AD_SLOT_REGISTRY[placement].variant;
  const size = AD_SLOT_VARIANT_SIZES[variant];

  return {
    visible: true,
    placement,
    variant,
    minHeightPx: size.minHeightPx,
    maxWidthClass: size.maxWidthClass,
    sponsoredLabel: SPONSORED_LABEL,
    accessibilityLabel: SPONSORED_ACCESSIBILITY_LABEL
  };
}
