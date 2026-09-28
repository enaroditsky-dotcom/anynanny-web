import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  FAVORITE_PROMPT_PRIMARY_LABEL,
  FAVORITE_PROMPT_SECONDARY_LABEL,
  PARENT_FAVORITES_ACCORDION_TITLE,
  PARENT_FAVORITES_SEARCH_EMPTY,
  PARENT_SEARCH_FAVORITES_ONLY_LABEL,
  PARENT_SITTER_CALENDAR_BUTTON_LABEL,
  applyFavoritesOnlyFilter,
  classifyFavoriteInsert,
  favoritePromptMessage,
  favoriteRemovalNotifies,
  favoriteSitterNotificationBody,
  parentFavoritesSearchEmptyMessage,
  shouldOfferFavoritePrompt
} from "../lib/favorites/parent-favorite-rules";
import {
  buildParentAvailabilityMonth,
  isOccupyingBookingStatus,
  sanitizeParentAvailabilityDays
} from "../lib/favorites/parent-sitter-availability";
import {
  normalizeParentSearchFilters,
  toListPublicSittersSearchRpcArgs
} from "../lib/sitter/parent-search-filters";
import { notificationDedupeKey, notificationHrefForKind } from "../lib/notifications/kinds";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

const sql = read("supabase/migrations/20260928120000_parent_favorite_sitters.sql");
const favoritesClient = read("lib/favorites/parent-favorites.ts");
const resultsPage = read("app/parent/search/results/page.tsx");
const searchFilters = read("components/parent/parent-search-filters.tsx");
const personal = read("components/parent/parent-personal-area.tsx");
const favoritesSection = read("components/parent/parent-favorite-sitters-section.tsx");
const profile = read("app/parent/sitter/[sitterId]/page.tsx");
const calendarPage = read("app/parent/sitter/[sitterId]/calendar/page.tsx");
const availabilityRoute = read("app/api/parent/sitter/[id]/availability/route.ts");
const dashboard = read("components/parent/parent-dashboard-client.tsx");
const ratingSubmit = read("lib/ratings/submit-session-rating.ts");

assert.match(sql, /create table if not exists public\.parent_favorite_sitters/);
assert.match(sql, /parent_id uuid not null references auth\.users \(id\) on delete cascade/);
assert.match(sql, /sitter_id uuid not null references auth\.users \(id\) on delete cascade/);
assert.match(sql, /parent_favorite_sitters_parent_sitter_key unique \(parent_id, sitter_id\)/);
assert.match(sql, /created_at timestamptz not null default now\(\)/);
assert.match(sql, /updated_at timestamptz not null default now\(\)/);
assert.match(sql, /enable row level security/);
assert.match(sql, /parent_id = auth\.uid\(\)/);
assert.match(sql, /p\.role = 'parent'/);
assert.match(sql, /for select/);
assert.match(sql, /for insert/);
assert.match(sql, /for delete/);
assert.doesNotMatch(sql, /for update/);
assert.doesNotMatch(sql, /sitter_id = auth\.uid\(\)/);
assert.match(sql, /grant select, insert, delete on table public\.parent_favorite_sitters to authenticated/);
assert.doesNotMatch(sql, /grant\s+(select,\s*)?update/i);
assert.match(sql, /after insert on public\.parent_favorite_sitters/);
assert.doesNotMatch(sql, /after delete|after update/i);
assert.match(sql, /create_canonical_notification/);
assert.match(sql, /'favorite_sitter_added'/);
assert.match(sql, /איזה כיף! 🎉/);
assert.match(sql, /משפחת /);
assert.match(sql, /p\.last_name/);
assert.doesNotMatch(sql, /phone|email|address|children/i);

const created = classifyFavoriteInsert({});
assert.equal(created.created, true);
assert.equal(created.notify, true);
assert.equal(created.alreadyFavorite, false);

const duplicate = classifyFavoriteInsert({
  errorCode: "23505",
  errorMessage: "duplicate key value violates unique constraint parent_favorite_sitters_parent_sitter_key"
});
assert.equal(duplicate.created, false);
assert.equal(duplicate.alreadyFavorite, true);
assert.equal(duplicate.notify, false);
assert.equal(duplicate.error, null);
assert.equal(favoriteRemovalNotifies(), false);

