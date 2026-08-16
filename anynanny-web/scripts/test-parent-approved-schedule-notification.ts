import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  findUnacknowledgedFutureConfirmedBooking,
  isApprovedScheduleNotificationCandidate,
  shouldShowApprovedScheduleNotification
} from "../lib/bookings/dismissed-approved-bookings";
import { isFutureConfirmedScheduleBooking } from "../lib/bookings/booking-shift-ui";
import type { BookingRow } from "../lib/bookings/constants";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

function booking(overrides: Partial<BookingRow> & Pick<BookingRow, "id" | "status">): BookingRow {
  return {
    parent_id: "parent-1",
    sitter_id: "sitter-1",
    booking_date: "2026-08-20",
    start_time: "2026-08-20T18:00:00.000Z",
    end_time: "2026-08-20T22:00:00.000Z",
    created_at: "2026-08-16T10:00:00.000Z",
    updated_at: "2026-08-16T11:00:00.000Z",
    parent_notified_at: null,
    ...overrides
  };
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

const nowDate = new Date();
const now = nowDate.getTime();
const today = isoDate(nowDate);
const future = new Date(nowDate);
future.setDate(future.getDate() + 5);
const futureDay = isoDate(future);
const future2 = new Date(nowDate);
future2.setDate(future2.getDate() + 8);
const futureDay2 = isoDate(future2);

const futureApproved = booking({
  id: "approved-future-1",
  status: "approved",
  booking_date: futureDay,
  start_time: `${futureDay}T18:00:00.000Z`,
  end_time: `${futureDay}T22:00:00.000Z`
});
const futureApprovedAcked = booking({
  id: "approved-future-acked",
  status: "approved",
  booking_date: futureDay,
  start_time: `${futureDay}T18:00:00.000Z`,
  end_time: `${futureDay}T22:00:00.000Z`,
  parent_notified_at: nowDate.toISOString()
});
const futureApprovedOther = booking({
  id: "approved-future-2",
  status: "approved",
  booking_date: futureDay2,
  start_time: `${futureDay2}T18:00:00.000Z`,
  end_time: `${futureDay2}T22:00:00.000Z`
});
const todayApproved = booking({
  id: "approved-today",
  status: "approved",
  booking_date: today,
  start_time: `${today}T18:00:00.000Z`,
  end_time: `${today}T22:00:00.000Z`
});
const futurePending = booking({
  id: "pending-future",
  status: "pending",
  booking_date: futureDay,
  start_time: `${futureDay}T18:00:00.000Z`,
  end_time: `${futureDay}T22:00:00.000Z`
});

assert.equal(isFutureConfirmedScheduleBooking(futureApproved, now), true);
assert.equal(shouldShowApprovedScheduleNotification(futureApproved, undefined, now), true);
assert.equal(shouldShowApprovedScheduleNotification(futureApprovedAcked, undefined, now), false);
assert.equal(
  shouldShowApprovedScheduleNotification(futureApproved, new Set(["approved-future-1"]), now),
  false
);
assert.equal(shouldShowApprovedScheduleNotification(todayApproved, undefined, now), false);
assert.equal(shouldShowApprovedScheduleNotification(futurePending, undefined, now), false);

assert.equal(
  findUnacknowledgedFutureConfirmedBooking(
    [futureApprovedAcked, futureApprovedOther],
    undefined,
    null,
    now
  )?.id,
  "approved-future-2"
);

assert.equal(
  findUnacknowledgedFutureConfirmedBooking(
    [futureApprovedAcked, futureApprovedOther],
    new Set(["approved-future-2"]),
    null,
    now
  ),
  null
);

assert.equal(
  isApprovedScheduleNotificationCandidate(
    futureApprovedAcked,
    undefined,
    "approved-future-acked",
    now
  ),
  true,
  "sticky id keeps the current-visit success card after DB ack"
);

assert.equal(
  isApprovedScheduleNotificationCandidate(futureApprovedAcked, undefined, null, now),
  false,
  "after a new visit, an acknowledged approval must not surface again"
);

const dashboard = read("components/parent/parent-dashboard-client.tsx");
assert.match(dashboard, /המשמרת נקבעה בהצלחה/);
assert.match(dashboard, /acknowledgeApprovedBookingNotification/);
assert.match(dashboard, /shouldShowApprovedScheduleNotification/);
assert.match(dashboard, /isScheduledConfirmed[\s\S]*acknowledgeApprovedBookingNotification/);
assert.match(dashboard, /isScheduledPending[\s\S]*persistDismissedScheduledBookingId/);

const helper = read("lib/bookings/dismissed-approved-bookings.ts");
assert.match(helper, /parent_notified_at/);
assert.match(helper, /anynanny_dismissed_approved_bookings_v1/);
assert.doesNotMatch(helper, /sessionStorage/);

const page = read("app/parent/dashboard/page.tsx");
assert.match(page, /parent_notified_at/);
assert.match(page, /shouldShowApprovedScheduleNotification/);

const calendar = read("lib/bookings/calendar-shift-filters.ts");
assert.doesNotMatch(
  calendar,
  /parent_notified_at/,
  "calendar visibility must not depend on notification acknowledgement"
);

console.log("test-parent-approved-schedule-notification: ok");
