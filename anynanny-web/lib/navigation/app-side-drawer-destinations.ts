/**
 * Drawer destinations. Coming-soon rows are labels only: no href and no action.
 * Tour step ids match the existing product-tour selectors so the anchors can move
 * without changing tour completion or persistence.
 */

export type AppDrawerRole = "parent" | "sitter";

export type AppDrawerLinkItem = {
  id: "personal-area" | "settings" | "public-site";
  label: string;
  href: string;
  external?: boolean;
  tour?: "personal-area" | "settings" | "sitter-personal-area" | "sitter-settings";
};

export type AppDrawerSoonItem = {
  id: "offers" | "ai";
  label: string;
  soonLabel: "בקרוב";
  tone: "gold" | "muted";
};

export const ANYNANNY_PUBLIC_SITE_URL = "https://www.anynanny.org";

/** Set on <html> while a product-tour step is showing. Presentation only. */
export const APP_DRAWER_TOUR_STEP_ATTRIBUTE = "data-product-tour-step";

/** Marks the tour spotlight so it can stay up while a drawer anchor is the target. */
export const APP_DRAWER_TOUR_OVERLAY_SELECTOR = "[data-product-tour-overlay]";

const DRAWER_TOUR_STEP_IDS = new Set<string>([
  "personal-area",
  "settings",
  "sitter-personal-area",
  "sitter-settings"
]);

export function appDrawerLinks(role: AppDrawerRole): readonly AppDrawerLinkItem[] {
  const prefix = role === "sitter" ? "/sitter" : "/parent";
  const personalTour = role === "sitter" ? "sitter-personal-area" : "personal-area";
  const settingsTour = role === "sitter" ? "sitter-settings" : "settings";
  return [
    {
      id: "personal-area",
      label: "אזור אישי",
      href: `${prefix}/profile`,
      tour: personalTour
    },
    {
      id: "settings",
      label: "הגדרות",
      href: `${prefix}/settings`,
      tour: settingsTour
    },
    {
      id: "public-site",
      label: "לאתר AnyNanny",
      href: ANYNANNY_PUBLIC_SITE_URL,
      external: true
    }
  ];
}

export function appDrawerSoonItems(): readonly AppDrawerSoonItem[] {
  return [
    { id: "offers", label: "ANYNANNY-מבצעים וקופונים", soonLabel: "בקרוב", tone: "gold" },
    { id: "ai", label: "AnyNanny AI", soonLabel: "בקרוב", tone: "muted" }
  ];
}

export function isAppDrawerLinkActive(pathname: string, href: string, external?: boolean): boolean {
  if (external) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function isDrawerTourPresentationStep(stepId: string | null | undefined): boolean {
  return Boolean(stepId && DRAWER_TOUR_STEP_IDS.has(stepId));
}

/** True when the active tour step's target lives inside the drawer. */
export function readDrawerTourPresentationHold(): boolean {
  if (typeof document === "undefined") return false;
  return isDrawerTourPresentationStep(document.documentElement.getAttribute(APP_DRAWER_TOUR_STEP_ATTRIBUTE));
}
