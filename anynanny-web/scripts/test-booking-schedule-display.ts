import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { splitScheduleTimeRange } from "../lib/bookings/sitter-pending-bookings";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

assert.deepEqual(splitScheduleTimeRange("יום ג׳, 8 בספט׳ · 13:00–20:00"), {
  prefix: "יום ג׳, 8 בספט׳ · ",
  timeRange: "13:00–20:00"
});
assert.deepEqual(splitScheduleTimeRange("26/08/2026, 03:00–13:00"), {
  prefix: "26/08/2026, ",
  timeRange: "03:00–13:00"
});
assert.deepEqual(splitScheduleTimeRange("13:00–16:00"), {
  prefix: "",
  timeRange: "13:00–16:00"
});
assert.equal(splitScheduleTimeRange("אין טווח שעות"), null);

const renderer = read("components/bookings/booking-schedule-label.tsx");
assert.match(renderer, /dir="ltr"/);
assert.match(renderer, /export function BookingScheduleLabel/);
assert.match(renderer, /export function BookingTimeRange/);

const parentDash = read("components/parent/parent-dashboard-client.tsx");
assert.match(parentDash, /BookingScheduleLabel/);
assert.match(parentDash, /בקשה עתידית ממתינה לאישור/);
assert.doesNotMatch(parentDash, /formatBookingSchedule\(/);

console.log("Booking schedule LTR display checks passed.");
