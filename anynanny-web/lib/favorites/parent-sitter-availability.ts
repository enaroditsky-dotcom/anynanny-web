import { SLOT_MINUTES, SLOTS_PER_DAY } from "@/lib/calendar/constants";
import { slotStartOnDay } from "@/lib/calendar/slot-utils";
import type { CalendarMode } from "@/lib/availability/constants";
import { isSlotOpenInIndices } from "@/lib/availability/sitter-availability";
import { isSlotPast } from "@/lib/calendar/slot-utils";

export type ParentAvailabilityState = "available" | "unavailable" | "occupied";

export type ParentAvailabilityDay = {
  date: string;
  state: ParentAvailabilityState;
};

const OCCUPYING_BOOKING_STATUSES = new Set([
  "approved",
  "sitter_started",
  "parent_started",
  "sitter_ended",
  "completed"
]);

export type ParentAvailabilityBookingInput = {
  start_time?: string | null;
  end_time?: string | null;
  status?: string | null;
};

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

export function parentAvailabilityStateLabel(state: ParentAvailabilityState): string {
  if (state === "available") return "פנויה";
  if (state === "occupied") return "תפוסה";
  return "לא פנויה";
}

export function isOccupyingBookingStatus(status: string | null | undefined): boolean {
  return OCCUPYING_BOOKING_STATUSES.has(String(status ?? "").trim().toLowerCase());
}

export function occupiedSlotsOnDate(
  date: string,
  startIso: string | null | undefined,
  endIso: string | null | undefined
): number[] {
  const startMs = Date.parse(String(startIso ?? ""));
  const endMs = Date.parse(String(endIso ?? ""));
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return [];

  const slots: number[] = [];
  for (let index = 0; index < SLOTS_PER_DAY; index += 1) {
    const slotStart = slotStartOnDay(date, index).getTime();
    if (!Number.isFinite(slotStart)) continue;
    const slotEnd = slotStart + SLOT_MINUTES * 60 * 1000;
    if (slotStart < endMs && slotEnd > startMs) slots.push(index);
  }
  return slots;
}

export function parentDayAvailabilityState(input: {
  mode: CalendarMode;
  date: string;
  savedSlotIndices: number[] | null;
  occupiedSlotIndices: readonly number[];
  now?: Date;
}): ParentAvailabilityState {
  const occupied = new Set(input.occupiedSlotIndices);
  const saved = input.savedSlotIndices ?? [];
  let openFuture = 0;
  let occupiedFuture = 0;

  for (let index = 0; index < SLOTS_PER_DAY; index += 1) {
    const open = isSlotOpenInIndices(
      input.mode,
      index,
      input.savedSlotIndices == null && input.mode === "all_except_blocked" ? [] : saved
    );
    if (!open) continue;
    if (isSlotPast(input.date, index, input.now)) continue;
    if (occupied.has(index)) occupiedFuture += 1;
    else openFuture += 1;
  }

  if (openFuture > 0) return "available";
  if (occupiedFuture > 0) return "occupied";
  return "unavailable";
}

function monthDates(year: number, month: number): string[] {
  const lastDay = new Date(year, month, 0).getDate();
  const dates: string[] = [];
  for (let day = 1; day <= lastDay; day += 1) {
    dates.push(`${year}-${pad2(month)}-${pad2(day)}`);
  }
  return dates;
}

/**
 * Parent-facing month. Output is only a date and an availability state.
 * Booking names, notes, and ids are never copied onto the result.
 */
export function buildParentAvailabilityMonth(input: {
  year: number;
  month: number;
  mode: CalendarMode;
  availabilityRows: readonly { availability_date?: string | null; slot_indices?: number[] | null }[];
  bookings: readonly ParentAvailabilityBookingInput[];
  now?: Date;
}): ParentAvailabilityDay[] {
  const rowsByDate = new Map<string, number[]>();
  for (const row of input.availabilityRows) {
    const date = String(row.availability_date ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    rowsByDate.set(
      date,
      Array.isArray(row.slot_indices) ? row.slot_indices.map((value) => Number(value)) : []
    );
  }

  return monthDates(input.year, input.month).map((date) => {
    const occupied = new Set<number>();
    for (const booking of input.bookings) {
      if (!isOccupyingBookingStatus(booking.status)) continue;
      for (const slot of occupiedSlotsOnDate(date, booking.start_time, booking.end_time)) {
        occupied.add(slot);
      }
    }
    const hasRow = rowsByDate.has(date);
    return {
      date,
      state: parentDayAvailabilityState({
        mode: input.mode,
        date,
        savedSlotIndices: hasRow ? rowsByDate.get(date) ?? [] : null,
        occupiedSlotIndices: [...occupied],
        now: input.now
      })
    };
  });
}

export function sanitizeParentAvailabilityDays(days: readonly ParentAvailabilityDay[]): ParentAvailabilityDay[] {
  return days.map((day) => ({
    date: String(day.date).slice(0, 10),
    state:
      day.state === "available" || day.state === "occupied" || day.state === "unavailable"
        ? day.state
        : "unavailable"
  }));
}
