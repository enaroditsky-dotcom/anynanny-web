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
import { privacySafeBodyForKind, pushHrefForKind } from "../lib/push/payload";
import {
  mapWithdrawPendingError,
  PENDING_WITHDRAW_COPY,
  WITHDRAW_PENDING_BOOKING_RPC
} from "../lib/bookings/withdraw-pending-booking";
import { isScheduledShiftCancellable } from "../lib/bookings/cancellation-request";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

const MIGRATION = "supabase/migrations/20260821120000_pending_booking_lifecycle.sql";
const sql = read(MIGRATION);
const withdrawClient = read("lib/bookings/withdraw-pending-booking.ts");
const reminderClient = read("lib/notifications/pending-no-response-reminder.ts");
const reminderHook = read("lib/notifications/use-pending-no-response-reminder.ts");
const reminderModal = read("components/bookings/pending-no-response-reminder-modal.tsx");
const withdrawButton = read("components/bookings/pending-withdraw-button.tsx");
const parentDash = read("components/parent/parent-dashboard-client.tsx");
const parentCalendar = read("app/parent/calendar/page.tsx");
const calendarViews = read("components/bookings/booking-calendar-views.tsx");
const profileActions = read("components/parent/sitter-profile-actions.tsx");
const sitterPending = read("lib/bookings/sitter-pending-bookings.ts");
const cancellationMig = read("supabase/migrations/20260818153000_booking_cancellation_request.sql");
const cancellationClient = read("lib/bookings/cancellation-request.ts");
const kinds = read("lib/notifications/kinds.ts");
const payload = read("lib/push/payload.ts");
const deliverRoute = read("app/api/push/deliver/route.ts");
const releaseStuck = read("lib/bookings/release-stuck-shift.ts");

const REMINDER_COPY = "הבייביסיטר עדיין לא הגיבה לבקשתך. לסגור את הפנייה לבייביסיטרית?";
const EXPIRED_COPY = "הבייביסיטר לא הגיבה לפנייתך. הבקשה נסגרה.";

assert.equal(WITHDRAW_PENDING_BOOKING_RPC, "withdraw_pending_booking");
assert.equal(PENDING_WITHDRAW_COPY.action, "בטל בקשה");
assert.equal(PENDING_WITHDRAW_COPY.reminderYes, "כן");
assert.equal(PENDING_WITHDRAW_COPY.reminderNo, "לא");
assert.equal(mapWithdrawPendingError("booking is not pending"), PENDING_WITHDRAW_COPY.alreadyHandled);
assert.equal(mapWithdrawPendingError("not authorized for booking"), "אין הרשאה לבצע פעולה זו.");
assert.equal(isCanonicalNotificationKind("pending_no_response_reminder"), true);
assert.equal(isCanonicalNotificationKind("booking_withdrawn_by_parent"), true);
assert.equal(isCanonicalNotificationKind("pending_booking_expired"), true);
assert.ok(CANONICAL_NOTIFICATION_KINDS.includes("pending_no_response_reminder"));
assert.equal(notificationDedupeKey("pending_no_response_reminder", { bookingId: "b1" }), "b1");
assert.equal(notificationDedupeKey("booking_withdrawn_by_parent", { bookingId: "b1" }), "b1");
assert.equal(notificationDedupeKey("pending_booking_expired", { bookingId: "b1" }), "b1");
assert.equal(notificationHrefForKind("pending_no_response_reminder", "parent", {}), "/parent/dashboard");
assert.equal(notificationHrefForKind("pending_booking_expired", "parent", {}), "/parent/dashboard");
assert.equal(notificationHrefForKind("booking_withdrawn_by_parent", "sitter", {}), "/sitter/dashboard");
assert.equal(privacySafeBodyForKind("pending_no_response_reminder"), REMINDER_COPY);
assert.equal(privacySafeBodyForKind("pending_booking_expired"), EXPIRED_COPY);
assert.equal(privacySafeBodyForKind("booking_withdrawn_by_parent"), "ההורה ביטל את בקשת המשמרת");
assert.equal(pushHrefForKind("pending_no_response_reminder", "parent", {}), "/parent/dashboard");
assert.equal(pushHrefForKind("pending_booking_expired", "parent", {}), "/parent/dashboard");
assert.equal(pushHrefForKind("booking_withdrawn_by_parent", "sitter", {}), "/sitter/dashboard");

