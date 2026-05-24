import type { SupabaseClient } from "@supabase/supabase-js";
import { SLOTS_PER_DAY } from "@/lib/calendar/constants";
import { isSlotPast } from "@/lib/calendar/slot-utils";
import {
  SITTER_AVAILABILITY_TABLE,
  type CalendarMode,
  type SitterAvailabilityRow
} from "@/lib/availability/constants";
import { SITTER_PROFILES_TABLE, SITTER_PROFILES_USER_COLUMN } from "@/lib/sitter/sitter-profile";

export const ALL_DAY_SLOT_INDICES: number[] = Array.from({ length: SLOTS_PER_DAY }, (_, i) => i);

export function normalizeSlotIndices(raw: unknown): number[] {
  try {
    if (!Array.isArray(raw)) return [];
    return [...new Set(raw.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n >= 0 && n < SLOTS_PER_DAY))].sort(
      (a, b) => a - b
    );
  } catch {
    return [];
  }
}

/** Coerce unknown paint values to a valid Set (never throws). */
export function coercePaintSet(value: unknown): Set<number> {
  if (value instanceof Set) {
    const next = new Set<number>();
    for (const n of value) {
      if (Number.isInteger(n) && n >= 0 && n < SLOTS_PER_DAY) next.add(n);
    }
    return next;
  }
  if (Array.isArray(value)) {
    return new Set(normalizeSlotIndices(value));
  }
  return new Set();
}

export async function fetchSitterCalendarMode(
  supabase: SupabaseClient,
  sitterId: string
): Promise<{ mode: CalendarMode; error: string | null }> {
  const fk = SITTER_PROFILES_USER_COLUMN;
  const { data, error } = await supabase
    .from(SITTER_PROFILES_TABLE)
    .select("calendar_mode")
    .eq(fk, sitterId)
    .maybeSingle();

  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("calendar_mode")) {
      return { mode: "only_selected", error: null };
    }
    return { mode: "only_selected", error: error.message };
  }

  const mode = data?.calendar_mode === "all_except_blocked" ? "all_except_blocked" : "only_selected";
  return { mode, error: null };
}

export async function updateSitterCalendarMode(
  supabase: SupabaseClient,
  sitterId: string,
  mode: CalendarMode
): Promise<{ error: string | null }> {
  const fk = SITTER_PROFILES_USER_COLUMN;
  const { error } = await supabase.from(SITTER_PROFILES_TABLE).update({ calendar_mode: mode }).eq(fk, sitterId);

  if (error) {
    return { error: error.message };
  }
  return { error: null };
}

export async function fetchAvailabilityForDate(
  supabase: SupabaseClient,
  sitterId: string,
  date: string
): Promise<{ row: SitterAvailabilityRow | null; error: string | null }> {
  const { data, error } = await supabase
    .from(SITTER_AVAILABILITY_TABLE)
    .select("sitter_id, availability_date, slot_indices, updated_at")
    .eq("sitter_id", sitterId)
    .eq("availability_date", date)
    .maybeSingle();

  if (error) {
    return { row: null, error: error.message };
  }

  if (!data) {
    return { row: null, error: null };
  }

  return {
    row: {
      sitter_id: String(data?.sitter_id ?? sitterId),
      availability_date: String(data?.availability_date ?? date),
      slot_indices: normalizeSlotIndices(data?.slot_indices),
      updated_at: String(data?.updated_at ?? new Date().toISOString())
    },
    error: null
  };
}

export async function fetchAvailabilityMonthSummary(
  supabase: SupabaseClient,
  sitterId: string,
  year: number,
  month: number,
  mode: CalendarMode
): Promise<{ days: Record<string, { marked: number }>; error: string | null }> {
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  const { data, error } = await supabase
    .from(SITTER_AVAILABILITY_TABLE)
    .select("availability_date, slot_indices")
    .eq("sitter_id", sitterId)
    .gte("availability_date", start)
    .lte("availability_date", end);

  if (error) {
    return { days: {}, error: error.message };
  }

  const days: Record<string, { marked: number }> = {};
  const now = new Date();

  for (const row of data ?? []) {
    const date = String(row.availability_date);
    const indices = normalizeSlotIndices(row.slot_indices);
    if (mode === "only_selected") {
      days[date] = { marked: indices.length };
    } else {
      let open = 0;
      for (let i = 0; i < SLOTS_PER_DAY; i++) {
        if (isSlotPast(date, i, now)) continue;
        if (!indices.includes(i)) open += 1;
      }
      days[date] = { marked: open };
    }
  }

  return { days, error: null };
}

