import { SLOT_MINUTES, SLOTS_PER_DAY } from "@/lib/calendar/constants";

export function slotIndexToLabel(index: number): string {
  const clamped = Math.max(0, Math.min(SLOTS_PER_DAY - 1, index));
  const totalMinutes = clamped * SLOT_MINUTES;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function parseDateISO(date: string): Date {
  if (!date || typeof date !== "string") {
    return new Date(Number.NaN);
  }
  const parts = date.split("-");
  if (parts.length < 3) {
    return new Date(Number.NaN);
  }
  const [y, mo, d] = parts.map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) {
    return new Date(Number.NaN);
  }
  return new Date(y, mo - 1, d, 0, 0, 0, 0);
}

/** Start of slot `index` on given calendar day (local). */
export function slotStartOnDay(dateISO: string, slotIndex: number): Date {
  const base = parseDateISO(dateISO);
  base.setMinutes(base.getMinutes() + slotIndex * SLOT_MINUTES);
  return base;
}

export function isSlotPast(dateISO: string, slotIndex: number, now: Date = new Date()): boolean {
  try {
    const start = slotStartOnDay(dateISO, slotIndex);
    if (Number.isNaN(start.getTime())) return true;
    return start.getTime() < now.getTime();
  } catch {
    return true;
  }
}
