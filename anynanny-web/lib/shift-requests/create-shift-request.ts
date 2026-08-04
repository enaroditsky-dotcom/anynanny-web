import type { SupabaseClient } from "@supabase/supabase-js";
import {
  PARENT_SEARCH_HOUR_OPTIONS,
  PARENT_SEARCH_MINUTE_OPTIONS,
  type ParentSearchMinute
} from "@/lib/sitter/parent-search-filters";

export { PARENT_SEARCH_HOUR_OPTIONS, PARENT_SEARCH_MINUTE_OPTIONS };
export type { ParentSearchMinute };

/**
 * Per-minute options (00..59, leading zero) for the booking modal time picker.
 * Parent search uses {@link PARENT_SEARCH_MINUTE_OPTIONS} from the same range.
 */
export const BOOK_SHIFT_MINUTE_OPTIONS = Array.from({ length: 60 }, (_, m) =>
  String(m).padStart(2, "0")
) as readonly string[];

function buildLocalDateTimeIso(day: string, hour: string, minute: string): string | null {
  const trimmedDay = day.trim();
  if (!trimmedDay || !/^\d{4}-\d{2}-\d{2}$/.test(trimmedDay)) return null;

  const h = hour.padStart(2, "0");
  const min = minute.padStart(2, "0");
  const [y, mo, d] = trimmedDay.split("-").map((x) => Number(x));
  const hourNum = Number(h);
  const minNum = Number(min);
  if (hourNum < 0 || hourNum > 23 || minNum < 0 || minNum > 59) return null;

  const local = new Date(y, mo - 1, d, hourNum, minNum, 0, 0);
  if (Number.isNaN(local.getTime())) return null;
  return local.toISOString();
}

export function validateShiftWindow(input: {
  /** Start date (`YYYY-MM-DD`). */
  shiftDate: string;
  /** End date (`YYYY-MM-DD`) — may be after start date for overnight shifts. */
  shiftEndDate: string;
  startHour: string;
  startMinute: string;
  endHour: string;
  endMinute: string;
}):
  | { startIso: string; endIso: string; startDate: string; endDate: string }
  | { error: string } {
  const { shiftDate, shiftEndDate, startHour, startMinute, endHour, endMinute } = input;

  if (!shiftDate.trim()) {
    return { error: "נא לבחור תאריך התחלה" };
  }
  if (!shiftEndDate.trim()) {
    return { error: "נא לבחור תאריך סיום" };
  }
  if (!startHour || !startMinute) {
    return { error: "נא לבחור שעת התחלה" };
  }
  if (!endHour || !endMinute) {
    return { error: "נא לבחור שעת סיום" };
  }

  const startIso = buildLocalDateTimeIso(shiftDate, startHour, startMinute);
  const endIso = buildLocalDateTimeIso(shiftEndDate, endHour, endMinute);

  if (!startIso || !endIso) {
    return { error: "תאריך או שעה לא תקינים" };
  }

  const startMs = new Date(startIso).getTime();
  const endMs = new Date(endIso).getTime();
  if (endMs <= startMs) {
    return { error: "מועד הסיום חייב להיות אחרי מועד ההתחלה (תאריך + שעה)" };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startDay = new Date(shiftDate.trim() + "T00:00:00");
  if (startDay < today) {
    return { error: "לא ניתן לבקש משמרת בעבר" };
  }

  return {
    startIso,
    endIso,
    startDate: shiftDate.trim(),
    endDate: shiftEndDate.trim()
  };
}

function shiftRpcErrorMessage(error: { message?: string } | null): string {
  if (!error?.message) return "שגיאה בשליחת הבקשה";
  const m = error.message.toLowerCase();
  if (m.includes("not_authenticated")) return "יש להתחבר מחדש";
  if (m.includes("parent_only")) return "פעולה זמינה להורים בלבד";
  if (m.includes("sitter_not_found")) return "לא נמצא פרופיל בייביסיטר";
  if (m.includes("invalid_time_range")) return "שעת הסיום חייבת להיות אחרי ההתחלה";
  if (m.includes("missing_fields")) return "נא למלא את כל השדות";
  return error.message;
}

export async function createShiftRequest(
  supabase: SupabaseClient,
  input: {
    sitterId: string;
    shiftDate: string;
    startIso: string;
    endIso: string;
  }
): Promise<{ requestId: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc("create_shift_request", {
    p_sitter_id: input.sitterId,
    p_shift_date: input.shiftDate,
    p_start_time: input.startIso,
    p_end_time: input.endIso
  });

  if (error) {
    return { requestId: null, error: shiftRpcErrorMessage(error) };
  }

  const requestId = typeof data === "string" ? data : data != null ? String(data) : null;
  if (!requestId) {
    return { requestId: null, error: "לא ניתן לשלוח את הבקשה" };
  }

  return { requestId, error: null };
}
