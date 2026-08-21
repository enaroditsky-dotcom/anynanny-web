import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CALENDAR_VIEW_OPTIONS,
  filterCalendarShiftsByView,
  isPendingSitterApprovalCalendarShift,
  isUpcomingOrActiveCalendarShift,
  isVisibleParentCalendarShift,
  PARENT_CALENDAR_LOAD_STATUSES,
  PARENT_CALENDAR_VIEW_OPTIONS,
  PARENT_PENDING_SITTER_APPROVAL_STATUS
} from "../lib/bookings/calendar-shift-filters";
import { todayDateISO } from "../lib/bookings/booking-date-utils";
import { isSitterBookingAwaitingApprovalStatus } from "../lib/bookings/booking-realtime-handler";
import type { BookingStatusInput } from "../lib/bookings/booking-status-normalize";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

function shift(overrides: {
  id?: string;
  status: "pending" | "approved" | "sitter_started" | "parent_started" | "rejected" | "completed" | "cancelled";
  bookingDate: string;
  startTime: string;
  endTime: string;
}) {
  return {
    id: overrides.id ?? overrides.status,
    bookingDate: overrides.bookingDate,
    startTime: overrides.startTime,
    endTime: overrides.endTime,
    status: overrides.status
  };
}

const now = Date.now();
const today = todayDateISO();
const futureDate = (() => {
  const d = new Date();
  d.setDate(d.getDate() + 4);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
})();
const pending = shift({
  id: "pending-1",
  status: "pending",
  bookingDate: futureDate,
  startTime: `${futureDate}T18:00:00`,
  endTime: `${futureDate}T22:00:00`
});
const approved = shift({
  id: "approved-1",
  status: "approved",
  bookingDate: today,
  startTime: `${today}T18:00:00`,
  endTime: `${today}T22:00:00`
});
const requestedAlias = shift({
  id: "requested-1",
  status: "pending",
  bookingDate: futureDate,
  startTime: `${futureDate}T09:00:00`,
  endTime: `${futureDate}T12:00:00`
});

assert.equal(PARENT_PENDING_SITTER_APPROVAL_STATUS, "pending");
assert.equal(isSitterBookingAwaitingApprovalStatus("pending"), true);
assert.equal(isSitterBookingAwaitingApprovalStatus({ name: "requested" }), true);
assert.equal(isSitterBookingAwaitingApprovalStatus("approved"), false);
assert.equal(isPendingSitterApprovalCalendarShift("pending"), true);
assert.equal(isPendingSitterApprovalCalendarShift({ name: "requested" } satisfies BookingStatusInput), true);
assert.equal(isPendingSitterApprovalCalendarShift("approved"), false);

assert.equal(isUpcomingOrActiveCalendarShift(pending, now), false);
assert.equal(isUpcomingOrActiveCalendarShift(approved, now), true);
assert.equal(isVisibleParentCalendarShift(pending, now), true);
assert.equal(isVisibleParentCalendarShift(approved, now), true);

const all = [pending, approved, requestedAlias];

const pendingView = filterCalendarShiftsByView(all, "pending_sitter_approval", undefined, now);
assert.deepEqual(
  pendingView.map((s) => s.id).sort(),
  ["pending-1", "requested-1"]
);
assert.ok(!pendingView.some((s) => s.status === "approved"));

for (const view of ["today", "week", "month", "all"] as const) {
  const filtered = filterCalendarShiftsByView(all, view, { month: new Date().getMonth() + 1, year: new Date().getFullYear() }, now);
  assert.ok(
    !filtered.some((s) => isPendingSitterApprovalCalendarShift(s.status)),
    `${view} must not include pending sitter-approval requests`
  );
  assert.ok(
    filtered.some((s) => s.id === "approved-1"),
    `${view} must still include today's confirmed shift`
  );
}

const cancelled = shift({
  id: "cancelled-1",
  status: "cancelled",
  bookingDate: futureDate,
  startTime: `${futureDate}T18:00:00`,
  endTime: `${futureDate}T22:00:00`
});

assert.equal(isUpcomingOrActiveCalendarShift(cancelled, now), false);
assert.ok(
  !filterCalendarShiftsByView([approved, cancelled], "all", undefined, now).some((s) => s.id === "cancelled-1")
);

assert.ok(PARENT_CALENDAR_LOAD_STATUSES.includes("pending"));
assert.ok(PARENT_CALENDAR_LOAD_STATUSES.includes("approved"));
assert.deepEqual(
  CALENDAR_VIEW_OPTIONS.map((o) => o.value),
  ["today", "week", "month", "all"]
);
assert.ok(
  PARENT_CALENDAR_VIEW_OPTIONS.some(
    (o) => o.value === "pending_sitter_approval" && o.label === "משמרות שממתינות לאישור בייביסיטר"
  )
);

const panel = read("components/bookings/booking-calendar-panel.tsx");
assert.match(panel, /viewOptions = CALENDAR_VIEW_OPTIONS/);
assert.match(panel, /pending_sitter_approval/);
assert.match(panel, /ממתינה לאישור הבייביסיטר|title="משמרות שממתינות לאישור בייביסיטר"/);

const views = read("components/bookings/booking-calendar-views.tsx");
assert.match(views, /ממתינה לאישור הבייביסיטר/);

const parentCalendar = read("app/parent/calendar/page.tsx");
assert.match(parentCalendar, /PARENT_CALENDAR_VIEW_OPTIONS/);
assert.match(parentCalendar, /isVisibleParentCalendarShift/);
assert.match(parentCalendar, /first_name, last_name/);
assert.doesNotMatch(parentCalendar, /phone|national_id|id_number|military/);

const createBooking = read("lib/bookings/create-booking.ts");
assert.match(createBooking, /status: "pending"/);

const sitterPending = read("lib/bookings/sitter-pending-bookings.ts");
assert.match(sitterPending, /\.eq\("status", "pending"\)/);
assert.match(sitterPending, /status: Extract<BookingStatus, "approved" \| "rejected">/);

const parentDashboard = read("components/parent/parent-dashboard-client.tsx");
assert.match(parentDashboard, /useParentPendingBookingCount/);
assert.match(parentDashboard, /href="\/parent\/calendar"/);
assert.doesNotMatch(
  parentDashboard.slice(parentDashboard.indexOf('href="/parent/wallet"')),
  /pendingSitterApprovalCount/
);
assert.doesNotMatch(
  parentDashboard.slice(parentDashboard.indexOf('href="/parent/history"')),
  /pendingSitterApprovalCount/
);

const sitterDashboard = read("app/sitter/dashboard/page.tsx");
assert.match(sitterDashboard, /href="\/sitter\/shifts"/);
assert.match(sitterDashboard, /pendingBookingCount/);
assert.doesNotMatch(
  sitterDashboard.slice(
    sitterDashboard.indexOf('href="/sitter/wallet"'),
    sitterDashboard.indexOf('href="/sitter/shifts"')
  ),
  /pendingBookingCount/
);

console.log("Parent pending sitter-approval calendar view checks passed.");
