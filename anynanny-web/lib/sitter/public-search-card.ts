import type { PublicSitterSearchCard } from "@/lib/sitter/sitter-profile";
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
    bio: pickString(row, "bio"),
    /** Only `sitter_profiles.hourly_rate_nis` — do not map legacy `hourly_rate` (may hold stale test values). */
    hourly_rate_nis: pickNumber(row, "hourly_rate_nis"),
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

/** Display label from `hourly_rate_nis` only — no defaults, no other columns. */
export function formatHourlyRateNis(rate: number | null | undefined): string {
  if (rate == null || !Number.isFinite(rate) || rate <= 0) {
    return "מחיר לא צוין";
  }
  return `₪${Math.round(rate)} / שעה`;
}

export function experienceBadgeLabel(years: number | null | undefined): string {
  if (years == null || years < 0) return "ניסיון לא צוין";
  return `${years} שנות ניסיון`;
}

export function transportBadgeLabel(hasCar: boolean): string {
  return hasCar ? "עצמאית" : "צריכה מונית";
}

export function bioExcerpt(text: string | null | undefined, max = 120): string {
  if (!text) return "";
  const t = text.trim();
  if (!t) return "";
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}
