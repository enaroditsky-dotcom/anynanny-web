import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CANONICAL_NOTIFICATION_KINDS,
  isCanonicalNotificationKind,
  notificationDedupeKey,
  notificationHrefForKind
} from "../lib/notifications/kinds";
import {
  SHIFT_END_REMINDER_KIND,
  SHIFT_END_REMINDER_LEAD_MINUTES,
  SHIFT_END_REMINDER_TIMEZONE,
  SHIFT_END_REMINDER_TITLE,
  formatShiftEndReminderParentBody,
  formatShiftEndReminderSitterBody,
  formatShiftEndTimeLabel,
  isWithinShiftEndReminderWindow,
  shouldSendShiftEndReminder,
  shiftEndReminderDedupeKey
} from "../lib/notifications/shift-end-reminder";
import {
  NO_START_CANCEL_LEAD_MINUTES,
  NO_START_CONFIRMATION_REASON,
  SHIFT_CANCELLED_NO_START_KIND,
  SHIFT_CANCELLED_NO_START_TITLE,
  formatNoStartCancellationBody,
  isCanonicalDoubleShakeStartCompleted,
  shouldAutoCancelApprovedBookingWithoutStart
} from "../lib/bookings/no-start-cancellation";
import { formatStoredCancellationMessage } from "../lib/bookings/cancellation-request";
import { privacySafeBodyForKind, pushHrefForKind } from "../lib/push/payload";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

const MIGRATION = "supabase/migrations/20260824120000_shift_end_reminder.sql";
const sql = read(MIGRATION);
const kinds = read("lib/notifications/kinds.ts");
const payload = read("lib/push/payload.ts");
const helper = read("lib/notifications/shift-end-reminder.ts");
const noStartHelper = read("lib/bookings/no-start-cancellation.ts");
const doubleShake = read("docs/double-shake-state-machine.md");
const endShiftAtomic = read("supabase/migrations/20260819234500_end_shift_atomic_authoritative_amount.sql");
const hypPayment = read("supabase/migrations/20260820010000_hyp_payment_verification_idempotency.sql");
const hypFinalize = read("lib/billing/finalize-hyp-payment.ts");
const pendingLifecycle = read("supabase/migrations/20260821120000_pending_booking_lifecycle.sql");
const twoPartyCancel = read("supabase/migrations/20260818153000_booking_cancellation_request.sql");
const canonicalNotifs = read("supabase/migrations/20260820140000_canonical_notifications.sql");
const sessionBilling = read("lib/billing/session-billing.ts");
const computeCharge = read("lib/billing/compute-shift-charge.ts");
const ratingsInsert = read("supabase/migrations/20260810120000_ratings_insert_allow_paid_sessions.sql");
const ratingsPublished = read("supabase/migrations/20260812180000_ratings_published_at.sql");

const PARENT_TITLE = "המשמרת מסתיימת בעוד 30 דקות";
const scheduledEnd = new Date("2026-08-24T18:00:00.000Z");
const scheduledStart = new Date("2026-08-24T14:00:00.000Z");
const reminderAt = new Date(scheduledEnd.getTime() - SHIFT_END_REMINDER_LEAD_MINUTES * 60 * 1000);
const beforeWindow = new Date(reminderAt.getTime() - 60 * 1000);
const afterScheduledEnd = new Date(scheduledEnd.getTime() + 60 * 1000);
const startPlus29 = new Date(scheduledStart.getTime() + 29 * 60 * 1000);
const startPlus30 = new Date(scheduledStart.getTime() + 30 * 60 * 1000);
const bothShakes = {
  sitterStartShake: scheduledStart.toISOString(),
  parentStartShake: scheduledStart.toISOString()
};
const sitterOnlyShake = {
  sitterStartShake: scheduledStart.toISOString(),
  parentStartShake: null
};

