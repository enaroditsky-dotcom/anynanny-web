import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildSearchEndTimeIso,
  buildSearchStartTimeIso,
  normalizeParentSearchFilters,
  type ParentSearchFilters
} from "../lib/sitter/parent-search-filters";
import {
  isParentSearchCalendarDateSelectable,
  isParentSearchDateTimeStrictlyFuture,
  isParentSearchHourSelectable,
  isParentSearchMinuteSelectable,
  parentSearchClockAfterDateChange,
  parentSearchEarliestSelectableDate,
  parentSearchEndDateMin,
  parentSearchLocalCalendarDate,
  parentSearchLocalDateTime
} from "../lib/sitter/parent-search-datetime";
import {
  PARENT_SEARCH_PAST_DATETIME_MESSAGE,
  validateParentSearchCriteria
} from "../lib/sitter/parent-search-validation";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

/** Local 26 Oct 2026, 14:37:00 — the product example. */
const NOW = new Date(2026, 9, 26, 14, 37, 0, 0);
const TODAY = "2026-10-26";
const YESTERDAY = "2026-10-25";
const EARLIER = "2026-01-01";
const TOMORROW = "2026-10-27";
const FUTURE = "2026-11-15";

function filters(partial: Partial<ParentSearchFilters>): ParentSearchFilters {
  return normalizeParentSearchFilters({
    selectedCity: "חיפה",
    searchDate: TODAY,
    searchEndDate: TODAY,
    searchStartHour: "16",
    searchStartMinute: "00",
    searchEndHour: "18",
    searchEndMinute: "30",
    minYearsExperience: 3,
    minRating: "4",
    maxHourlyRate: 80,
    verifiedOnly: true,
    favoritesOnly: true,
    searchSitterSerial: "AN-1004",
    transport: "taxi",
    ...partial
  });
}

assert.equal(parentSearchLocalCalendarDate(NOW), TODAY);
assert.equal(parentSearchEarliestSelectableDate(NOW), TODAY);

const earlyMorning = new Date(2026, 9, 26, 0, 30, 0, 0);
assert.equal(parentSearchLocalCalendarDate(earlyMorning), "2026-10-26");
assert.equal(earlyMorning.getFullYear(), 2026);
assert.equal(earlyMorning.getMonth(), 9);
assert.equal(earlyMorning.getDate(), 26);
const utcDay = earlyMorning.toISOString().slice(0, 10);
if (utcDay !== "2026-10-26") {
  assert.equal(isParentSearchCalendarDateSelectable(utcDay, earlyMorning), false);
}
assert.equal(isParentSearchCalendarDateSelectable("2026-10-26", earlyMorning), true);
assert.equal(isParentSearchMinuteSelectable("2026-10-26", "00", "30", earlyMorning), false);
assert.equal(isParentSearchMinuteSelectable("2026-10-26", "00", "31", earlyMorning), true);

const localStart = parentSearchLocalDateTime(TODAY, "16", "00");
assert.ok(localStart);
assert.equal(localStart.getFullYear(), 2026);
assert.equal(localStart.getMonth(), 9);
assert.equal(localStart.getDate(), 26);
assert.equal(localStart.getHours(), 16);
assert.equal(localStart.getMinutes(), 0);
const futureFilters = filters({});
assert.equal(new Date(buildSearchStartTimeIso(futureFilters)!).getTime(), localStart.getTime());
assert.equal(
  new Date(buildSearchEndTimeIso(futureFilters)!).getTime(),
  parentSearchLocalDateTime(TODAY, "18", "30")!.getTime()
);

// 1–5. Calendar days.
assert.equal(isParentSearchCalendarDateSelectable(YESTERDAY, NOW), false);
assert.equal(isParentSearchCalendarDateSelectable(EARLIER, NOW), false);
assert.equal(isParentSearchCalendarDateSelectable(TODAY, NOW), true);
assert.equal(isParentSearchCalendarDateSelectable(TOMORROW, NOW), true);
assert.equal(isParentSearchCalendarDateSelectable(FUTURE, NOW), true);
assert.equal(isParentSearchCalendarDateSelectable("2026-02-31", NOW), false);
assert.equal(parentSearchEndDateMin(TODAY, NOW), TODAY);
assert.equal(parentSearchEndDateMin(TOMORROW, NOW), TOMORROW);
assert.equal(parentSearchEndDateMin(YESTERDAY, NOW), TODAY);

// 6–10. Today, current time 14:37. Example slots 00 / 15 / 30 / 45.
assert.equal(isParentSearchHourSelectable(TODAY, "13", NOW), false);
assert.equal(isParentSearchHourSelectable(TODAY, "00", NOW), false);
assert.equal(isParentSearchHourSelectable(TODAY, "14", NOW), true);
for (const minute of ["00", "15", "30", "37"]) {
  assert.equal(isParentSearchMinuteSelectable(TODAY, "14", minute, NOW), false, minute);
  assert.equal(isParentSearchDateTimeStrictlyFuture(TODAY, "14", minute, NOW), false);
}
for (const minute of ["38", "45", "59"]) {
  assert.equal(isParentSearchMinuteSelectable(TODAY, "14", minute, NOW), true, minute);
}
assert.equal(isParentSearchHourSelectable(TODAY, "15", NOW), true);
assert.equal(isParentSearchHourSelectable(TODAY, "23", NOW), true);
for (let minute = 0; minute < 60; minute += 1) {
  const label = String(minute).padStart(2, "0");
  assert.equal(isParentSearchMinuteSelectable(TODAY, "13", label, NOW), false);
  assert.equal(isParentSearchMinuteSelectable(TODAY, "15", label, NOW), true);
}

