import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  formatRequestedShiftDateLabel,
  formatRequestedShiftTimeRange,
  requestedShiftFromFilters,
  requestedShiftFromSearchParams,
  validateRequestedShiftWindow
} from "../lib/bookings/requested-shift";
import { SITTER_UNAVAILABLE_FOR_WINDOW_MESSAGE } from "../lib/bookings/create-booking";
import {
  OVERLAP_BLOCKING_BOOKING_STATUSES,
  OVERLAP_BLOCKING_SESSION_STATUSES,
  shiftWindowsOverlap
} from "../lib/bookings/sitter-shift-overlap";
import {
  buildSearchEndTimeIso,
  buildSearchStartTimeIso,
  defaultParentSearchFilters,
  hasExplicitRequestedShiftFields,
  normalizeParentSearchFilters,
  parentSearchFiltersToUrlSearchParams,
  parseFiltersFromSearchParams,
  toListPublicSittersSearchRpcArgs
} from "../lib/sitter/parent-search-filters";
import {
  PARENT_SEARCH_MISSING_CRITERIA_MESSAGE,
  PARENT_SEARCH_MISSING_SHIFT_MESSAGE,
  validateParentSearchCriteria
} from "../lib/sitter/parent-search-validation";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function localYmd(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/**
 * Future local calendar day so `validateShiftWindow`'s "not in the past" check
 * stays valid regardless of when the suite runs. Overlap math below uses a
 * separate fixed timeline and does not depend on this date.
 */
function futureShiftDate(daysAhead = 14): string {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + daysAhead);
  return localYmd(date);
}

const SHIFT_DATE = futureShiftDate();

const searchFilters = normalizeParentSearchFilters({
  ...defaultParentSearchFilters(),
  searchDate: SHIFT_DATE,
  searchEndDate: SHIFT_DATE,
  searchStartHour: "13",
  searchStartMinute: "00",
  searchEndHour: "16",
  searchEndMinute: "00",
  selectedCity: "חיפה",
  minRating: "4"
});

assert.equal(hasExplicitRequestedShiftFields(searchFilters), true);

const window = requestedShiftFromFilters(searchFilters);
assert.ok(window);
assert.equal(window.startDate, SHIFT_DATE);
assert.equal(window.endDate, SHIFT_DATE);
assert.equal(window.startIso, buildSearchStartTimeIso(searchFilters));
assert.equal(window.endIso, buildSearchEndTimeIso(searchFilters));

const rpcArgs = toListPublicSittersSearchRpcArgs(searchFilters);
assert.equal(rpcArgs.p_start_time, window.startIso);
assert.equal(rpcArgs.p_end_time, window.endIso);

const serialRpcArgs = toListPublicSittersSearchRpcArgs(
  normalizeParentSearchFilters({
    ...searchFilters,
    searchSitterSerial: "AN-1001"
  })
);
assert.equal(serialRpcArgs.p_search_nanny_id, "AN-1001");
assert.equal(serialRpcArgs.p_start_time, window.startIso);
assert.equal(serialRpcArgs.p_end_time, window.endIso);
assert.equal(serialRpcArgs.p_search_city, null);

assert.equal("p_parent_lat" in rpcArgs, false);
assert.equal("p_parent_lng" in rpcArgs, false);
assert.equal("p_max_distance_km" in rpcArgs, false);

const blocking = { startMs: Date.parse("2026-08-19T12:00:00"), endMs: Date.parse("2026-08-19T15:00:00") };
assert.equal(
  shiftWindowsOverlap(blocking, {
    startMs: Date.parse("2026-08-19T10:00:00"),
    endMs: Date.parse("2026-08-19T23:00:00")
  }),
  true
);
assert.equal(
  shiftWindowsOverlap(blocking, {
    startMs: Date.parse("2026-08-19T15:00:00"),
    endMs: Date.parse("2026-08-19T18:00:00")
  }),
  false
);
assert.equal(
  shiftWindowsOverlap(blocking, {
    startMs: Date.parse("2026-08-19T16:00:00"),
    endMs: Date.parse("2026-08-19T18:00:00")
  }),
  false
);
assert.equal(
  shiftWindowsOverlap(blocking, {
    startMs: Date.parse("2026-08-19T12:00:00"),
    endMs: Date.parse("2026-08-19T15:00:00")
  }),
  true
);

