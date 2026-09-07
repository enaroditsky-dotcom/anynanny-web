import {
  PARENT_PRODUCT_TOUR_AUTO_OFFER_AFTER,
  PARENT_TOUR_ONBOARDING_PATH
} from "@/lib/product-tour/constants";
import { mergeParentTourRows } from "@/lib/product-tour/tour-row";
import type { UserProductTourRow } from "@/lib/product-tour/types";

export function isParentTourOnboardingPath(pathname: string): boolean {
  const path = pathname.split("?")[0] || pathname;
  return path === PARENT_TOUR_ONBOARDING_PATH || path.startsWith(`${PARENT_TOUR_ONBOARDING_PATH}/`);
}

export function isParentAppPath(pathname: string): boolean {
  const path = pathname.split("?")[0] || pathname;
  return path === "/parent" || path.startsWith("/parent/");
}

export function hasParentTourChoice(row: UserProductTourRow | null | undefined): boolean {
  if (!row) return false;
  return Boolean(
    row.offered_at || row.started_at || row.completed_at || row.declined_at || row.skipped_at
  );
}

export function isOnboardingCompletedAfterRollout(
  parentOnboardingCompletedAt: string | null | undefined,
  autoOfferAfterIso: string = PARENT_PRODUCT_TOUR_AUTO_OFFER_AFTER
): boolean {
  const completed = parentOnboardingCompletedAt?.trim();
  if (!completed) return false;
  const completedMs = Date.parse(completed);
  const rolloutMs = Date.parse(autoOfferAfterIso);
  if (!Number.isFinite(completedMs) || !Number.isFinite(rolloutMs)) return false;
  return completedMs >= rolloutMs;
}

export function shouldAutoOfferParentTour(input: {
  authenticated: boolean;
  role: "parent" | "sitter" | null;
  pathname: string;
  parentOnboardingCompletedAt: string | null | undefined;
  tour: UserProductTourRow | null | undefined;
  sessionTour?: UserProductTourRow | null | undefined;
  autoOfferAfterIso?: string;
}): boolean {
  if (!input.authenticated) return false;
  if (input.role !== "parent") return false;
  if (!isParentAppPath(input.pathname)) return false;
  if (isParentTourOnboardingPath(input.pathname)) return false;
  if (!isOnboardingCompletedAfterRollout(input.parentOnboardingCompletedAt, input.autoOfferAfterIso)) {
    return false;
  }
  if (hasParentTourChoice(mergeParentTourRows(input.tour, input.sessionTour))) return false;
  return true;
}

export function canRestartParentTour(input: {
  authenticated: boolean;
  role: "parent" | "sitter" | null;
}): boolean {
  return Boolean(input.authenticated && input.role === "parent");
}

export function matchesTourRoute(pathname: string, route: string, exact = false): boolean {
  const path = (pathname.split("?")[0] || pathname).replace(/\/+$/, "") || "/";
  const expected = route.replace(/\/+$/, "") || "/";
  if (exact) return path === expected;
  return path === expected || path.startsWith(`${expected}/`);
}
