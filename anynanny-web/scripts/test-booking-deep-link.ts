import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CALENDAR_VIEW_OPTIONS,
  PARENT_CALENDAR_VIEW_OPTIONS
} from "../lib/bookings/calendar-shift-filters";
import {
  calendarBookingDomId,
  calendarBookingHref,
  calendarStateForFocusBooking,
  findCalendarShiftById,
  parseFocusBookingId
} from "../lib/bookings/focus-calendar-booking";
import { coordinationBookingHref } from "../lib/notifications/coordination";
import { notificationHrefForKind } from "../lib/notifications/kinds";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

const sitterViews = CALENDAR_VIEW_OPTIONS.map((option) => option.value);
const parentViews = PARENT_CALENDAR_VIEW_OPTIONS.map((option) => option.value);

const approvedFuture = {
  id: "b1",
  bookingDate: "2026-10-27",
  status: "approved"
};
const pendingFuture = {
  id: "p1",
  bookingDate: "2026-11-02",
  status: "pending"
};
const approvedToday = {
  id: "today-1",
  bookingDate: "2026-08-27",
  status: "approved"
};

assert.equal(
  notificationHrefForKind("shift_confirmed", "sitter", { booking_id: "b1" }),
  "/sitter/shifts?bookingId=b1"
);
assert.equal(
  notificationHrefForKind("booking_approved", "parent", { booking_id: "b1" }),
  "/parent/calendar?bookingId=b1"
);
assert.equal(
  coordinationBookingHref("booking_approved", "parent", { booking_id: "b1" }),
  "/parent/calendar?bookingId=b1"
);
assert.equal(
  notificationHrefForKind("booking_rejected", "parent", { booking_id: "b1" }),
  "/parent/calendar?bookingId=b1"
);
assert.equal(
  notificationHrefForKind("booking_cancellation_requested", "sitter", { booking_id: "b1" }),
  "/sitter/shifts?bookingId=b1"
);
assert.equal(
  calendarBookingHref("/sitter/shifts", "b 1/x"),
  "/sitter/shifts?bookingId=b%201%2Fx"
);
assert.equal(notificationHrefForKind("shift_confirmed", "sitter", {}), "/sitter/shifts");
assert.equal(notificationHrefForKind("booking_approved", "parent", {}), "/parent/dashboard");

assert.equal(parseFocusBookingId(null), null);
assert.equal(parseFocusBookingId("  "), null);
assert.equal(parseFocusBookingId("b1"), "b1");
assert.equal(findCalendarShiftById([approvedFuture], "missing"), null);
assert.equal(findCalendarShiftById([approvedFuture], ""), null);
assert.equal(findCalendarShiftById([approvedFuture], "b1")?.id, "b1");
assert.equal(calendarStateForFocusBooking([approvedFuture], "missing", { viewOptions: sitterViews }), null);
assert.equal(calendarStateForFocusBooking([approvedFuture], null, { viewOptions: sitterViews }), null);
assert.doesNotThrow(() => {
  calendarStateForFocusBooking([approvedFuture], "not-a-real-id", { viewOptions: sitterViews });
  parseFocusBookingId("%%%");
});

const opened = calendarStateForFocusBooking([approvedFuture, pendingFuture], "b1", {
  viewOptions: sitterViews,
  todayIso: "2026-08-27"
});
assert.equal(opened?.highlightedBookingId, "b1");
assert.equal(opened?.viewMode, "month");
assert.equal(opened?.month, 10);
assert.equal(opened?.year, 2026);
assert.equal(opened?.dateIso, "2026-10-27");

const parentPending = calendarStateForFocusBooking([approvedFuture, pendingFuture], "p1", {
  viewOptions: parentViews,
  todayIso: "2026-08-27"
});
assert.equal(parentPending?.highlightedBookingId, "p1");
assert.equal(parentPending?.viewMode, "pending_sitter_approval");

const todayFocus = calendarStateForFocusBooking([approvedToday], "today-1", {
  viewOptions: sitterViews,
  todayIso: "2026-08-27"
});
assert.equal(todayFocus?.viewMode, "today");
assert.equal(todayFocus?.highlightedBookingId, "today-1");

assert.equal(calendarBookingDomId("b1"), "calendar-booking-b1");

const panel = read("components/bookings/booking-calendar-panel.tsx");
assert.match(panel, /useState<CalendarViewMode>\("today"\)/);
assert.match(panel, /focusBookingId/);
assert.match(panel, /calendarStateForFocusBooking/);
assert.doesNotMatch(panel, /createPortal|dialog|BookingDetailsModal/);

const views = read("components/bookings/booking-calendar-views.tsx");
assert.match(views, /data-booking-id=\{shift\.id\}/);
assert.match(views, /highlightedBookingId/);
assert.match(views, /scrollIntoView/);
assert.doesNotMatch(views, /function BookingDetailsModal/);

const parentCalendar = read("app/parent/calendar/page.tsx");
assert.match(parentCalendar, /useSearchParams/);
assert.match(parentCalendar, /searchParams\.get\("bookingId"\)/);
assert.match(parentCalendar, /focusBookingId=\{focusBookingId\}/);
assert.match(parentCalendar, /<BookingCalendarPanel/);

const sitterShifts = read("app/sitter/shifts/page.tsx");
assert.match(sitterShifts, /useSearchParams/);
assert.match(sitterShifts, /searchParams\.get\("bookingId"\)/);
assert.match(sitterShifts, /focusBookingId=\{focusBookingId\}/);
assert.match(sitterShifts, /useState<ViewType>\(\s*"calendar"\s*\)/);

const kinds = read("lib/notifications/kinds.ts");
assert.match(kinds, /calendarBookingHref\("\/sitter\/shifts", bookingId\)/);
assert.match(kinds, /calendarBookingHref\("\/parent\/calendar", bookingId\)/);

const cta = read("components/notifications/global-coordination-notifications.tsx");
assert.match(cta, /coordinationBookingHref\(item\.kind, role, item\.payload\)/);
assert.match(cta, /router\.push\(href\)/);

console.log("Booking deep-link checks passed.");
