import type { PublicSitterSearchCard } from "@/lib/sitter/sitter-profile";
import { normalizeWorkingCities } from "@/lib/geo/israel-cities";
import { getSitterProfilesUserColumn } from "@/lib/sitter/sitter-profile";

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

export function normalizePublicSearchCard(raw: unknown): PublicSitterSearchCard | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const fk = getSitterProfilesUserColumn();
  const id = pickString(row, fk, "id", "user_id", "userId");
  if (!id) return null;

  const first = pickString(row, "first_name", "firstName");
  const last = pickString(row, "last_name", "lastName");

  return {
    id,
    first_name: first,
    last_name: last,
    display_name: pickString(row, "display_name", "displayName") ?? null,
    email: pickString(row, "email"),
    nanny_serial: pickString(row, "nanny_serial", "nannySerial"),
    years_experience: pickNumber(row, "years_experience", "yearsExperience"),
    has_car: row.has_car === true || row.has_car === "true",
    working_cities: normalizeWorkingCities(row.working_cities ?? row.workingCities),
    bio: pickString(row, "bio"),
    hourly_rate_nis: pickNumber(row, "hourly_rate_nis"),
    avg_rating: pickNumber(row, "avg_rating", "avgRating"),
    rating_count: pickNumber(row, "rating_count", "ratingCount") ?? 0,
    avatar_url: pickString(row, "avatar_url", "avatarUrl"),
    service_types: Array.isArray(row.service_types)
      ? row.service_types.map((v) => String(v).trim()).filter(Boolean)
      : Array.isArray(row.serviceTypes)
        ? row.serviceTypes.map((v) => String(v).trim()).filter(Boolean)
        : null
  };
}

export function parsePublicSearchCards(raw: unknown): PublicSitterSearchCard[] {
  if (raw == null) return [];
  let value: unknown = raw;
  if (typeof value === "string") {
    try { value = JSON.parse(value) as unknown; } catch { return []; }
  }
  if (!Array.isArray(value)) return [];
  return value.map(normalizePublicSearchCard).filter((c): c is PublicSitterSearchCard => c != null);
}

/** הלוגיקה המרכזית להצגת השם */
export function resolveSitterCardTitle(card: PublicSitterSearchCard): string {
  const first = card.first_name?.trim();
  const last = card.last_name?.trim();
  const combined = `${first ?? ""} ${last ?? ""}`.trim();
  if (combined) return combined;

  const display = card.display_name?.trim();
  if (display && display.toLowerCase() !== "user") return display;

  if (card.nanny_serial) return `נני מס' ${card.nanny_serial}`;

  return "בייביסיטר ללא שם";
}

export const PARENT_PLATFORM_FEE_MULTIPLIER = 1;

export function parentFacingHourlyRateNis(rate: number | null | undefined): number | null {
  if (rate == null || !Number.isFinite(rate) || rate <= 0) return null;
  return Math.round(rate);
}

export function formatHourlyRateNis(rate: number | null | undefined): string {
  if (rate == null || !Number.isFinite(rate) || rate <= 0) return "מחיר לא צוין";
  return `₪${Math.round(rate)} / שעה`;
}

export function formatParentFacingHourlyRateNis(rate: number | null | undefined): string {
  const baseRate = parentFacingHourlyRateNis(rate);
  if (baseRate == null) return "מחיר לא צוין";
  return `₪${baseRate} / שעה`;
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

export function isDisplayableSearchRating(avg: number | null | undefined): boolean {
  if (avg == null || !Number.isFinite(Number(avg))) return false;
  return Number(avg) > 0;
}

export function resolveSearchCardRating(card: PublicSitterSearchCard): { avg: number | null; count: number; } {
  const avgRaw = card.avg_rating;
  const avg = avgRaw != null && Number.isFinite(Number(avgRaw)) ? Number(avgRaw) : null;
  const countRaw = card.rating_count ?? 0;
  const count = Number.isFinite(Number(countRaw)) ? Math.max(0, Math.floor(Number(countRaw))) : 0;
  return { avg, count };
}

export function formatSearchCardRatingLine(card: PublicSitterSearchCard): string {
  const { avg, count } = resolveSearchCardRating(card);
  if (!isDisplayableSearchRating(avg)) return "אין דירוג עדיין";
  if (count > 0) return `${avg!.toFixed(1)} ★ (${count})`;
  return `${avg!.toFixed(1)} ★`;
}