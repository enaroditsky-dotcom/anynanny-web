/** Expert / consultant / doula profile helpers for `sitter_profiles`. */

import type { ExpertServiceKind } from "@/components/sitter/expert-service-icons";

export const EXPERT_ONLY_SERVICE_KINDS = [
  "lactation_consultant",
  "sleep_consultant",
  "doula"
] as const satisfies readonly ExpertServiceKind[];

export type ExpertOnlyServiceKind = (typeof EXPERT_ONLY_SERVICE_KINDS)[number];

export const EXPERT_BIO_MAX_LENGTH = 1500;

export const SERVICE_LOCATION_OPTIONS = [
  { id: "home_visit", labelHe: "הגעה עד בית הלקוח" },
  { id: "clinic", labelHe: "מפגש במשרד / קליניקה" },
  { id: "online", labelHe: "ייעוץ מרחוק / אונליין" }
] as const;

export type ServiceLocationId = (typeof SERVICE_LOCATION_OPTIONS)[number]["id"];

export type ExpertPricingModel = "hourly" | "package";

export type ExpertProfileDraft = {
  serviceType: ExpertOnlyServiceKind;
  serviceLocations: ServiceLocationId[];
  pricingModel: ExpertPricingModel;
  hourlyRateNis: string;
  packagePriceNis: string;
  bio: string;
  certifications: string;
};

export function emptyExpertProfileDraft(
  initialServiceType: ExpertOnlyServiceKind = "lactation_consultant"
): ExpertProfileDraft {
  return {
    serviceType: initialServiceType,
    serviceLocations: [],
    pricingModel: "hourly",
    hourlyRateNis: "",
    packagePriceNis: "",
    bio: "",
    certifications: ""
  };
}

export function isExpertOnlyServiceKind(value: string | null | undefined): value is ExpertOnlyServiceKind {
  return EXPERT_ONLY_SERVICE_KINDS.includes(value as ExpertOnlyServiceKind);
}

export function normalizeExpertServiceTypes(raw: unknown): ExpertServiceKind[] {
  const tokens: string[] = [];
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item === "string" && item.trim()) tokens.push(item.trim().toLowerCase());
    }
  } else if (typeof raw === "string" && raw.trim()) {
    tokens.push(
      ...raw
        .replace(/^\{|\}$/g, "")
        .split(",")
        .map((s) => s.trim().replace(/^"|"$/g, "").toLowerCase())
        .filter(Boolean)
    );
  }

  const out: ExpertServiceKind[] = [];
  for (const token of tokens) {
    if (token === "doula" && !out.includes("doula")) out.push("doula");
    else if (
      (token === "sleep_consultant" || token === "sleep") &&
      !out.includes("sleep_consultant")
    ) {
      out.push("sleep_consultant");
    } else if (
      (token === "lactation_consultant" || token === "lactation") &&
      !out.includes("lactation_consultant")
    ) {
      out.push("lactation_consultant");
    } else if ((token === "babysitter" || token === "sitter") && !out.includes("babysitter")) {
      out.push("babysitter");
    }
  }
  return out;
}

export function normalizeServiceLocations(raw: unknown): ServiceLocationId[] {
  const allowed = new Set<string>(SERVICE_LOCATION_OPTIONS.map((o) => o.id));
  const tokens: string[] = [];
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item === "string" && item.trim()) tokens.push(item.trim());
    }
  } else if (typeof raw === "string" && raw.trim()) {
    tokens.push(
      ...raw
        .replace(/^\{|\}$/g, "")
        .split(",")
        .map((s) => s.trim().replace(/^"|"$/g, ""))
        .filter(Boolean)
    );
  }
  const out: ServiceLocationId[] = [];
  for (const token of tokens) {
    if (allowed.has(token) && !out.includes(token as ServiceLocationId)) {
      out.push(token as ServiceLocationId);
    }
  }
  return out;
}

export function normalizePricingModel(raw: unknown): ExpertPricingModel {
  return raw === "package" ? "package" : "hourly";
}

export function clampExpertBio(bio: string): string {
  return bio.slice(0, EXPERT_BIO_MAX_LENGTH);
}

/** Build DB patch fields from an expert registration / edit draft. */
export function expertDraftToProfilePatch(draft: ExpertProfileDraft): Record<string, unknown> {
  const bio = clampExpertBio(draft.bio.trim());
  const certifications = draft.certifications.trim() || null;
  const service_types = [draft.serviceType];
  const service_locations = normalizeServiceLocations(draft.serviceLocations);
  const pricing_model = normalizePricingModel(draft.pricingModel);

  const hourly = Number(draft.hourlyRateNis);
  const packagePrice = Number(draft.packagePriceNis);

  return {
    service_types,
    service_locations,
    pricing_model,
    hourly_rate_nis:
      pricing_model === "hourly" && Number.isFinite(hourly) && hourly >= 0 ? Math.round(hourly) : null,
    package_price_nis:
      pricing_model === "package" && Number.isFinite(packagePrice) && packagePrice >= 0
        ? Math.round(packagePrice * 100) / 100
        : null,
    bio: bio || null,
    certifications
  };
}

export function validateExpertProfileDraft(draft: ExpertProfileDraft): string | null {
  if (!isExpertOnlyServiceKind(draft.serviceType)) {
    return "נא לבחור סוג שירות מקצועי.";
  }
  if (draft.serviceLocations.length === 0) {
    return "נא לבחור לפחות אפשרות אחת למיקום השירות.";
  }
  if (draft.pricingModel === "hourly") {
    const rate = Number(draft.hourlyRateNis);
    if (!Number.isFinite(rate) || rate <= 0) return "נא להזין מחיר שעתי תקין.";
  } else {
    const price = Number(draft.packagePriceNis);
    if (!Number.isFinite(price) || price <= 0) return "נא להזין מחיר גלובלי / חבילה תקין.";
  }
  if (!draft.bio.trim()) {
    return "נא למלא תיאור מקצועי (ביו).";
  }
  if (draft.bio.length > EXPERT_BIO_MAX_LENGTH) {
    return `התיאור מוגבל ל-${EXPERT_BIO_MAX_LENGTH} תווים.`;
  }
  return null;
}

export function profileHasExpertServiceTypes(raw: unknown): boolean {
  return normalizeExpertServiceTypes(raw).some((k) => isExpertOnlyServiceKind(k));
}
