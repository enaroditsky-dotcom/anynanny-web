import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveBookingWindowMs } from "@/lib/bookings/booking-date-utils";
import { BOOKINGS_TABLE } from "@/lib/bookings/constants";
import { SESSIONS_TABLE } from "@/lib/session/protocol";
import { SESSIONS_OVERLAP_SELECT } from "@/lib/session/sessions-query";

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

/** Resolve shift bounds using full ISO timestamps (handles cross-midnight). */
export function resolveShiftTimeWindow(input: ShiftScheduleInput): ShiftTimeWindow | null {
  if (!input.start_time?.trim()) return null;

  if (input.end_time?.trim()) {
    const window = resolveBookingWindowMs({
      booking_date: input.booking_date ?? "",
      start_time: input.start_time,
      end_time: input.end_time
    });
    if (window) {
      return { startMs: window.startMs, endMs: window.endMs };
    }
  }

  const startMs = new Date(input.start_time).getTime();
  if (!Number.isFinite(startMs)) return null;

  if (!input.end_time?.trim()) {
    return { startMs, endMs: startMs + 24 * 60 * 60 * 1000 };
  }

  const endMs = new Date(input.end_time).getTime();
  if (!Number.isFinite(endMs)) return null;

  let end = endMs;
  if (end <= startMs) {
    end += 24 * 60 * 60 * 1000;
  }

  return { startMs, endMs: end };
}

export function shiftWindowsOverlap(a: ShiftTimeWindow, b: ShiftTimeWindow): boolean {
  return a.startMs < b.endMs && a.endMs > b.startMs;
}

async function fetchOverlapSessions(
  supabase: SupabaseClient,
  sitterId: string
): Promise<Array<{ id: string; start_time: string | null; end_time: string | null }>> {
  const blocking = new Set<string>(
    OVERLAP_BLOCKING_SESSION_STATUSES.map((s) => s.toLowerCase())
  );

  try {
    const { data: sessionRows, error: sessionError } = await supabase
      .from(SESSIONS_TABLE)
      .select(SESSIONS_OVERLAP_SELECT)
      .eq("sitter_id", sitterId);

    if (sessionError) {
      console.warn("[sitter-shift-overlap] sessions query failed:", sessionError.message);
      return [];
    }

    return (sessionRows ?? [])
      .map((row) => row as Record<string, unknown>)
      .filter((row) => blocking.has(String(row.status ?? "").toLowerCase()))
      .map((row) => ({
        id: String(row.id),
        start_time: (row.start_time as string | null) ?? null,
        end_time: (row.end_time as string | null) ?? null
      }));
  } catch (e) {
    console.warn("[sitter-shift-overlap] sessions query threw:", e);
    return [];
  }
}

function resolveActiveSessionOverlapWindow(
  row: { start_time: string | null; end_time: string | null },
  nowMs: number
): ShiftTimeWindow | null {
  if (!row.start_time) return null;

  const startMs = new Date(row.start_time).getTime();
  if (!Number.isFinite(startMs)) return null;

  if (row.end_time) {
    return resolveShiftTimeWindow({
      start_time: row.start_time,
      end_time: row.end_time
    });
  }

  return { startMs, endMs: Math.max(nowMs, startMs + 60_000) };
}

export async function sitterHasOverlappingActiveShift(
  supabase: SupabaseClient,
  sitterId: string,
  proposed: ShiftTimeWindow,
  exclude?: { bookingId?: string; sessionId?: string }
): Promise<boolean> {
  const excludeBookingId = exclude?.bookingId?.trim() ?? "";
  const excludeSessionId = exclude?.sessionId?.trim() ?? "";
  const nowMs = Date.now();

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

  const sessions = await fetchOverlapSessions(supabase, sitterId);

  for (const row of sessions) {
    if (excludeSessionId && String(row.id) === excludeSessionId) continue;

    const window = resolveActiveSessionOverlapWindow(row, nowMs);
    if (window && shiftWindowsOverlap(proposed, window)) {
      return true;
    }
  }

  return false;
}
