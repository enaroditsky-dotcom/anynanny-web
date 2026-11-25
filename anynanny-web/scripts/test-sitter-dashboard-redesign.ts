import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { countSitterShiftsInCurrentWeek } from "../lib/bookings/sitter-upcoming-week-shifts";
import {
  SITTER_PENDING_REQUESTS_HREF,
  SITTER_UPCOMING_WEEK_SHIFTS_HREF,
  sitterCalendarRangeFromParam,
  sitterShiftsBoardViewFromParam
} from "../lib/bookings/sitter-dashboard-destinations";
import { sitterDashboardSerialLabel } from "../lib/public/sequential-display-id";
import { todayDateISO } from "../lib/bookings/booking-date-utils";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

const dashboard = read("app/sitter/dashboard/page.tsx");
const header = read("components/sitter/sitter-dashboard-header.tsx");
const avatar = read("components/sitter/sitter-dashboard-avatar.tsx");
const badge = read("components/parent/parent-dashboard-verified-badge.tsx");
const boost = read("components/sitter/sitter-profile-boost-banner.tsx");
const work = read("components/sitter/sitter-work-center.tsx");
const preview = read("components/sitter/sitter-own-profile-preview.tsx");
const parentProfile = read("app/parent/sitter/[sitterId]/page.tsx");
const parentDashboard = read("components/parent/parent-dashboard-client.tsx");
const shiftsPage = read("app/sitter/shifts/page.tsx");

assert.match(header, /buildDashboardGreetingTitle/);
assert.match(read("lib/user/use-dashboard-greeting-name.ts"), /שלום, \$\{firstName\}!/);
assert.match(header, /כרטיס הביקור שלי/);
assert.match(header, /ParentProfileCardHelp/);
assert.match(header, /sitterDashboardSerialLabel/);
assert.match(header, /dir="ltr"/);
assert.doesNotMatch(header, /href=|IdentityStatusIndicator|חוות דעת ודירוג|הזמינות שלי/);

assert.match(avatar, /rounded-full/);
assert.match(avatar, /ParentDashboardVerifiedBadge/);
assert.match(avatar, /role="sitter"/);
assert.match(badge, /role = "parent"/);
assert.match(badge, /isIdentityVerified/);
assert.match(badge, /if \(!verified\) return null/);
assert.match(badge, /VERIFIED_IDENTITY_LABEL/);

assert.match(boost, /תני בוסט לפרופיל/);
assert.match(boost, /טיפים שיעזרו לך לקבל יותר פניות/);
assert.match(boost, /SITTER_PROFILE_BOOST_HREF/);
assert.match(boost, /sitter-boost-rocket\.png/);
assert.match(boost, /object-contain/);
assert.doesNotMatch(boost, /data-boost-phase="awaiting-content"|sparkle|✨|המלצות פשוטות|אימות זהות/);

assert.match(work, /מרכז העבודה שלי/);
assert.match(work, /פניות חדשות/);
assert.match(work, /בקשות שממתינות לתגובה/);
assert.match(work, /העבודות שלי/);
assert.match(work, /משמרות בשבוע הקרוב/);
assert.equal(work.match(/<Link /g)?.length, 2);
assert.match(work, /href=\{SITTER_PENDING_REQUESTS_HREF\}/);
assert.match(work, /href=\{SITTER_UPCOMING_WEEK_SHIFTS_HREF\}/);
assert.match(work, /sitter-notification-bell\.png/);
assert.match(work, /sitter-work-calendar\.png/);
assert.match(work, /object-contain/);
assert.doesNotMatch(work, /חוות דעת ודירוג|הזמינות שלי|>\s*3\s*</);

assert.match(dashboard, /SitterProfileBoostBanner/);
assert.match(dashboard, /SitterWorkCenter/);
assert.match(dashboard, /SitterOwnProfilePreview/);
assert.match(dashboard, /SitterVerifiedParentsPreference/);
assert.match(dashboard, /useSitterPendingBookingCount/);
assert.match(dashboard, /useSitterUpcomingWeekShiftCount/);
assert.match(dashboard, /data-tour="sitter-home"/);
assert.doesNotMatch(dashboard, /מקום לפרסום|בקרוב|קופון|מבצעים|href="\/sitter\/shifts"/);
assert.doesNotMatch(dashboard, /BookShiftModal|UserSafetyActions/);

assert.match(preview, /fetchParentSitterProfile/);
assert.match(preview, /סגירת הכרטיס/);
assert.match(preview, /history\.back/);
assert.match(preview, /Escape/);
assert.doesNotMatch(preview, /BookShiftModal|UserSafetyActions|ParentFavoriteSitterButton|תיאום משמרת|href=/);
assert.doesNotMatch(preview, /חיפה/);
assert.doesNotMatch(parentProfile, /SitterOwnProfilePreview|sitter-own-profile-preview/);
assert.doesNotMatch(parentDashboard, /SitterWorkCenter|SitterProfileBoostBanner|SitterOwnProfilePreview/);

assert.match(shiftsPage, /sitterShiftsBoardViewFromParam/);
assert.match(shiftsPage, /sitterCalendarRangeFromParam/);
assert.equal(SITTER_PENDING_REQUESTS_HREF, "/sitter/shifts?view=pending");
assert.equal(SITTER_UPCOMING_WEEK_SHIFTS_HREF, "/sitter/shifts?view=calendar&range=week");
assert.equal(sitterShiftsBoardViewFromParam("pending"), "pending");
assert.equal(sitterShiftsBoardViewFromParam("nope"), "calendar");
assert.equal(sitterShiftsBoardViewFromParam(null), "calendar");
assert.equal(sitterCalendarRangeFromParam("week"), "week");
assert.equal(sitterCalendarRangeFromParam("pending_sitter_approval"), null);

assert.equal(sitterDashboardSerialLabel("AN-1002"), "AN-1002");
assert.equal(sitterDashboardSerialLabel(" an-8 "), "AN-8");
assert.equal(sitterDashboardSerialLabel("11111111-1111-4111-8111-111111111111"), null);
assert.equal(sitterDashboardSerialLabel("RP-1001"), null);

const now = new Date();
const later = new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString();
const after = new Date(now.getTime() + 3 * 60 * 60 * 1000).toISOString();
const today = todayDateISO();
assert.equal(
  countSitterShiftsInCurrentWeek([
    { booking_date: today, start_time: later, end_time: after, status: "approved" },
    { booking_date: today, start_time: later, end_time: after, status: "pending" },
    { booking_date: "2020-01-01", start_time: later, end_time: after, status: "approved" }
  ]),
  1
);
assert.equal(
  countSitterShiftsInCurrentWeek([
    { booking_date: today, start_time: later, end_time: after, status: "completed" }
  ]),
  0
);

console.log("sitter dashboard redesign checks passed.");