assert.deepEqual([...OVERLAP_BLOCKING_BOOKING_STATUSES], ["approved", "sitter_started", "parent_started"]);
assert.deepEqual([...OVERLAP_BLOCKING_SESSION_STATUSES], ["confirmed", "in_progress", "active"]);

assert.equal(formatRequestedShiftTimeRange(window.startIso, window.endIso), "13:00–16:00");
const shiftDateLabel = formatRequestedShiftDateLabel(window.startDate);
const expectedShiftDateLabel = new Date(`${SHIFT_DATE}T12:00:00`).toLocaleDateString("he-IL", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric"
});
assert.equal(shiftDateLabel, expectedShiftDateLabel);
assert.match(shiftDateLabel, new RegExp(String(Number(SHIFT_DATE.slice(8, 10)))));
assert.match(shiftDateLabel, new RegExp(SHIFT_DATE.slice(0, 4)));

const params = parentSearchFiltersToUrlSearchParams(searchFilters);
assert.equal(params.get("date"), SHIFT_DATE);
assert.equal(params.get("endDate"), SHIFT_DATE);
assert.equal(params.get("startTime"), "13:00");
assert.equal(params.get("endTime"), "16:00");
assert.equal(params.get("city"), "חיפה");
assert.equal(params.get("minRating"), "4");

const roundTrip = requestedShiftFromSearchParams(params);
assert.ok(roundTrip);
assert.equal(roundTrip.startIso, window.startIso);
assert.equal(roundTrip.endIso, window.endIso);

const parsedFilters = parseFiltersFromSearchParams(params);
assert.equal(parsedFilters.searchDate, SHIFT_DATE);
assert.equal(parsedFilters.searchStartHour, "13");
assert.equal(parsedFilters.searchStartMinute, "00");
assert.equal(parsedFilters.searchEndHour, "16");
assert.equal(parsedFilters.searchEndMinute, "00");
assert.equal(parsedFilters.minRating, "4");
assert.equal(parsedFilters.selectedCity, "חיפה");
assert.equal(parsedFilters.verifiedOnly, false);

assert.equal(
  parentSearchFiltersToUrlSearchParams(searchFilters).get("verifiedOnly"),
  null
);

assert.equal(
  requestedShiftFromFilters(
    normalizeParentSearchFilters({
      searchDate: SHIFT_DATE
    })
  ),
  null
);

assert.equal(
  requestedShiftFromSearchParams(new URLSearchParams("city=חיפה&minRating=4")),
  null
);

const validated = validateRequestedShiftWindow(window);
assert.ok(!("error" in validated));
assert.equal(validated.startIso, window.startIso);
assert.equal(validated.endIso, window.endIso);

assert.equal(
  SITTER_UNAVAILABLE_FOR_WINDOW_MESSAGE,
  "הבייביסיטר כבר אינה פנויה בשעות שבחרת. חזור לחיפוש כדי למצוא בייביסיטר אחרת."
);

const validCriteria = validateParentSearchCriteria(searchFilters);
assert.equal(validCriteria.ok, true);
if (validCriteria.ok) {
  assert.equal(validCriteria.shift.startIso, window.startIso);
  assert.equal(validCriteria.shift.endIso, window.endIso);
  assert.equal(validCriteria.filters.selectedCity, "חיפה");
}

const missingCity = validateParentSearchCriteria(
  normalizeParentSearchFilters({
    ...searchFilters,
    selectedCity: ""
  })
);
assert.equal(missingCity.ok, false);
if (!missingCity.ok) {
  assert.equal(missingCity.error, PARENT_SEARCH_MISSING_CRITERIA_MESSAGE);
  assert.deepEqual(missingCity.missing, ["selectedCity"]);
}