/** Remove saved availability for one day (reverts to mode defaults in the UI). */
export async function deleteAvailabilityForDate(
  supabase: SupabaseClient,
  sitterId: string,
  date: string
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from(SITTER_AVAILABILITY_TABLE)
    .delete()
    .eq("sitter_id", sitterId)
    .eq("availability_date", date);

  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("row-level security") || msg.includes("policy")) {
      return { error: "אין הרשאה למחוק זמינות (RLS). ודאו שהתחברתם כבייביסיטר." };
    }
    return { error: error.message };
  }

  return { error: null };
}

export async function saveAvailabilityForDate(
  supabase: SupabaseClient,
  sitterId: string,
  date: string,
  slotIndices: number[]
): Promise<{ row: SitterAvailabilityRow | null; error: string | null }> {
  const normalized = normalizeSlotIndices(slotIndices);
  const payload = {
    sitter_id: sitterId,
    availability_date: date,
    slot_indices: normalized,
    updated_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from(SITTER_AVAILABILITY_TABLE)
    .upsert(payload, { onConflict: "sitter_id,availability_date" })
    .select("sitter_id, availability_date, slot_indices, updated_at")
    .single();

  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("row-level security") || msg.includes("policy")) {
      return { row: null, error: "אין הרשאה לשמור זמינות (RLS). ודאו שהתחברתם כבייביסיטר." };
    }
    if (msg.includes("sitter_availability") && msg.includes("schema")) {
      return { row: null, error: "טבלת sitter_availability חסרה — הריצו את המיגרציה ב-Supabase." };
    }
    console.warn("[sitter_availability] upsert failed:", error.message, error.details, error.hint);
    return { row: null, error: error.message };
  }

  if (!data) {
    return { row: null, error: null };
  }

  return {
    row: {
      sitter_id: String(data?.sitter_id ?? sitterId),
      availability_date: String(data?.availability_date ?? date),
      slot_indices: normalizeSlotIndices(data?.slot_indices),
      updated_at: String(data?.updated_at ?? new Date().toISOString())
    },
    error: null
  };
}

/** Apply saved row to UI paint set (respects calendar_mode). */
export function paintSetFromAvailabilityRow(
  mode: CalendarMode,
  date: string,
  row: SitterAvailabilityRow | null | undefined
): Set<number> {
  try {
    if (!date || typeof date !== "string") {
      return new Set();
    }
    if (!row) {
      if (mode === "all_except_blocked") {
        const open = new Set<number>();
        for (let i = 0; i < SLOTS_PER_DAY; i++) {
          if (!isSlotPast(date, i)) open.add(i);
        }
        return open;
      }
      return new Set();
    }
    return slotIndicesToPaintSet(mode, row?.slot_indices ?? []);
  } catch (err) {
    console.warn("[sitter_availability] paintSetFromAvailabilityRow:", err);
    return new Set();
  }
}

/**
 * DB `slot_indices` semantics:
 * - only_selected: indices = open (פנוי) slots; [] = whole day blocked
 * - all_except_blocked: indices = blocked (לא פנוי) slots; [] = whole day open
 */
export function isSlotOpenInIndices(mode: CalendarMode, slotIndex: number, slotIndices: number[]): boolean {
  const set = new Set(normalizeSlotIndices(slotIndices));
  if (mode === "only_selected") {
    return set.has(slotIndex);
  }
  return !set.has(slotIndex);
}

export function toggleSlotInIndices(
  mode: CalendarMode,
  slotIndex: number,
  slotIndices: number[]
): number[] {
  const set = new Set(normalizeSlotIndices(slotIndices));
  if (mode === "only_selected") {
    if (set.has(slotIndex)) set.delete(slotIndex);
    else set.add(slotIndex);
  } else if (set.has(slotIndex)) {
    set.delete(slotIndex);
  } else {
    set.add(slotIndex);
  }
  return [...set].sort((a, b) => a - b);
}

export function setSlotOpenInIndices(
  mode: CalendarMode,
  slotIndex: number,
  slotIndices: number[],
  open: boolean
): number[] {
  const set = new Set(normalizeSlotIndices(slotIndices));
  const shouldBeInArray = mode === "only_selected" ? open : !open;
  if (shouldBeInArray) set.add(slotIndex);
  else set.delete(slotIndex);
  return [...set].sort((a, b) => a - b);
}

