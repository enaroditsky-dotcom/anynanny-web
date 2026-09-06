import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  defaultParentSearchFilters,
  normalizeParentSearchFilters,
  parentSearchFiltersPath,
  parentSearchFiltersToUrlSearchParams,
  parentSearchResultsPath,
  parseFiltersFromSearchParams
} from "../lib/sitter/parent-search-filters";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

function paramsFromPath(path: string): URLSearchParams {
  const query = path.includes("?") ? path.slice(path.indexOf("?") + 1) : "";
  return new URLSearchParams(query);
}

const searchFilters = normalizeParentSearchFilters({
  selectedCity: "חיפה",
  searchDate: "2026-09-20",
  searchEndDate: "2026-09-21",
  searchStartHour: "13",
  searchStartMinute: "00",
  searchEndHour: "16",
  searchEndMinute: "30",
  minYearsExperience: 3,
  minRating: "4",
  maxHourlyRate: 80,
  verifiedOnly: true,
  searchSitterSerial: "AN-1004"
});

const resultsPath = parentSearchResultsPath(searchFilters);
const filtersPath = parentSearchFiltersPath(searchFilters);
const restoredFromResults = parseFiltersFromSearchParams(paramsFromPath(resultsPath));
const restoredFromBack = parseFiltersFromSearchParams(paramsFromPath(filtersPath));

// 1. results page back/edit link preserves existing search params
const resultsPage = read("app/parent/search/results/page.tsx");
const searchPage = read("app/parent/search/page.tsx");
assert.match(resultsPage, /חזרה לשינוי תנאי החיפוש/);
assert.match(resultsPage, /parentSearchFiltersPath\(filters\)/);
assert.doesNotMatch(resultsPage, /href="\/parent\/search"/);
assert.match(filtersPath, /^\/parent\/search\?/);
assert.equal(filtersPath.includes("/results"), false);
assert.deepEqual(restoredFromBack, restoredFromResults);

// 2. city is restored
assert.equal(restoredFromBack.selectedCity, "חיפה");
assert.equal(paramsFromPath(filtersPath).get("city"), "חיפה");

// 3. date/time values are restored
assert.equal(restoredFromBack.searchDate, "2026-09-20");
assert.equal(restoredFromBack.searchEndDate, "2026-09-21");
assert.equal(restoredFromBack.searchStartHour, "13");
assert.equal(restoredFromBack.searchStartMinute, "00");
assert.equal(restoredFromBack.searchEndHour, "16");
assert.equal(restoredFromBack.searchEndMinute, "30");

// 4. price is restored
assert.equal(restoredFromBack.maxHourlyRate, 80);

// 5. experience/rating are restored
assert.equal(restoredFromBack.minYearsExperience, 3);
assert.equal(restoredFromBack.minRating, "4");

// 6. verifiedOnly is restored
assert.equal(restoredFromBack.verifiedOnly, true);
assert.equal(paramsFromPath(filtersPath).get("verifiedOnly"), "1");
assert.equal(paramsFromPath(resultsPath).get("verifiedOnly"), "1");

// 7. missing params still use defaults
const empty = parseFiltersFromSearchParams(new URLSearchParams());
assert.deepEqual(empty, defaultParentSearchFilters());
assert.equal(empty.verifiedOnly, false);
assert.equal(empty.selectedCity, "");
assert.equal(empty.maxHourlyRate, null);
assert.equal(parentSearchFiltersPath(defaultParentSearchFilters()).startsWith("/parent/search"), true);
assert.match(searchPage, /parseFiltersFromSearchParams/);
assert.match(searchPage, /defaultParentSearchFilters|parseFiltersFromSearchParams\(searchParams\)/);

// 8. changing one restored field and searching again works
const edited = normalizeParentSearchFilters({
  ...restoredFromBack,
  selectedCity: "ירושלים"
});
assert.equal(edited.selectedCity, "ירושלים");
assert.equal(edited.searchDate, "2026-09-20");
assert.equal(edited.searchStartHour, "13");
assert.equal(edited.minYearsExperience, 3);
assert.equal(edited.minRating, "4");
assert.equal(edited.maxHourlyRate, 80);
assert.equal(edited.verifiedOnly, true);
const nextResults = parseFiltersFromSearchParams(
  parentSearchFiltersToUrlSearchParams(edited)
);
assert.equal(nextResults.selectedCity, "ירושלים");
assert.equal(nextResults.verifiedOnly, true);
assert.equal(nextResults.searchEndMinute, "30");
assert.match(searchPage, /parentSearchResultsPath\(filters\)/);

// 9. unrelated parent search behavior remains unchanged
assert.match(resultsPage, /runParentSitterSearch\(supabase, normalized/);
assert.match(searchPage, /validateParentSearchCriteria/);
assert.equal(restoredFromBack.searchSitterSerial, "AN-1004");
assert.equal(parentSearchResultsPath(searchFilters).startsWith("/parent/search/results?"), true);
const offVerified = parseFiltersFromSearchParams(
  parentSearchFiltersToUrlSearchParams(
    normalizeParentSearchFilters({ selectedCity: "חיפה", verifiedOnly: false })
  )
);
assert.equal(offVerified.verifiedOnly, false);
assert.equal(offVerified.selectedCity, "חיפה");

console.log("Parent search filter restore checks passed.");
