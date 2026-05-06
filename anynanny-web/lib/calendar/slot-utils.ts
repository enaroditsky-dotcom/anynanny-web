import { SLOT_MINUTES, SLOTS_PER_DAY } from "@/lib/calendar/constants";

export function slotIndexToLabel(index: number): string {
  const clamped = Math.max(0, Math.min(SLOTS_PER_DAY - 1, index));
  const totalMinutes = clamped * SLOT_MINUTES;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function parseDateISO(date: string): Date {
  const [y, mo, d] = date.split("-").map(Number);
  return new Date(y, mo - 1, d, 0, 0, 0, 0);
}

/** Start of slot `index` on given calendar day (local). */
export function slotStartOnDay(dateISO: string, slotIndex: number): Date {
  const base = parseDateISO(dateISO);
  base.setMinutes(base.getMinutes() + slotIndex * SLOT_MINUTES);
  return base;
}

export function isSlotPast(dateISO: string, slotIndex: number, now: Date = new Date()): boolean {
  return slotStartOnDay(dateISO, slotIndex).getTime() < now.getTime();
}