/** Fully block the day in DB array form. */
export function blockEntireDaySlotIndices(mode: CalendarMode): number[] {
  if (mode === "only_selected") {
    return [];
  }
  return [...ALL_DAY_SLOT_INDICES];
}

/** Fully open the day in DB array form. */
export function unblockEntireDaySlotIndices(mode: CalendarMode): number[] {
  if (mode === "only_selected") {
    return [...ALL_DAY_SLOT_INDICES];
  }
  return [];
}

export function countOpenSlotsInIndices(
  dateIso: string,
  mode: CalendarMode,
  slotIndices: number[],
  now: Date = new Date()
): number {
  let open = 0;
  const indices = normalizeSlotIndices(slotIndices);
  for (let i = 0; i < SLOTS_PER_DAY; i++) {
    if (isSlotPast(dateIso, i, now)) continue;
    if (isSlotOpenInIndices(mode, i, indices)) open += 1;
  }
  return open;
}

export function isDateFullyBlockedFromIndices(
  dateIso: string,
  mode: CalendarMode,
  summaryMarked: number | undefined,
  options?: { liveIndices?: number[]; now?: Date }
): boolean {
  const now = options?.now ?? new Date();
  const futureTotal = countFutureSlotsOnDate(dateIso, now);
  if (futureTotal === 0) return false;

  if (options?.liveIndices != null) {
    return countOpenSlotsInIndices(dateIso, mode, options.liveIndices, now) === 0;
  }

  if (mode === "all_except_blocked" && summaryMarked === undefined) {
    return false;
  }

  return (summaryMarked ?? 0) === 0;
}

/** Build local paint set from DB row + calendar mode. */
export function slotIndicesToPaintSet(mode: CalendarMode, slotIndices: number[]): Set<number> {
  const indices = normalizeSlotIndices(slotIndices);
  if (mode === "only_selected") {
    return new Set(indices);
  }
  const blocked = new Set(indices);
  const open = new Set<number>();
  for (let i = 0; i < SLOTS_PER_DAY; i++) {
    if (!blocked.has(i)) open.add(i);
  }
  return open;
}

/** How many non-past slots exist on this calendar day. */
export function countFutureSlotsOnDate(dateIso: string, now: Date = new Date()): number {
  let count = 0;
  for (let i = 0; i < SLOTS_PER_DAY; i++) {
    if (!isSlotPast(dateIso, i, now)) count += 1;
  }
  return count;
}

/** Open (פנוי) slots on a day from paint set — used for month grid + blocked detection. */
export function countOpenSlotsFromPaint(dateIso: string, paint: Set<number> | undefined | null, now: Date = new Date()): number {
  try {
    if (!dateIso || !paint || typeof paint.has !== "function") return 0;
    let open = 0;
    for (let i = 0; i < SLOTS_PER_DAY; i++) {
      if (!isSlotPast(dateIso, i, now) && paint.has(i)) open += 1;
    }
    return open;
  } catch {
    return 0;
  }
}

/**
 * Day is "fully blocked" when every future slot on that day is לא פנוי.
 * `summaryMarked` is open-slot count from month summary (same semantics in both calendar modes).
 */
export function isDateFullyBlocked(
  dateIso: string,
  mode: CalendarMode,
  summaryMarked: number | undefined,
  options?: { livePaint?: Set<number>; now?: Date }
): boolean {
  const now = options?.now ?? new Date();
  const futureTotal = countFutureSlotsOnDate(dateIso, now);
  if (futureTotal === 0) return false;

  if (options?.livePaint != null) {
    return countOpenSlotsFromPaint(dateIso, coercePaintSet(options.livePaint), now) === 0;
  }

  if (mode === "all_except_blocked" && summaryMarked === undefined) {
    return false;
  }

  return (summaryMarked ?? 0) === 0;
}

export function paintSetToSlotIndices(mode: CalendarMode, painted: Set<number> | undefined | null): number[] {
  const safePaint = coercePaintSet(painted);
  if (mode === "only_selected") {
    return [...safePaint].sort((a, b) => a - b);
  }
  const blocked: number[] = [];
  for (let i = 0; i < SLOTS_PER_DAY; i++) {
    if (!safePaint.has(i)) blocked.push(i);
  }
  return blocked;
}