const missingTimes = validateParentSearchCriteria(
  normalizeParentSearchFilters({
    selectedCity: "חיפה",
    searchDate: SHIFT_DATE,
    searchEndDate: SHIFT_DATE
  })
);
assert.equal(missingTimes.ok, false);
if (!missingTimes.ok) {
  assert.equal(missingTimes.error, PARENT_SEARCH_MISSING_SHIFT_MESSAGE);
  assert.ok(missingTimes.missing.includes("searchStartTime"));
  assert.ok(missingTimes.missing.includes("searchEndTime"));
}

const serialWithoutShift = validateParentSearchCriteria(
  normalizeParentSearchFilters({
    searchSitterSerial: "AN-1001"
  })
);
assert.equal(serialWithoutShift.ok, false);
if (!serialWithoutShift.ok) {
  assert.equal(serialWithoutShift.error, PARENT_SEARCH_MISSING_CRITERIA_MESSAGE);
}

const serialWithShift = validateParentSearchCriteria(
  normalizeParentSearchFilters({
    ...searchFilters,
    searchSitterSerial: "AN-1001"
  })
);
assert.equal(serialWithShift.ok, true);

const invertedRange = validateParentSearchCriteria(
  normalizeParentSearchFilters({
    ...searchFilters,
    searchStartHour: "16",
    searchEndHour: "13"
  })
);
assert.equal(invertedRange.ok, false);
if (!invertedRange.ok) {
  assert.match(invertedRange.error, /מועד הסיום חייב להיות אחרי מועד ההתחלה/);
}

const zeroDuration = validateParentSearchCriteria(
  normalizeParentSearchFilters({
    ...searchFilters,
    searchEndHour: "13",
    searchEndMinute: "00"
  })
);
assert.equal(zeroDuration.ok, false);