const endOfHour = new Date(2026, 9, 26, 14, 59, 0, 0);
assert.equal(isParentSearchHourSelectable(TODAY, "14", endOfHour), false);
assert.equal(isParentSearchMinuteSelectable(TODAY, "14", "59", endOfHour), false);
assert.equal(isParentSearchHourSelectable(TODAY, "15", endOfHour), true);

const justBeforeNextMinute = new Date(2026, 9, 26, 14, 58, 59, 0);
assert.equal(isParentSearchMinuteSelectable(TODAY, "14", "58", justBeforeNextMinute), false);
assert.equal(isParentSearchMinuteSelectable(TODAY, "14", "59", justBeforeNextMinute), true);
assert.equal(isParentSearchHourSelectable(TODAY, "14", justBeforeNextMinute), true);

// 11–12. Tomorrow and later: 00:00 and every normal hour/minute stay enabled.
assert.equal(isParentSearchDateTimeStrictlyFuture(TOMORROW, "00", "00", NOW), true);
assert.equal(isParentSearchHourSelectable(TOMORROW, "00", NOW), true);
assert.equal(isParentSearchMinuteSelectable(TOMORROW, "00", "00", NOW), true);
for (let hour = 0; hour < 24; hour += 1) {
  const label = String(hour).padStart(2, "0");
  assert.equal(isParentSearchHourSelectable(TOMORROW, label, NOW), true);
  assert.equal(isParentSearchHourSelectable(FUTURE, label, NOW), true);
  assert.equal(isParentSearchMinuteSelectable(TOMORROW, label, "00", NOW), true);
  assert.equal(isParentSearchMinuteSelectable(TOMORROW, label, "59", NOW), true);
  assert.equal(isParentSearchMinuteSelectable(FUTURE, label, "30", NOW), true);
}

// 13. Future date + early time, then the day becomes today.
assert.deepEqual(parentSearchClockAfterDateChange(TODAY, "09", "00", NOW), { hour: "", minute: "" });
assert.deepEqual(parentSearchClockAfterDateChange(TODAY, "14", "30", NOW), { hour: "14", minute: "" });
assert.deepEqual(parentSearchClockAfterDateChange(TODAY, "14", "45", NOW), { hour: "14", minute: "45" });
assert.deepEqual(parentSearchClockAfterDateChange(TODAY, "18", "00", NOW), { hour: "18", minute: "00" });
assert.deepEqual(parentSearchClockAfterDateChange(TOMORROW, "00", "00", NOW), {
  hour: "00",
  minute: "00"
});
assert.deepEqual(parentSearchClockAfterDateChange(YESTERDAY, "18", "00", NOW), {
  hour: "",
  minute: ""
});

// 14. A clock that was valid when chosen is rejected once it is no longer in the future.
const stale = filters({
  searchStartHour: "14",
  searchStartMinute: "45",
  searchEndHour: "16",
  searchEndMinute: "00"
});
const whileValid = validateParentSearchCriteria(stale, NOW);
assert.equal(whileValid.ok, true);
const afterItPasses = validateParentSearchCriteria(stale, new Date(2026, 9, 26, 14, 45, 0, 0));
assert.equal(afterItPasses.ok, false);
if (!afterItPasses.ok) {
  assert.equal(afterItPasses.error, PARENT_SEARCH_PAST_DATETIME_MESSAGE);
  assert.equal(afterItPasses.error, "לא ניתן לבקש משמרת בעבר");
  assert.deepEqual(afterItPasses.missing, ["searchStartTime"]);
}

const pastStart = validateParentSearchCriteria(
  filters({
    searchStartHour: "14",
    searchStartMinute: "30",
    searchEndHour: "18",
    searchEndMinute: "00"
  }),
  NOW
);
assert.equal(pastStart.ok, false);
if (!pastStart.ok) {
  assert.equal(pastStart.error, PARENT_SEARCH_PAST_DATETIME_MESSAGE);
  assert.deepEqual(pastStart.missing, ["searchStartTime"]);
  assert.equal(pastStart.missing.includes("searchDate"), false);
}

const bothPast = validateParentSearchCriteria(
  filters({
    searchStartHour: "10",
    searchStartMinute: "00",
    searchEndHour: "12",
    searchEndMinute: "00"
  }),
  NOW
);
assert.equal(bothPast.ok, false);
if (!bothPast.ok) {
  assert.deepEqual(bothPast.missing, ["searchStartTime", "searchEndTime"]);
}

