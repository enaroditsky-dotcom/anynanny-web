import { notificationDedupeKey, type CanonicalNotificationKind } from "@/lib/notifications/kinds";
import { isCanonicalDoubleShakeStartCompleted } from "@/lib/bookings/no-start-cancellation";

export const SHIFT_END_REMINDER_KIND: CanonicalNotificationKind = "shift_end_reminder";
export const SHIFT_END_REMINDER_LEAD_MINUTES = 30;
export const SHIFT_END_REMINDER_TITLE = "המשמרת מסתיימת בעוד 30 דקות";
export const SHIFT_END_REMINDER_TIMEZONE = "Asia/Jerusalem";

const TERMINAL_BOOKING_STATUSES = new Set(["cancelled", "completed", "rejected", "sitter_ended", "pending"]);
const ENDED_SESSION_WORKFLOW_STATUSES = new Set(["completed", "payment_pending", "cancelled", "paid"]);
const ENDED_SESSION_STATUSES = new Set([
  "completed",
  "paid",
  "payment_pending",
  "cancelled",
  "sitter_ended",
  "sitter_completed"
]);

export type ShiftEndReminderEligibilityInput = {
  now: Date;
  scheduledStart: Date | string | null | undefined;
  scheduledEnd: Date | string | null | undefined;
  bookingStatus?: string | null;
  cancelledAt?: string | null;
  actualEndTime?: string | null;
  sessionEndTime?: string | null;
  sessionWorkflowStatus?: string | null;
  sessionStatus?: string | null;
  sitterStartShake?: string | null;
  parentStartShake?: string | null;
};

function asDate(value: Date | string | null | undefined): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function norm(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

export function shiftEndReminderDedupeKey(bookingId: string): string | null {
  return notificationDedupeKey(SHIFT_END_REMINDER_KIND, { bookingId });
}

/** `HH:mm` in Asia/Jerusalem — same convention as cancellation SQL `to_char(timezone(...), 'HH24:MI')`. */
export function formatShiftEndTimeLabel(scheduledEnd: Date | string): string {
  const date = asDate(scheduledEnd);
  if (!date) return "--:--";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: SHIFT_END_REMINDER_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date);
  const hour = parts.find((part) => part.type === "hour")?.value;
  const minute = parts.find((part) => part.type === "minute")?.value;
  if (!hour || !minute) return "--:--";
  return `${hour}:${minute}`;
}

export function formatShiftEndReminderParentBody(sitterName: string | null | undefined, timeLabel: string): string {
  const name = String(sitterName ?? "").trim();
  if (name) {
    return `המשמרת עם ${name} מתוכננת להסתיים בשעה ${timeLabel}. אם אתם צפויים לאחר, מומלץ לעדכן אותה מראש.`;
  }
  return `המשמרת מתוכננת להסתיים בשעה ${timeLabel}. אם אתם צפויים לאחר, מומלץ לעדכן אותה מראש.`;
}

export function formatShiftEndReminderSitterBody(timeLabel: string): string {
  return `שעת הסיום המתוכננת של המשמרת היא ${timeLabel}.`;
}

export function isWithinShiftEndReminderWindow(input: {
  now: Date;
  scheduledStart?: Date | string | null;
  scheduledEnd: Date | string | null | undefined;
}): boolean {
  const now = input.now.getTime();
  const end = asDate(input.scheduledEnd)?.getTime();
  if (!Number.isFinite(now) || end == null) return false;
  const leadMs = SHIFT_END_REMINDER_LEAD_MINUTES * 60 * 1000;
  if (now < end - leadMs) return false;
  if (now >= end) return false;
  const start = asDate(input.scheduledStart ?? null)?.getTime();
  if (start != null && now < start) return false;
  return true;
}

export function isShiftEndedForReminder(input: {
  bookingStatus?: string | null;
  cancelledAt?: string | null;
  actualEndTime?: string | null;
  sessionEndTime?: string | null;
  sessionWorkflowStatus?: string | null;
  sessionStatus?: string | null;
}): boolean {
  if (String(input.cancelledAt ?? "").trim()) return true;
  if (String(input.actualEndTime ?? "").trim()) return true;
  if (String(input.sessionEndTime ?? "").trim()) return true;
  const bookingStatus = norm(input.bookingStatus);
  if (TERMINAL_BOOKING_STATUSES.has(bookingStatus)) return true;
  if (ENDED_SESSION_WORKFLOW_STATUSES.has(norm(input.sessionWorkflowStatus))) return true;
  if (ENDED_SESSION_STATUSES.has(norm(input.sessionStatus))) return true;
  return false;
}

export function shouldSendShiftEndReminder(input: ShiftEndReminderEligibilityInput): boolean {
  if (!isCanonicalDoubleShakeStartCompleted(input)) return false;
  if (isShiftEndedForReminder(input)) return false;
  return isWithinShiftEndReminderWindow({
    now: input.now,
    scheduledStart: input.scheduledStart,
    scheduledEnd: input.scheduledEnd
  });
}
