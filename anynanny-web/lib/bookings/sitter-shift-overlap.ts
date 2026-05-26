import type { SupabaseClient } from "@supabase/supabase-js";
import { BOOKINGS_TABLE } from "@/lib/bookings/constants";
import { SESSIONS_TABLE } from "@/lib/session/protocol";

export const SITTER_OVERLAP_APPROVE_MESSAGE =
  "⚠️ יש לך כבר משמרת מאושרת בשעות חופפות!";

/** Bookings that block a new approval (confirmed / in-progress). */
export const OVERLAP_BLOCKING_BOOKING_STATUSES = [
  "approved",
  "sitter_started",
  "parent_started"
] as const;

/** Sessions that block overlap (requested + billing active). */
export const OVERLAP_BLOCKING_SESSION_STATUSES = [
  "confirmed",
  "in_progress",
  "active"
] as const;

export type ShiftTimeWindow = {
  startMs: number;
  endMs: number;
};

export type ShiftScheduleInput = {
  booking_date?: string | null;
  start_time: string;
  end_time: string;
};

function combineBookingDateTimeMs(bookingDate: string, timePart: string): number | null {
  const datePart = bookingDate.trim();
  const timeRaw = timePart.trim();
  if (!datePart || !timeRaw) return null;

  if (timeRaw.includes("T")) {
    const ms = new Date(timeRaw).getTime();
    return Number.isFinite(ms) ? ms : null;
  }

  const combined = `${datePart}T${timeRaw.length <= 5 ? `${timeRaw}:00` : timeRaw}`;
  const ms = new Date(combined).getTime();
  return Number.isFinite(ms) ? ms : null;
}

export function resolveShiftTimeWindow(input: ShiftScheduleInput): ShiftTimeWindow | null {
  const startFromIso = new Date(input.start_time).getTime();
  const endFromIso = new Date(input.end_time).getTime();
  if (Number.isFinite(startFromIso) && Number.isFinite(endFromIso) && endFromIso > startFromIso) {
    return { startMs: startFromIso, endMs: endFromIso };
  }

  const datePart = String(input.booking_date ?? "").trim();
  if (!datePart) return null;

  const startMs = combineBookingDateTimeMs(datePart, input.start_time);
  const endMs = combineBookingDateTimeMs(datePart, input.end_time);
  if (startMs == null || endMs == null || endMs <= startMs) return null;

  return { startMs, endMs };
}

export function shiftWindowsOverlap(a: ShiftTimeWindow, b: ShiftTimeWindow): boolean {
  return a.startMs < b.endMs && a.endMs > b.startMs;
}

export async function sitterHasOverlappingActiveShift(
  supabase: SupabaseClient,
  sitterId: string,
  proposed: ShiftTimeWindow,
  exclude?: { bookingId?: string; sessionId?: string }
): Promise<boolean> {
  const excludeBookingId = exclude?.bookingId?.trim() ?? "";
  const excludeSessionId = exclude?.sessionId?.trim() ?? "";

  const { data: bookingRows, error: bookingError } = await supabase
    .from(BOOKINGS_TABLE)
    .select("id, booking_date, start_time, end_time, status")
    .eq("sitter_id", sitterId)
    .in("status", [...OVERLAP_BLOCKING_BOOKING_STATUSES]);

  if (bookingError) {
    console.warn("[sitter-shift-overlap] bookings query failed:", bookingError.message);
  } else {
    for (const raw of bookingRows ?? []) {
      if (!raw || typeof raw !== "object") continue;
      const id = String((raw as { id: string }).id);
      if (excludeBookingId && id === excludeBookingId) continue;

      const window = resolveShiftTimeWindow({
        booking_date: String((raw as { booking_date?: string }).booking_date ?? ""),
        start_time: String((raw as { start_time: string }).start_time ?? ""),
        end_time: String((raw as { end_time: string }).end_time ?? "")
      });
      if (window && shiftWindowsOverlap(proposed, window)) {
        return true;
      }
    }
  }

  const { data: sessionRows, error: sessionError } = await supabase
    .from(SESSIONS_TABLE)
    .select("id, booking_id, start_time, end_time, session_status")
    .eq("sitter_id", sitterId)
    .in("session_status", [...OVERLAP_BLOCKING_SESSION_STATUSES]);

  if (sessionError) {
    console.warn("[sitter-shift-overlap] sessions query failed:", sessionError.message);
    return false;
  }

  const sessions = (sessionRows ?? []) as Array<{
    id: string;
    booking_id: string | null;
    start_time: string | null;
    end_time: string | null;
  }>;

  const bookingIds = [
    ...new Set(
      sessions
        .map((row) => row.booking_id?.trim())
        .filter((id): id is string => Boolean(id))
    )
  ];

  const bookingById = new Map<string, ShiftScheduleInput>();
  if (bookingIds.length > 0) {
    const { data: linkedBookings } = await supabase
      .from(BOOKINGS_TABLE)
      .select("id, booking_date, start_time, end_time")
      .in("id", bookingIds);

    for (const raw of linkedBookings ?? []) {
      if (!raw || typeof raw !== "object" || raw.id == null) continue;
      bookingById.set(String(raw.id), {
        booking_date: String(raw.booking_date ?? ""),
        start_time: String(raw.start_time ?? ""),
        end_time: String(raw.end_time ?? "")
      });
    }
  }

  for (const row of sessions) {
    if (excludeSessionId && String(row.id) === excludeSessionId) continue;
    if (excludeBookingId && row.booking_id === excludeBookingId) continue;

    let window: ShiftTimeWindow | null = null;
    const linked = row.booking_id ? bookingById.get(row.booking_id) : undefined;
    if (linked) {
      window = resolveShiftTimeWindow(linked);
    }
    if (!window && row.start_time && row.end_time) {
      window = resolveShiftTimeWindow({
        start_time: row.start_time,
        end_time: row.end_time
      });
    }
    if (window && shiftWindowsOverlap(proposed, window)) {
      return true;
    }
  }

  return false;
}