const yesterday = validateParentSearchCriteria(
  filters({ searchDate: YESTERDAY, searchEndDate: YESTERDAY }),
  NOW
);
assert.equal(yesterday.ok, false);
if (!yesterday.ok) {
  assert.equal(yesterday.error, PARENT_SEARCH_PAST_DATETIME_MESSAGE);
  assert.equal(yesterday.missing.includes("searchDate"), true);
}

const serialPast = validateParentSearchCriteria(
  filters({
    searchSitterSerial: "AN-1004",
    searchStartHour: "09",
    searchStartMinute: "00",
    searchEndHour: "12",
    searchEndMinute: "00"
  }),
  NOW
);
assert.equal(serialPast.ok, false);

// 18–19. A normal future search still submits, and unrelated filters are unchanged.
const accepted = validateParentSearchCriteria(futureFilters, NOW);
assert.equal(accepted.ok, true);
if (accepted.ok) {
  assert.equal(accepted.filters.selectedCity, "חיפה");
  assert.equal(accepted.filters.minYearsExperience, 3);
  assert.equal(accepted.filters.minRating, "4");
  assert.equal(accepted.filters.maxHourlyRate, 80);
  assert.equal(accepted.filters.transport, "taxi");
  assert.equal(accepted.filters.verifiedOnly, true);
  assert.equal(accepted.filters.favoritesOnly, true);
  assert.equal(accepted.filters.searchSitterSerial, "AN-1004");
  assert.equal(accepted.filters.serviceType, "babysitter");
  assert.equal(accepted.shift.startIso, buildSearchStartTimeIso(accepted.filters));
  assert.equal(accepted.shift.endIso, buildSearchEndTimeIso(accepted.filters));
  assert.ok(new Date(accepted.shift.startIso).getTime() > NOW.getTime());
}

const overnight = validateParentSearchCriteria(
  filters({
    searchDate: TODAY,
    searchEndDate: TOMORROW,
    searchStartHour: "22",
    searchStartMinute: "15",
    searchEndHour: "00",
    searchEndMinute: "00"
  }),
  NOW
);
assert.equal(overnight.ok, true);

const inverted = validateParentSearchCriteria(
  filters({
    searchDate: TOMORROW,
    searchEndDate: TOMORROW,
    searchStartHour: "16",
    searchStartMinute: "00",
    searchEndHour: "13",
    searchEndMinute: "00"
  }),
  NOW
);
assert.equal(inverted.ok, false);
if (!inverted.ok) {
  assert.match(inverted.error, /מועד הסיום חייב להיות אחרי מועד ההתחלה/);
}

const frozen = NOW.getTime();
assert.equal(isParentSearchHourSelectable(TODAY, "14", NOW), true);
assert.equal(validateParentSearchCriteria(futureFilters, NOW).ok, true);
assert.equal(NOW.getTime(), frozen);

// 15–17, 20–21. Native date + selects stay in place; disabled options are real disabled controls.
const ui = read("components/parent/parent-search-filters.tsx");
const css = read("app/globals.css");
const validation = read("lib/sitter/parent-search-validation.ts");
const searchPage = read("app/parent/search/page.tsx");
const resultsPage = read("app/parent/search/results/page.tsx");

assert.match(ui, /type="date"/);
assert.match(ui, /<select/);
assert.match(ui, /min=\{todayIso\}/);
assert.match(ui, /min=\{endDateMin\}/);
assert.match(ui, /isParentSearchCalendarDateSelectable\(searchDate, at\)/);
assert.match(ui, /isParentSearchCalendarDateSelectable\(searchEndDate, at\)/);
assert.match(ui, /disabled=\{hourDisabled\}/);
assert.match(ui, /disabled=\{minuteDisabled\}/);
assert.match(ui, /parent-search-time-select/);
assert.match(ui, /parentSearchClockAfterDateChange/);
assert.match(ui, /!isParentSearchHourSelectable\(day, hour, at\)/);
assert.match(ui, /!isParentSearchMinuteSelectable\(day, hour, minute, at\)/);
assert.match(ui, /min-h-\[44px\]/);
assert.match(ui, /CityAutocomplete/);
assert.match(ui, /שנות ניסיון/);
assert.match(ui, /דירוג מינימלי/);
assert.match(ui, /מחיר שעתי מקסימלי/);
assert.doesNotMatch(ui, /react-datepicker|day-picker|flatpickr/i);

assert.match(css, /\.parent-search-time-select option:disabled/);
assert.match(css, /background-color:\s*#f3f4f6;/);
assert.match(css, /color:\s*#9ca3af;/);
assert.match(css, /cursor:\s*not-allowed;/);
assert.match(css, /option:disabled:hover/);

assert.match(validation, /isParentSearchDateTimeStrictlyFuture/);
assert.match(searchPage, /const criteria = validateParentSearchCriteria\(filters\)/);
assert.match(searchPage, /setSearchError\(criteria\.error\)/);
assert.match(searchPage, /setInvalidFields\(criteria\.missing\)/);
assert.match(resultsPage, /if \(!criteria\.ok\)/);
assert.match(resultsPage, /setSearchError\(criteria\.error\)/);

console.log("parent search future datetime: ok");
