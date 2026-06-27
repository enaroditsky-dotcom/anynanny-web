import type { PublicSitterSearchCard } from "@/lib/sitter/sitter-profile";
import { normalizeWorkingCities } from "@/lib/geo/israel-cities";
import { getSitterProfilesUserColumn } from "@/lib/sitter/sitter-profile";

/** Canonical column: `public.sitter_profiles.hourly_rate_nis` (app + RPC). */
export const SITTER_PROFILES_HOURLY_RATE_COLUMN = "hourly_rate_nis" as const;

function pickString(row: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const v = row[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function pickNumber(row: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    const v = row[key];
    if (v === null || v === undefined || v === "") continue;
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string") {
      const cleaned = v.replace(/[^\d.]/g, "");
      if (!cleaned) continue;
      const n = Number(cleaned);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

/** Normalize `list_public_sitters_search` rows (handles snake_case / camelCase drift). */
export function normalizePublicSearchCard(raw: unknown): PublicSitterSearchCard | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const fk = getSitterProfilesUserColumn();
  const id = pickString(row, fk, "id", "user_id", "userId");
  if (!id) return null;

  return {
    id,
    full_name: pickString(row, "full_name", "fullName"),
    display_name: pickString(row, "display_name", "displayName") ?? null,
    email: pickString(row, "email"),
    nanny_serial: pickString(row, "nanny_serial", "nannySerial"),
    years_experience: pickNumber(row, "years_experience", "yearsExperience"),
    has_car: row.has_car === true || row.has_car === "true",
    working_cities: normalizeWorkingCities(row.working_cities ?? row.workingCities),
    bio: pickString(row, "bio"),
    /** Only `sitter_profiles.hourly_rate_nis` — do not map legacy `hourly_rate` (may hold stale test values). */
    hourly_rate_nis: pickNumber(row, "hourly_rate_nis"),
    /** Same field names as `get_sitter_profile_public` / profile page. */
    avg_rating: pickNumber(row, "avg_rating", "avgRating"),
    rating_count: pickNumber(row, "rating_count", "ratingCount") ?? 0,
    avatar_url: pickString(row, "avatar_url", "avatarUrl")
  };
}

export function parsePublicSearchCards(raw: unknown): PublicSitterSearchCard[] {
  if (raw == null) return [];
  let value: unknown = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value) as unknown;
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];
  return value.map(normalizePublicSearchCard).filter((c): c is PublicSitterSearchCard => c != null);
}

/** Title: prefer sitter_profiles.full_name, then RPC display_name, then email, then Hebrew fallback. */
export function resolveSitterCardTitle(card: PublicSitterSearchCard): string {
  const full = card.full_name?.trim();
  if (full) return full;

  const display = card.display_name?.trim();
  if (display && display.toLowerCase() !== "user") return display;

  const email = card.email?.trim();
  if (email) {
    const local = email.split("@")[0]?.trim();
    if (local) return local;
    return email;
  }

  if (display) return display;
  return "בייביסיטר ללא שם";
}

/** Flat 10% platform fee on sitter base rate shown to parents. */
export const PARENT_PLATFORM_FEE_MULTIPLIER = 1.1;

/** Parent-facing hourly rate (base sitter rate + 10% platform fee). */
export function parentFacingHourlyRateNis(rate: number | null | undefined): number | null {
  if (rate == null || !Number.isFinite(rate) || rate <= 0) return null;
  return Math.round(rate * PARENT_PLATFORM_FEE_MULTIPLIER);
}

/** Display label from `hourly_rate_nis` only — no defaults, no other columns. */
export function formatHourlyRateNis(rate: number | null | undefined): string {
  if (rate == null || !Number.isFinite(rate) || rate <= 0) {
    return "מחיר לא צוין";
  }
  return `₪${Math.round(rate)} / שעה`;
}

/** Parent search cards: sitter base rate with 10% platform fee included. */
export function formatParentFacingHourlyRateNis(rate: number | null | undefined): string {
  const withFee = parentFacingHourlyRateNis(rate);
  if (withFee == null) return "מחיר לא צוין";
  return `₪${withFee} / שעה`;
}

export function experienceBadgeLabel(years: number | null | undefined): string {
  if (years == null || years < 0) return "ניסיון לא צוין";
  return `${years} שנות ניסיון`;
}

export function transportBadgeLabel(hasCar: boolean): string {
  return hasCar ? "עצמאית" : "צריכה מונית";
}

export function formatSearchCardWorkingCities(cities: readonly string[] | null | undefined): string {
  const normalized = normalizeWorkingCities(cities ?? []);
  if (normalized.length === 0) return "לא הוגדרו אזורי שירות";
  return normalized.join(", ");
}

export function bioExcerpt(text: string | null | undefined, max = 120): string {
  if (!text) return "";
  const t = text.trim();
  if (!t) return "";
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

/** True when avg is a real rating (not null, not zero). */
export function isDisplayableSearchRating(avg: number | null | undefined): boolean {
  if (avg == null || !Number.isFinite(Number(avg))) return false;
  return Number(avg) > 0;
}

/** Resolve rating fields — matches profile page (`avg_rating` + `rating_count`). */
export function resolveSearchCardRating(card: PublicSitterSearchCard): {
  avg: number | null;
  count: number;
} {
  const avgRaw = card.avg_rating;
  const avg =
    avgRaw != null && Number.isFinite(Number(avgRaw)) ? Number(avgRaw) : null;
  const countRaw = card.rating_count ?? 0;
  const count = Number.isFinite(Number(countRaw))
    ? Math.max(0, Math.floor(Number(countRaw)))
    : 0;
  return { avg, count };
}

export function formatSearchCardRatingLine(card: PublicSitterSearchCard): string {
  const { avg, count } = resolveSearchCardRating(card);
  if (!isDisplayableSearchRating(avg)) return "אין דירוג עדיין";
  if (count > 0) return `${avg!.toFixed(1)} ★ (${count})`;
  return `${avg!.toFixed(1)} ★`;
}