assert.match(favoritesClient, /\.insert\(\{/);
assert.match(favoritesClient, /\.delete\(\)/);
assert.doesNotMatch(favoritesClient, /upsert\(|createInAppNotification|from\("notifications"\)|create_canonical_notification/);
assert.match(favoritesClient, /shouldOfferFavoritePrompt/);

assert.equal(shouldOfferFavoritePrompt(true), false);
assert.equal(shouldOfferFavoritePrompt(false), true);
assert.equal(
  favoritePromptMessage("נועה"),
  "הייתם רוצים להוסיף את נועה לרשימת הבייביסיטריות המועדפות שלכם?"
);
assert.equal(
  favoriteSitterNotificationBody("כהן"),
  "איזה כיף! 🎉 משפחת כהן הוסיפה אותך לרשימת הבייביסיטריות המועדפות שלה ב-AnyNanny ❤️"
);
assert.equal(notificationDedupeKey("favorite_sitter_added", { favoriteId: "fav-1" }), "fav-1");
assert.equal(notificationDedupeKey("favorite_sitter_added", { favoriteId: "fav-1" }), "fav-1");
assert.equal(notificationHrefForKind("favorite_sitter_added", "sitter", {}), "/sitter/dashboard");

const ratingStart = dashboard.indexOf("const handleSubmitParentRating");
const ratingEnd = dashboard.indexOf("[activeSession?.id, lockSettlement]", ratingStart);
const ratingHandler = dashboard.slice(ratingStart, ratingEnd);
assert.match(ratingHandler, /submitSessionRating/);
assert.match(ratingHandler, /lockSettlement\("payment"\)/);
assert.doesNotMatch(ratingHandler, /offerFavoriteAfterCompletedSettlement/);
assert.match(dashboard, /offerFavoriteAfterCompletedSettlement/);
assert.match(dashboard, /AddFavoriteSitterPrompt/);
assert.match(dashboard, /FAVORITE_PROMPT_PRIMARY_LABEL|הוסיפו למועדפות ❤️|AddFavoriteSitterPrompt/);
assert.equal(FAVORITE_PROMPT_PRIMARY_LABEL, "הוסיפו למועדפות ❤️");
assert.equal(FAVORITE_PROMPT_SECONDARY_LABEL, "לא עכשיו");
assert.match(ratingSubmit, /export async function submitSessionRating/);

const searched = [
  { id: "fav", city: "חיפה", price: 80 },
  { id: "other", city: "חיפה", price: 80 },
  { id: "far", city: "תל אביב", price: 40 }
];
const haifaUnderPrice = searched.filter((card) => card.city === "חיפה" && card.price <= 90);
assert.deepEqual(
  applyFavoritesOnlyFilter(haifaUnderPrice, ["fav"], false).map((card) => card.id),
  ["fav", "other"]
);
assert.deepEqual(
  applyFavoritesOnlyFilter(haifaUnderPrice, ["fav"], true).map((card) => card.id),
  ["fav"]
);
assert.deepEqual(applyFavoritesOnlyFilter(haifaUnderPrice, [], true), []);
assert.equal(parentFavoritesSearchEmptyMessage(true, 0), PARENT_FAVORITES_SEARCH_EMPTY);
assert.equal(parentFavoritesSearchEmptyMessage(false, 0), null);

const rpcOff = toListPublicSittersSearchRpcArgs(
  normalizeParentSearchFilters({
    selectedCity: "חיפה",
    minRating: "4",
    minYearsExperience: 3,
    maxHourlyRate: 80,
    favoritesOnly: false
  })
);
const rpcOn = toListPublicSittersSearchRpcArgs(
  normalizeParentSearchFilters({
    selectedCity: "חיפה",
    minRating: "4",
    minYearsExperience: 3,
    maxHourlyRate: 80,
    favoritesOnly: true
  })
);
assert.deepEqual(rpcOff, rpcOn);
assert.equal("favoritesOnly" in rpcOn, false);
assert.match(resultsPage, /runParentSitterSearch\(supabase, normalized\)/);
assert.match(resultsPage, /normalized\.favoritesOnly/);
assert.match(resultsPage, /applyFavoritesOnlyFilter/);
assert.match(searchFilters, /FAVORITES_ONLY_LABEL/);
assert.equal(PARENT_SEARCH_FAVORITES_ONLY_LABEL, "הצג רק בייביסיטריות מועדפות");
assert.match(searchFilters, /favoritesOnly: e\.target\.checked/);

const favoritesIdx = personal.indexOf("<ParentFavoriteSittersSection");
const welcomeIdx = personal.indexOf("<WelcomeReplayCard");
assert.ok(favoritesIdx >= 0 && welcomeIdx > favoritesIdx);
assert.equal(PARENT_FAVORITES_ACCORDION_TITLE, "❤️ הבייביסיטריות המועדפות שלי");
assert.match(favoritesSection, /title=\{PARENT_FAVORITES_ACCORDION_TITLE\}/);
assert.match(favoritesSection, /PersonalAreaSection/);
assert.match(favoritesSection, /href=\{`\/parent\/sitter\/\$\{encodeURIComponent\(sitter\.sitterId\)\}`\}/);
assert.match(favoritesSection, /firstName/);
assert.match(favoritesSection, /lastName/);
assert.match(favoritesSection, /anyNannyId/);

assert.match(profile, /ParentFavoriteSitterButton/);
assert.match(profile, /PARENT_SITTER_CALENDAR_BUTTON_LABEL/);
assert.equal(PARENT_SITTER_CALENDAR_BUTTON_LABEL, "📅 לראות את היומן");
assert.match(profile, /\/calendar/);
assert.match(calendarPage, /ParentSitterAvailabilityView/);
assert.doesNotMatch(calendarPage, /AvailabilityCalendar|parentName/);
const bookingQuery = availabilityRoute.slice(availabilityRoute.indexOf('.from("bookings")'));
assert.match(bookingQuery, /select\("start_time, end_time, status"\)/);
assert.doesNotMatch(bookingQuery.slice(0, bookingQuery.indexOf("if (bookingsError)")), /parent_|rejection_note|notes/);
assert.match(availabilityRoute, /select\("availability_date, slot_indices"\)/);
assert.match(availabilityRoute, /sanitizeParentAvailabilityDays/);
assert.match(availabilityRoute, /profile\.role !== "parent"/);

const now = new Date(2026, 8, 1, 8, 0, 0, 0);
const secretFamily = "משפחת סודית-פרטית";
const privateNote = "הערה אישית מהיומן";
const month = buildParentAvailabilityMonth({
  year: 2026,
  month: 10,
  mode: "all_except_blocked",
  availabilityRows: [],
  bookings: [
    {
      start_time: new Date(2026, 9, 1, 0, 0, 0, 0).toISOString(),
      end_time: new Date(2026, 9, 2, 0, 0, 0, 0).toISOString(),
      status: "approved"
    }
  ],
  now
});
assert.equal(month.find((day) => day.date === "2026-10-01")?.state, "occupied");
assert.equal(month.find((day) => day.date === "2026-10-02")?.state, "available");

const closed = buildParentAvailabilityMonth({
  year: 2026,
  month: 10,
  mode: "only_selected",
  availabilityRows: [],
  bookings: [],
  now
});
assert.equal(closed.find((day) => day.date === "2026-10-03")?.state, "unavailable");

const partial = buildParentAvailabilityMonth({
  year: 2026,
  month: 10,
  mode: "only_selected",
  availabilityRows: [{ availability_date: "2026-10-04", slot_indices: [20, 21, 22, 23, 24, 25] }],
  bookings: [
    {
      start_time: new Date(2026, 9, 4, 10, 0, 0, 0).toISOString(),
      end_time: new Date(2026, 9, 4, 11, 0, 0, 0).toISOString(),
      status: "approved"
    }
  ],
  now
});
assert.equal(partial.find((day) => day.date === "2026-10-04")?.state, "available");

const fullyBooked = buildParentAvailabilityMonth({
  year: 2026,
  month: 10,
  mode: "only_selected",
  availabilityRows: [{ availability_date: "2026-10-05", slot_indices: [20, 21] }],
  bookings: [
    {
      start_time: new Date(2026, 9, 5, 10, 0, 0, 0).toISOString(),
      end_time: new Date(2026, 9, 5, 11, 0, 0, 0).toISOString(),
      status: "completed"
    }
  ],
  now
});
assert.equal(fullyBooked.find((day) => day.date === "2026-10-05")?.state, "occupied");

const pendingDoesNotOccupy = buildParentAvailabilityMonth({
  year: 2026,
  month: 10,
  mode: "only_selected",
  availabilityRows: [{ availability_date: "2026-10-06", slot_indices: [20, 21] }],
  bookings: [
    {
      start_time: new Date(2026, 9, 6, 10, 0, 0, 0).toISOString(),
      end_time: new Date(2026, 9, 6, 11, 0, 0, 0).toISOString(),
      status: "pending"
    }
  ],
  now
});
assert.equal(pendingDoesNotOccupy.find((day) => day.date === "2026-10-06")?.state, "available");
assert.equal(isOccupyingBookingStatus("pending"), false);
assert.equal(isOccupyingBookingStatus("cancelled"), false);

const leaked = buildParentAvailabilityMonth({
  year: 2026,
  month: 10,
  mode: "all_except_blocked",
  availabilityRows: [],
  bookings: [
    Object.assign(
      {
        start_time: new Date(2026, 9, 7, 9, 0, 0, 0).toISOString(),
        end_time: new Date(2026, 9, 7, 12, 0, 0, 0).toISOString(),
        status: "approved"
      },
      { parent_name: secretFamily, notes: privateNote, title: "אירוע פרטי", parent_id: "hidden-parent" }
    )
  ],
  now
});
const safeJson = JSON.stringify(sanitizeParentAvailabilityDays(leaked));
assert.equal(safeJson.includes(secretFamily), false);
assert.equal(safeJson.includes(privateNote), false);
assert.equal(safeJson.includes("אירוע פרטי"), false);
assert.equal(safeJson.includes("hidden-parent"), false);
assert.equal(safeJson.includes("parent_name"), false);
assert.match(safeJson, /"state":"available"|"state":"occupied"|"state":"unavailable"/);

console.log("Parent favorite sitters checks passed.");
