export const ISRAEL_CITIES = [
  "תל אביב - יפו",
  "רמת גן",
  "גבעתיים",
  "בני ברק",
  "גבעת שמואל",
  "פתח תקווה",
  "הרצליה",
  "רמת השרון",
  "כפר סבא",
  "רעננה",
  "הוד השרון",
  "נתניה",
  "ראשון לציון",
  "חולון",
  "בת ים",
  "ירושלים",
  "חיפה",
  "באר שבע"
] as const;

export type IsraelCity = (typeof ISRAEL_CITIES)[number];

const ISRAEL_CITY_SET = new Set<string>(ISRAEL_CITIES);

export function isIsraelCity(value: string): value is IsraelCity {
  return ISRAEL_CITY_SET.has(value);
}

/** Keep only canonical city strings from `ISRAEL_CITIES` (deduped, stable order). */
export function normalizeWorkingCities(raw: unknown): IsraelCity[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<IsraelCity>();
  const out: IsraelCity[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (!isIsraelCity(trimmed) || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}
