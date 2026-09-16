import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  WAITING_FOR_SITTER_ARRIVAL_LEAD_MS,
  isBookingDueForParentActiveShiftUi,
  isFutureConfirmedScheduleBooking,
  isFutureScheduledBooking,
  isNowWithinWaitingForSitterArrivalWindow,
  isWaitingForSitterArrival
} from "../lib/bookings/booking-shift-ui";
import type { BookingStatus } from "../lib/bookings/constants";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

const NOW = Date.parse("2026-09-17T12:00:00.000Z");

function booking(overrides: Record<string, unknown> = {}) {
  return {
    id: "b1",
    parent_id: "p1",
    sitter_id: "s1",
    booking_date: "2026-09-17",
    start_time: "2026-09-17T18:00:00.000Z",
    end_time: "2026-09-17T22:00:00.000Z",
    ...overrides,
    status: ((overrides.status as BookingStatus | undefined) ?? "approved") as BookingStatus
  };
}

assert.equal(WAITING_FOR_SITTER_ARRIVAL_LEAD_MS, 30 * 60 * 1000);

const sameDayHoursBefore = booking();
assert.equal(isNowWithinWaitingForSitterArrivalWindow(sameDayHoursBefore, NOW), false);
assert.equal(isWaitingForSitterArrival(sameDayHoursBefore, NOW), false);
assert.equal(isBookingDueForParentActiveShiftUi(sameDayHoursBefore, NOW), false);
assert.equal(isFutureConfirmedScheduleBooking(sameDayHoursBefore, NOW), true);
assert.equal(isFutureScheduledBooking(sameDayHoursBefore, NOW), true);

const thirtyOneMinBefore = booking({
  start_time: "2026-09-17T12:31:00.000Z",
  end_time: "2026-09-17T16:00:00.000Z"
});
assert.equal(isWaitingForSitterArrival(thirtyOneMinBefore, NOW), false);
assert.equal(isBookingDueForParentActiveShiftUi(thirtyOneMinBefore, NOW), false);

const twentyNineMinBefore = booking({
  start_time: "2026-09-17T12:29:00.000Z",
  end_time: "2026-09-17T16:00:00.000Z"
});
assert.equal(isWaitingForSitterArrival(twentyNineMinBefore, NOW), true);
assert.equal(isBookingDueForParentActiveShiftUi(twentyNineMinBefore, NOW), true);
assert.equal(isFutureConfirmedScheduleBooking(twentyNineMinBefore, NOW), false);

const atStart = booking({
  start_time: "2026-09-17T12:00:00.000Z",
  end_time: "2026-09-17T16:00:00.000Z"
});
assert.equal(isWaitingForSitterArrival(atStart, NOW), true);

const afterEnd = booking({
  start_time: "2026-09-17T08:00:00.000Z",
  end_time: "2026-09-17T11:00:00.000Z"
});
assert.equal(isWaitingForSitterArrival(afterEnd, NOW), false);
assert.equal(isBookingDueForParentActiveShiftUi(afterEnd, NOW), false);

const sitterStarted = booking({
  status: "sitter_started",
  start_time: "2026-09-17T18:00:00.000Z"
});
assert.equal(isWaitingForSitterArrival(sitterStarted, NOW), false);
assert.equal(isBookingDueForParentActiveShiftUi(sitterStarted, NOW), true);

const pendingToday = booking({ status: "pending" });
assert.equal(isWaitingForSitterArrival(pendingToday, NOW), false);

const nextWeek = booking({
  booking_date: "2026-09-24",
  start_time: "2026-09-24T18:00:00.000Z",
  end_time: "2026-09-24T22:00:00.000Z"
});
assert.equal(isWaitingForSitterArrival(nextWeek, NOW), false);
assert.equal(isBookingDueForParentActiveShiftUi(nextWeek, NOW), false);
assert.equal(isFutureConfirmedScheduleBooking(nextWeek, NOW), true);

const dashboard = read("components/parent/parent-dashboard-client.tsx");
assert.match(dashboard, /isWaitingForSitterArrival\(activeBooking, nowMs\)/);
assert.match(dashboard, /ממתינים להגעת הבייביסיטר/);
assert.match(dashboard, /isFutureConfirmedScheduleBooking\(b, nowMs\)/);

const page = read("app/parent/dashboard/page.tsx");
assert.match(page, /isFutureConfirmedScheduleBooking\(b\)/);

const ui = read("lib/bookings/booking-shift-ui.ts");
assert.match(ui, /WAITING_FOR_SITTER_ARRIVAL_LEAD_MS/);
assert.match(ui, /nowMs >= startMs - WAITING_FOR_SITTER_ARRIVAL_LEAD_MS/);

const circle = read("components/session/parent-double-shake-idle-circle.tsx");
assert.match(circle, /isWaitingForSitterArrival\(booking\)/);

console.log("waiting-for-sitter arrival window checks passed");
