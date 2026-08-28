import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  bookingCalendarDateISO,
  bookingDateMatchesInclusiveRange,
  isReversedCalendarDateRange
} from "../lib/bookings/booking-date-utils";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

const rows = [
  { id: "a", booking_date: "2026-08-01" },
  { id: "b", booking_date: "2026-08-10" },
  { id: "c", booking_date: "2026-08-20T12:00:00" },
  { id: "d", booking_date: "2026-08-31" }
];

function filterRows(fromIso: string, toIso: string) {
  if (isReversedCalendarDateRange(fromIso, toIso)) {
    return rows;
  }
  return rows.filter((row) => bookingDateMatchesInclusiveRange(row.booking_date, fromIso, toIso));
}

// no dates -> all
assert.deepEqual(
  filterRows("", "").map((r) => r.id),
  ["a", "b", "c", "d"]
);

// from only
assert.deepEqual(
  filterRows("2026-08-10", "").map((r) => r.id),
  ["b", "c", "d"]
);

// to only
assert.deepEqual(
  filterRows("", "2026-08-10").map((r) => r.id),
  ["a", "b"]
);

// inclusive range
assert.deepEqual(
  filterRows("2026-08-10", "2026-08-20").map((r) => r.id),
  ["b", "c"]
);

// same start/end date
assert.deepEqual(
  filterRows("2026-08-10", "2026-08-10").map((r) => r.id),
  ["b"]
);

// reversed range does not silently empty the list
assert.equal(isReversedCalendarDateRange("2026-08-20", "2026-08-01"), true);
assert.deepEqual(
  filterRows("2026-08-20", "2026-08-01").map((r) => r.id),
  ["a", "b", "c", "d"]
);

// empty matching range
assert.deepEqual(filterRows("2026-09-01", "2026-09-30").map((r) => r.id), []);

// local calendar prefix, no UTC Date() conversion
assert.equal(bookingCalendarDateISO("2026-08-10"), "2026-08-10");
assert.equal(bookingCalendarDateISO("2026-08-10T23:00:00.000Z"), "2026-08-10");
assert.equal(bookingCalendarDateISO(""), "");

const page = read("app/sitter/shifts/page.tsx");
assert.match(page, /סינון לפי תאריכים/);
assert.match(page, /htmlFor="sitter-past-from-date"/);
assert.match(page, /htmlFor="sitter-past-to-date"/);
assert.match(page, /מתאריך/);
assert.match(page, /עד תאריך/);
assert.match(page, /נקה סינון/);
assert.match(page, /לא נמצאו משמרות בטווח התאריכים שנבחר/);
assert.match(page, /תאריך ההתחלה לא יכול להיות אחרי תאריך הסיום/);
assert.match(page, /bookingDateMatchesInclusiveRange\(shift\.booking_date/);
assert.match(page, /visibleShifts\.map/);
assert.doesNotMatch(page, /setPastFromDate[\s\S]{0,80}fetchListShifts/);
assert.doesNotMatch(page, /pastFromDate[\s\S]{0,80}\.gte\(/);

console.log("sitter completed-shifts date filter checks passed");