const resultsPage = read("app/parent/search/results/page.tsx");
assert.match(resultsPage, /validateParentSearchCriteria/);
assert.match(resultsPage, /if \(!criteria\.ok\)/);
assert.match(resultsPage, /runParentSitterSearch\(supabase, normalized/);
assert.doesNotMatch(resultsPage, /fetchPublicSitterSearchBySerial/);
assert.match(resultsPage, /PublicSitterSearchCardLink key=\{s\.id\} sitter=\{s\} query=\{searchQuery\}/);
assert.match(resultsPage, /parentSearchFiltersPath\(filters\)/);
assert.match(resultsPage, /חזרה לשינוי תנאי החיפוש/);
assert.doesNotMatch(resultsPage, /href="\/parent\/search"/);

const searchPage = read("app/parent/search/page.tsx");
assert.match(searchPage, /validateParentSearchCriteria/);
assert.match(searchPage, /PARENT_SEARCH_MISSING_CRITERIA_MESSAGE|criteria\.error/);
assert.match(searchPage, /setInvalidFields/);
assert.match(searchPage, /parseFiltersFromSearchParams/);

const searchCard = read("components/sitter/public-sitter-search-card.tsx");
assert.match(searchCard, /parentSitterProfilePath\(sitter\.id, query\)/);

const profilePage = read("app/parent/sitter/[sitterId]/page.tsx");
assert.match(profilePage, /requestedShiftFromSearchParams/);
assert.match(profilePage, /requestedShift=\{requestedShift\}/);
assert.match(profilePage, /\/parent\/search\/results\?\$\{resultsQuery\}/);

const modal = read("components/parent/book-shift-modal.tsx");
assert.match(modal, /requestedShift\?: RequestedShiftWindow \| null/);
assert.match(modal, /lockedShift \? lockedShift\.startIso : validated\.startIso/);
assert.match(modal, /formatRequestedShiftTimeRange/);
assert.match(modal, /lockedShift \? \(/);
assert.match(modal, /type="date"/);

const createBooking = read("lib/bookings/create-booking.ts");
assert.match(createBooking, /sitterWindowIsAvailable/);
assert.match(createBooking, /sitterHasOverlappingActiveShift/);
assert.match(createBooking, /SITTER_UNAVAILABLE_FOR_WINDOW_MESSAGE/);
assert.match(createBooking, /start_time: input.startIso/);
assert.match(createBooking, /end_time: input.endIso/);
assert.match(createBooking, /status: "pending"/);
assert.match(createBooking, /booking_source: bookingSource/);
assert.match(modal, /bookingSource:\s*"direct"/);

const searchImpl = read("lib/sitter/parent-sitter-search.ts");
assert.match(searchImpl, /hasRequestedTimeWindow/);
assert.match(searchImpl, /isSerialTargetedSearch\(filters\) && !hasRequestedTimeWindow\(filters\)/);

const migration = read("supabase/migrations/20260816210000_search_filter_sitter_window_availability.sql");
assert.match(migration, /sitter_window_is_available/);
assert.match(migration, /'approved', 'sitter_started', 'parent_started'/);
assert.match(migration, /'confirmed', 'in_progress', 'active'/);
assert.match(migration, /b\.start_time < p_end_time/);
assert.match(migration, /b\.end_time > p_start_time/);
assert.match(migration, /public\.sitter_window_is_available\(sp\.id, f\.range_start, f\.range_end\)/);
assert.doesNotMatch(migration, /f\.search_serial is not null\s+or f\.range_start is null/);

const cleanupMigration = read("supabase/migrations/20260817010000_remove_proximity_radius_search.sql");
assert.match(cleanupMigration, /public\.sitter_window_is_available\(sp\.id, f\.range_start, f\.range_end\)/);
assert.match(cleanupMigration, /drop table if exists public\.sitter_service_geo/);
assert.match(cleanupMigration, /drop table if exists public\.broadcast_alert_geo/);
assert.match(cleanupMigration, /drop function if exists public\.sitter_is_within_radius/);
assert.doesNotMatch(cleanupMigration, /sitter_is_within_radius\(sp\.id/);
assert.doesNotMatch(cleanupMigration, /p_parent_lat/);
assert.doesNotMatch(cleanupMigration, /'distance_km'/);

const appliedProximityHistory = read("supabase/migrations/20260816230000_proximity_radius_search.sql");
assert.match(appliedProximityHistory, /public\.sitter_window_is_available\(sp\.id, f\.range_start, f\.range_end\)/);

const searchUi = read("components/parent/parent-search-filters.tsx");
assert.doesNotMatch(searchUi, /ProximityRadiusControl/);
assert.doesNotMatch(searchUi, /חפש בסביבה שלי/);
assert.doesNotMatch(searchUi, /מרחק מקסימלי/);
assert.doesNotMatch(searchUi, /טווח חיפוש/);
assert.doesNotMatch(searchUi, /בדיקת מיקום/);

const broadcastPage = read("app/parent/broadcast/page.tsx");
assert.doesNotMatch(broadcastPage, /ProximityRadiusControl/);
assert.doesNotMatch(broadcastPage, /NEARBY_BROADCAST_CITY/);
assert.doesNotMatch(broadcastPage, /saveBroadcastAlertGeo/);
assert.doesNotMatch(broadcastPage, /חפש בסביבה שלי/);
assert.match(broadcastPage, /city: city/);

const broadcastModal = read("components/sitter/SitterBroadcastAlertModal.tsx");
assert.doesNotMatch(broadcastModal, /sitterMatchesBroadcastRadius/);
assert.doesNotMatch(broadcastModal, /NEARBY_BROADCAST_CITY/);
assert.match(broadcastModal, /stableCities\.length === 0/);

const personalArea = read("components/sitter/sitter-personal-area.tsx");
assert.doesNotMatch(personalArea, /hasServicePoint/);
assert.doesNotMatch(personalArea, /נקודת שירות/);

console.log("Requested shift search→booking context checks passed.");
