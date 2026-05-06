import { SLOTS_PER_DAY } from "@/lib/calendar/constants";
import {
  listAvailability,
  listBookings,
  saveAvailabilityAll,
  saveBookingsAll
} from "@/lib/calendar/repository";
import { isSlotPast, slotIndexToLabel } from "@/lib/calendar/slot-utils";
import type {
  CalendarBooking,
  CalendarSlotView,
  DateISO,
  DayAvailability,
  SlotVisualState
} from "@/lib/calendar/types";

export async function getDayAvailabilityRecord(sitterId: string, date: DateISO): Promise<DayAvailability | null> {
  const all = await listAvailability();
  return all.find((d) => d.sitterId === sitterId && d.date === date) ?? null;
}

export async function setDayAvailability(sitterId: string, date: DateISO, availableSlots: number[]): Promise<void> {
  const normalized = [...new Set(availableSlots)]
    .filter((i) => Number.isInteger(i) && i >= 0 && i < SLOTS_PER_DAY)
    .sort((a, b) => a - b);

  const all = await listAvailability();
  const idx = all.findIndex((d) => d.sitterId === sitterId && d.date === date);

  const row: DayAvailability = { sitterId, date, availableSlots: normalized };

  if (idx === -1) {
    all.push(row);
  } else {
    all[idx] = row;
  }

  await saveAvailabilityAll(all);
}

export async function getSlotsForDay(
  sitterId: string,
  date: DateISO,
  options?: { now?: Date }
): Promise<CalendarSlotView[]> {
  const now = options?.now ?? new Date();
  const availRow = await getDayAvailabilityRecord(sitterId, date);
  const availableSet = new Set(availRow?.availableSlots ?? []);

  const bookings = await listBookings();
  const dayBookings = bookings.filter((b) => b.sitterId === sitterId && b.date === date && b.status === "confirmed");

  const slots: CalendarSlotView[] = [];

  for (let i = 0; i < SLOTS_PER_DAY; i++) {
    const booking = dayBookings.find((b) => i >= b.startSlot && i < b.endSlot);

    let state: SlotVisualState = "empty";
    if (booking) {
      state = "busy";
    } else if (isSlotPast(date, i, now)) {
      state = "past";
    } else if (availableSet.has(i)) {
      state = "available";
    }

    slots.push({
      index: i,
      label: slotIndexToLabel(i),
      state,
      bookingId: booking?.id
    });
  }

  return slots;
}

export async function createBookingRequest(input: {
  sitterId: string;
  date: DateISO;
  slotIndex: number;
  parentName: string;
}): Promise<{ ok: true; booking: CalendarBooking } | { ok: false; error: string }> {
  const { sitterId, date, slotIndex, parentName } = input;

  if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= SLOTS_PER_DAY) {
    return { ok: false, error: "Invalid slot." };
  }

  const slots = await getSlotsForDay(sitterId, date);
  const target = slots[slotIndex];
  if (!target || target.state !== "available") {
    return { ok: false, error: "Slot is not available." };
  }

  const all = await listBookings();
  const overlap = all.some(
    (b) =>
      b.sitterId === sitterId &&
      b.date === date &&
      b.status === "confirmed" &&
      slotIndex >= b.startSlot &&
      slotIndex < b.endSlot
  );
  if (overlap) {
    return { ok: false, error: "Slot already booked." };
  }

  const booking: CalendarBooking = {
    id: `bk_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    sitterId,
    date,
    startSlot: slotIndex,
    endSlot: slotIndex + 1,
    status: "confirmed",
    parentName: parentName.trim(),
    createdAt: new Date().toISOString()
  };

  all.push(booking);
  await saveBookingsAll(all);

  return { ok: true, booking };
}

/** Days in month with brief availability counts for month overview */
export async function getMonthSummary(sitterId: string, year: number, monthIndex0: number): Promise<Map<string, { available: number; busy: number }>> {
  const summary = new Map<string, { available: number; busy: number }>();

  const daysInMonth = new Date(year, monthIndex0 + 1, 0).getDate();
  const avail = await listAvailability();
  const bookings = await listBookings();

  for (let day = 1; day <= daysInMonth; day++) {
    const date = `${year}-${String(monthIndex0 + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const row = avail.find((a) => a.sitterId === sitterId && a.date === date);
    const availableCount = row?.availableSlots.filter((i) => !isSlotPast(date, i)).length ?? 0;

    const busySlots = new Set<number>();
    bookings
      .filter((b) => b.sitterId === sitterId && b.date === date && b.status === "confirmed")
      .forEach((b) => {
        for (let i = b.startSlot; i < b.endSlot; i++) {
          busySlots.add(i);
        }
      });

    summary.set(date, { available: availableCount, busy: busySlots.size });
  }

  return summary;
}