assert.equal(
  isScheduledShiftCancellable({ status: "pending", paymentStatus: "unpaid" }),
  false
);
assert.equal(
  isScheduledShiftCancellable({ status: "approved", paymentStatus: "unpaid" }),
  true
);

// 1. Parent withdraws own pending → cancelled, row remains
assert.match(sql, /create or replace function public\.withdraw_pending_booking\(p_booking_id uuid\)/);
assert.match(sql, /v_uid uuid := auth\.uid\(\)/);
assert.match(sql, /for update/);
assert.match(sql, /v_uid is distinct from v_booking\.parent_id/);
assert.match(sql, /status = 'cancelled'/);
assert.match(sql, /cancelled_by = v_uid/);
assert.match(sql, /cancelled_at = now\(\)/);
assert.match(sql, /cancellation_requested_by = v_uid/);
assert.match(sql, /cancellation_requested_role = 'parent'/);
assert.doesNotMatch(sql, /delete from public\.bookings/i);
assert.doesNotMatch(withdrawClient, /\.delete\(/);

// 2–3. Sitter / other parent cannot withdraw
assert.match(sql, /raise exception 'not authorized for booking/);
assert.match(sql, /errcode = '42501'/);

// 4. Approved booking cannot use pending withdraw
assert.match(sql, /if v_booking\.status is distinct from 'pending'/);
assert.match(sql, /raise exception 'booking is not pending'/);

// 1b. Already cancelled is idempotent success
assert.match(sql, /if v_booking\.status = 'cancelled'/);
assert.match(sql, /'state', 'already_cancelled'/);

// 5. Withdraw notification to sitter exactly once
assert.match(sql, /'booking_withdrawn_by_parent'/);
assert.match(sql, /v_booking\.sitter_id/);
assert.match(sql, /v_booking\.id::text/);
assert.match(sql, /when 'booking_withdrawn_by_parent' then new\.payload->>'booking_id'/);

// 6–8. Reminder: 60 minutes, future start, exactly once
assert.match(sql, /create or replace function public\.notify_pending_no_response_reminders\(\)/);
assert.match(sql, /b\.status = 'pending'/);
assert.match(sql, /b\.created_at <= now\(\) - interval '60 minutes'/);
assert.doesNotMatch(sql, /59 minutes/);
assert.match(sql, /b\.start_time > now\(\)/);
assert.match(sql, /'pending_no_response_reminder'/);
assert.match(sql, /n\.kind = 'pending_no_response_reminder'/);
assert.match(sql, /n\.dedupe_key = b\.id::text/);
assert.match(sql, /לסגור את הפנייה לבייביסיטרית\?/);
assert.match(sql, /when unique_violation then/);
assert.match(sql, /revoke all on function public\.notify_pending_no_response_reminders\(\) from authenticated/);
assert.doesNotMatch(sql, /grant execute on function public\.notify_pending_no_response_reminders\(\) to authenticated/);

// 9. Parent YES → same withdraw RPC
assert.match(reminderModal, /withdrawPendingBooking/);
assert.match(reminderModal, /PENDING_WITHDRAW_COPY\.reminderYes/);
assert.match(withdrawButton, /withdrawPendingBooking/);
assert.match(withdrawClient, /supabase\.rpc\(WITHDRAW_PENDING_BOOKING_RPC/);

// 10. Parent NO → remains pending, reminder marked read, no second reminder
assert.match(reminderModal, /handleNo/);
assert.match(reminderModal, /markRead\(reminder\)/);
assert.doesNotMatch(
  reminderModal.slice(reminderModal.indexOf("handleNo"), reminderModal.indexOf("handleYes")),
  /withdrawPendingBooking/
);
assert.match(reminderClient, /markNotificationsReadBestEffort/);
assert.match(reminderClient, /pending_no_response_reminder/);
assert.match(reminderClient, /read_at/);

// 11–13. Expiry at start_time, exactly once, replay safe
assert.match(sql, /create or replace function public\.expire_pending_bookings\(\)/);
assert.match(sql, /b\.start_time <= now\(\)/);
assert.match(sql, /for update skip locked/i);
assert.match(sql, /cancelled_by = null/);
assert.match(sql, /cancelled_at = now\(\)/);
assert.match(sql, /'pending_booking_expired'/);
assert.match(sql, /when 'pending_booking_expired' then new\.payload->>'booking_id'/);
assert.match(sql, /הבייביסיטר לא הגיבה לפנייתך\. הבקשה נסגרה\./);
assert.match(sql, /revoke all on function public\.expire_pending_bookings\(\) from authenticated/);
assert.doesNotMatch(sql, /grant execute on function public\.expire_pending_bookings\(\) to authenticated/);
assert.match(sql, /and status = 'pending'/);

// 14–15. Late approval guard
assert.match(sql, /create or replace function public\.bookings_block_expired_pending_approval\(\)/);
assert.match(sql, /old\.status[\s\S]*pending[\s\S]*new\.status[\s\S]*approved/);
assert.match(sql, /old\.start_time <= now\(\)/);
assert.match(sql, /raise exception 'pending booking has expired'/);
assert.match(sql, /before update of status on public\.bookings/);
assert.match(sitterPending, /pending booking has expired/);
assert.match(sitterPending, /הבקשה פגה ולא ניתן לאשר אותה/);

// 16–17. Expire only pending (approved / already cancelled skipped)
assert.match(sql, /where b\.status = 'pending'\s+and b\.start_time <= now\(\)/);

// 18. Expire runs before reminder
const lifecycleFn = sql.slice(sql.indexOf("run_pending_booking_lifecycle_job"));
const expireCall = lifecycleFn.indexOf("expire_pending_bookings()");
const remindCall = lifecycleFn.indexOf("notify_pending_no_response_reminders()");
assert.ok(expireCall >= 0 && remindCall > expireCall, "expire must run before reminder");
assert.match(sql, /cron\.schedule\(\s*'anynanny-pending-booking-lifecycle'/);
assert.match(sql, /'\* \* \* \* \*'/);
assert.match(sql, /cron\.unschedule\('anynanny-pending-booking-lifecycle'\)/);
assert.doesNotMatch(sql, /net\.http_post|pg_net/);
assert.doesNotMatch(sql, /vercel|\/api\/cron/i);

// 19. Approved two-party cancellation unchanged
assert.match(cancellationMig, /if v_booking\.status <> 'approved'/);
assert.match(cancellationClient, /request_booking_cancellation/);
assert.match(cancellationClient, /approve_booking_cancellation/);
assert.doesNotMatch(sql, /request_booking_cancellation|approve_booking_cancellation/);
assert.doesNotMatch(withdrawClient, /request_booking_cancellation/);
assert.doesNotMatch(withdrawButton, /ShiftCancellationRequestModal|requestBookingCancellation/);
assert.doesNotMatch(withdrawButton, /releaseStuckShift|resetStuckShiftsForParent/);
assert.doesNotMatch(withdrawClient, /releaseStuckShift/);

// releaseStuckShift still exists but pending withdraw does not use it
assert.match(releaseStuck, /delete\(\)/);
assert.doesNotMatch(withdrawClient, /releaseStuckShift/);
assert.doesNotMatch(sql, /releaseStuckShift/);

// Grants: withdraw authenticated only
assert.match(sql, /grant execute on function public\.withdraw_pending_booking\(uuid\) to authenticated/);
assert.match(sql, /revoke all on function public\.withdraw_pending_booking\(uuid\) from anon/);
assert.match(sql, /revoke all on function public\.withdraw_pending_booking\(uuid\) from public/);

// UI surfaces
assert.match(parentDash, /PendingWithdrawButton/);
assert.match(parentDash, /PendingNoResponseReminderModal/);
assert.match(parentCalendar, /onWithdrawPending/);
assert.match(parentCalendar, /PendingNoResponseReminderModal/);
assert.match(calendarViews, /PendingWithdrawButton/);
assert.match(calendarViews, /status === "pending"/);
assert.match(profileActions, /PendingWithdrawButton/);
assert.match(withdrawButton, /PENDING_WITHDRAW_COPY\.action/);
assert.match(withdrawClient, /action: "בטל בקשה"/);

// Push architecture untouched
assert.match(deliverRoute, /authorizePushWebhook/);
assert.match(kinds, /pending_no_response_reminder/);
assert.match(payload, /pending_no_response_reminder/);
assert.doesNotMatch(sql, /push_subscriptions|VAPID|\/api\/push\/deliver/);

// Payload stays ID/timing/state
assert.match(sql, /'booking_id', v_booking\.id/);
assert.match(sql, /'cancelled_role', 'parent'/);
assert.doesNotMatch(sql, /address|phone|national_id|hourly_rate/);

assert.match(reminderHook, /NOTIFICATIONS_TABLE/);
assert.match(reminderClient, /\.is\("read_at", null\)/);

console.log("pending booking lifecycle checks passed.");