assert.equal(isCanonicalDoubleShakeStartCompleted({ sitterStartShake: null, parentStartShake: null }), false);
assert.equal(isCanonicalDoubleShakeStartCompleted(sitterOnlyShake), false);
assert.equal(
  isCanonicalDoubleShakeStartCompleted({ sitterStartShake: null, parentStartShake: scheduledStart.toISOString() }),
  false
);
assert.equal(isCanonicalDoubleShakeStartCompleted(bothShakes), true);

assert.equal(
  shouldAutoCancelApprovedBookingWithoutStart({
    now: startPlus29,
    scheduledStart,
    bookingStatus: "approved"
  }),
  false
);
assert.equal(
  shouldAutoCancelApprovedBookingWithoutStart({
    now: startPlus30,
    scheduledStart,
    bookingStatus: "approved"
  }),
  true
);
assert.equal(
  shouldAutoCancelApprovedBookingWithoutStart({
    now: startPlus30,
    scheduledStart,
    bookingStatus: "sitter_started",
    ...sitterOnlyShake
  }),
  true
);
assert.equal(
  shouldAutoCancelApprovedBookingWithoutStart({
    now: startPlus30,
    scheduledStart,
    bookingStatus: "approved",
    ...bothShakes
  }),
  false
);
assert.equal(
  shouldAutoCancelApprovedBookingWithoutStart({
    now: startPlus30,
    scheduledStart,
    bookingStatus: "parent_started",
    ...bothShakes
  }),
  false
);
assert.equal(
  shouldAutoCancelApprovedBookingWithoutStart({
    now: startPlus30,
    scheduledStart,
    bookingStatus: "cancelled"
  }),
  false
);

assert.equal(NO_START_CONFIRMATION_REASON, "no_start_confirmation");
assert.equal(NO_START_CANCEL_LEAD_MINUTES, 30);
assert.equal(SHIFT_CANCELLED_NO_START_KIND, "shift_cancelled_no_start");
assert.equal(SHIFT_CANCELLED_NO_START_TITLE, "המשמרת בוטלה");
assert.equal(isCanonicalNotificationKind("shift_cancelled_no_start"), true);
assert.ok(CANONICAL_NOTIFICATION_KINDS.includes("shift_cancelled_no_start"));
assert.equal(notificationDedupeKey("shift_cancelled_no_start", { bookingId: "b1" }), "b1");
assert.equal(
  formatNoStartCancellationBody("19:00"),
  "המשמרת שתוכננה להתחיל בשעה 19:00 בוטלה אוטומטית מכיוון שלא אושרה התחלת המשמרת."
);
assert.equal(
  formatStoredCancellationMessage("no_start_confirmation"),
  "המשמרת בוטלה אוטומטית מכיוון שלא אושרה התחלת המשמרת."
);
assert.equal(privacySafeBodyForKind("shift_cancelled_no_start"), formatStoredCancellationMessage("no_start_confirmation"));
assert.equal(notificationHrefForKind("shift_cancelled_no_start", "parent", { booking_id: "b1" }), "/parent/dashboard");
assert.equal(notificationHrefForKind("shift_cancelled_no_start", "sitter", { booking_id: "b1" }), "/sitter/dashboard");
assert.equal(pushHrefForKind("shift_cancelled_no_start", "parent", { booking_id: "b1" }), "/parent/dashboard");

assert.equal(SHIFT_END_REMINDER_KIND, "shift_end_reminder");
assert.equal(SHIFT_END_REMINDER_LEAD_MINUTES, 30);
assert.equal(SHIFT_END_REMINDER_TIMEZONE, "Asia/Jerusalem");
assert.equal(SHIFT_END_REMINDER_TITLE, PARENT_TITLE);
assert.equal(
  formatShiftEndReminderParentBody("נועה", "21:00"),
  "המשמרת עם נועה מתוכננת להסתיים בשעה 21:00. אם אתם צפויים לאחר, מומלץ לעדכן אותה מראש."
);
assert.equal(
  formatShiftEndReminderSitterBody("21:00"),
  "שעת הסיום המתוכננת של המשמרת היא 21:00."
);
assert.equal(shiftEndReminderDedupeKey("b1"), "b1");
assert.match(formatShiftEndTimeLabel(scheduledEnd), /^\d{2}:\d{2}$/);

assert.equal(
  isWithinShiftEndReminderWindow({ now: reminderAt, scheduledStart, scheduledEnd }),
  true
);
assert.equal(
  isWithinShiftEndReminderWindow({ now: beforeWindow, scheduledStart, scheduledEnd }),
  false
);
assert.equal(
  isWithinShiftEndReminderWindow({ now: afterScheduledEnd, scheduledStart, scheduledEnd }),
  false
);

assert.equal(
  shouldSendShiftEndReminder({
    now: reminderAt,
    scheduledStart,
    scheduledEnd,
    bookingStatus: "approved"
  }),
  false
);
assert.equal(
  shouldSendShiftEndReminder({
    now: reminderAt,
    scheduledStart,
    scheduledEnd,
    bookingStatus: "approved",
    ...sitterOnlyShake
  }),
  false
);
assert.equal(
  shouldSendShiftEndReminder({
    now: reminderAt,
    scheduledStart,
    scheduledEnd,
    bookingStatus: "parent_started",
    ...bothShakes
  }),
  true
);
assert.equal(
  shouldSendShiftEndReminder({
    now: reminderAt,
    scheduledStart,
    scheduledEnd,
    bookingStatus: "cancelled",
    ...bothShakes
  }),
  false
);
assert.equal(
  shouldSendShiftEndReminder({
    now: reminderAt,
    scheduledStart,
    scheduledEnd,
    bookingStatus: "parent_started",
    actualEndTime: reminderAt.toISOString(),
    ...bothShakes
  }),
  false
);
assert.equal(
  shouldSendShiftEndReminder({
    now: reminderAt,
    scheduledStart,
    scheduledEnd,
    bookingStatus: "parent_started",
    sessionEndTime: reminderAt.toISOString(),
    ...bothShakes
  }),
  false
);
assert.equal(
  shouldSendShiftEndReminder({
    now: beforeWindow,
    scheduledStart,
    scheduledEnd,
    bookingStatus: "parent_started",
    ...bothShakes
  }),
  false
);

assert.match(sql, /sitter_start_shake is not null/);
assert.match(sql, /parent_start_shake is not null/);
assert.match(sql, /booking_has_completed_double_shake_start/);
assert.match(sql, /create or replace function public\.cancel_approved_bookings_without_start\(\)/);
assert.match(sql, /b\.start_time \+ interval '30 minutes' <= now\(\)/);
assert.match(sql, /not public\.booking_has_completed_double_shake_start/);
assert.match(sql, /status = 'cancelled'/);
assert.match(sql, /cancelled_by = null/);
assert.match(sql, /cancellation_message = 'no_start_confirmation'/);
assert.match(sql, /'shift_cancelled_no_start'/);
assert.match(sql, /'cancellation_reason', 'no_start_confirmation'/);
assert.match(sql, /'cancelled_role', 'system'/);
assert.match(sql, /המשמרת בוטלה/);
assert.match(sql, /המשמרת שתוכננה להתחיל בשעה %s בוטלה אוטומטית מכיוון שלא אושרה התחלת המשמרת\./);
assert.match(sql, /to_char\(timezone\('Asia\/Jerusalem', v_start\), 'HH24:MI'\)/);
assert.match(sql, /n\.kind = 'shift_cancelled_no_start'|create_canonical_notification\(\s*v_parent,\s*'shift_cancelled_no_start'/);
assert.match(sql, /create_canonical_notification\(\s*v_sitter,\s*'shift_cancelled_no_start'/);
assert.match(sql, /v_id::text/);
assert.match(sql, /when unique_violation then/);
assert.match(sql, /when 'shift_cancelled_no_start' then new\.payload->>'booking_id'/);
assert.doesNotMatch(sql, /request_booking_cancellation|approve_booking_cancellation/);
assert.doesNotMatch(sql, /end_shift_atomic/);
assert.doesNotMatch(sql, /final_amount_nis|total_amount_charged|hourly_rate_nis/);
assert.doesNotMatch(sql, /insert into public\.ratings/i);
assert.doesNotMatch(sql, /payment_status|finalize_verified_hyp_payment|hyp_trans_id/);
assert.doesNotMatch(sql, /delete from public\.bookings/i);
assert.match(sql, /revoke all on function public\.cancel_approved_bookings_without_start\(\) from authenticated/);

assert.match(sql, /create or replace function public\.notify_shift_end_reminders\(\)/);
assert.match(sql, /and public\.booking_has_completed_double_shake_start\(b\.id\)/);
assert.match(sql, /and public\.booking_has_completed_double_shake_start\(live\.id\)/);
assert.match(sql, /b\.end_time - interval '30 minutes' <= now\(\)/);
assert.match(sql, /b\.end_time > now\(\)/);
assert.match(sql, /'shift_end_reminder'/);
assert.match(sql, /n\.dedupe_key = b\.id::text/);
assert.match(sql, /המשמרת מסתיימת בעוד 30 דקות/);
assert.match(sql, /המשמרת עם %s מתוכננת להסתיים בשעה %s\. אם אתם צפויים לאחר, מומלץ לעדכן אותה מראש\./);
assert.match(sql, /שעת הסיום המתוכננת של המשמרת היא %s\./);
assert.match(sql, /to_char\(timezone\('Asia\/Jerusalem', v_end\), 'HH24:MI'\)/);
assert.doesNotMatch(sql, /29 minutes|31 minutes/);

const jobFn = sql.slice(sql.indexOf("run_pending_booking_lifecycle_job"));
const expireCall = jobFn.indexOf("expire_pending_bookings()");
const pendingRemindCall = jobFn.indexOf("notify_pending_no_response_reminders()");
const cancelCall = jobFn.indexOf("cancel_approved_bookings_without_start()");
const shiftRemindCall = jobFn.indexOf("notify_shift_end_reminders()");
assert.ok(
  expireCall >= 0 &&
    pendingRemindCall > expireCall &&
    cancelCall > pendingRemindCall &&
    shiftRemindCall > cancelCall
);
assert.doesNotMatch(sql, /cron\.schedule/);
assert.doesNotMatch(sql, /setTimeout/);
assert.match(pendingLifecycle, /cron\.schedule\(\s*'anynanny-pending-booking-lifecycle'/);

assert.doesNotMatch(endShiftAtomic, /shift_end_reminder|shift_cancelled_no_start|no_start_confirmation/);
assert.doesNotMatch(hypPayment, /shift_end_reminder|no_start_confirmation/);
assert.doesNotMatch(hypFinalize, /shift_end_reminder|no_start_confirmation/);
assert.doesNotMatch(sessionBilling, /shift_end_reminder|cancel_approved_bookings_without_start/);
assert.doesNotMatch(computeCharge, /shift_end_reminder|no_start_confirmation/);
assert.doesNotMatch(doubleShake, /shift_end_reminder|no_start_confirmation/);
assert.doesNotMatch(twoPartyCancel, /cancel_approved_bookings_without_start/);
assert.match(ratingsInsert, /completed', 'payment_pending', 'paid', 'sitter_completed'/);
assert.doesNotMatch(sql, /insert into public\.ratings/);
assert.doesNotMatch(ratingsPublished, /no_start_confirmation/);
assert.match(canonicalNotifs, /create_canonical_notification/);
assert.match(kinds, /"shift_cancelled_no_start"/);
assert.match(payload, /shift_cancelled_no_start:/);
assert.match(helper, /isCanonicalDoubleShakeStartCompleted/);
assert.match(noStartHelper, /NO_START_CONFIRMATION_REASON = "no_start_confirmation"/);
assert.doesNotMatch(helper, /setTimeout|setInterval/);
assert.doesNotMatch(sql, /sitter_start_shake =|parent_start_shake =/);

console.log("shift end reminder + no-start cancellation checks passed.");
