import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { shouldOpenVerifiedParentBookingBlock } from "../lib/trust/parent-booking-verified-gate";
import {
  parentIdentityVerificationHref,
  selectNowBroadcastRecipients,
  shouldShowUnverifiedParentNowNotice,
  unverifiedParentNowNoticeDismissKey,
  sitterAcceptsParentRequest,
  sitterIsEligibleForNowBroadcast,
  UNVERIFIED_PARENT_NOW_NOTICE_BODY,
  UNVERIFIED_PARENT_NOW_NOTICE_FOLLOWUP,
  UNVERIFIED_PARENT_NOW_NOTICE_HEADING,
  VERIFIED_IDENTITY_PHRASE,
  VERIFIED_PARENT_BOOKING_BLOCK_HELP,
  type NowBroadcastAudience,
  type NowRecipientCandidate
} from "../lib/trust/request-recipient-filters";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

function sitter(partial: Partial<NowRecipientCandidate> & Pick<NowRecipientCandidate, "sitterId">): NowRecipientCandidate {
  return {
    cityMatch: true,
    isSelf: false,
    suspended: false,
    blocked: false,
    isFavorite: false,
    sitterIdentityVerified: false,
    onlyVerifiedParents: false,
    ...partial
  };
}

const pool = [
  sitter({ sitterId: "fav-verified", isFavorite: true, sitterIdentityVerified: true }),
  sitter({ sitterId: "fav-open", isFavorite: true, sitterIdentityVerified: false }),
  sitter({ sitterId: "verified-open", isFavorite: false, sitterIdentityVerified: true }),
  sitter({ sitterId: "open", isFavorite: false, sitterIdentityVerified: false }),
  sitter({
    sitterId: "verified-parents-only",
    isFavorite: true,
    sitterIdentityVerified: true,
    onlyVerifiedParents: true
  })
];

function ids(audience: NowBroadcastAudience): string[] {
  return selectNowBroadcastRecipients(pool, audience).map((row) => row.sitterId);
}

const openAudience: NowBroadcastAudience = {
  parentIdentityVerified: false,
  favoritesOnly: false,
  verifiedSittersOnly: false
};

// A. no filters → current city-eligible pool, including an opted-in sitter only when the parent is verified
assert.deepEqual(ids(openAudience), [
  "fav-verified",
  "fav-open",
  "verified-open",
  "open"
]);
assert.deepEqual(
  ids({ ...openAudience, parentIdentityVerified: true }),
  ["fav-verified", "fav-open", "verified-open", "open", "verified-parents-only"]
);

// B. favorites only
assert.deepEqual(ids({ ...openAudience, favoritesOnly: true, parentIdentityVerified: true }), [
  "fav-verified",
  "fav-open",
  "verified-parents-only"
]);

// C. verified sitters only
assert.deepEqual(
  ids({ ...openAudience, verifiedSittersOnly: true, parentIdentityVerified: true }),
  ["fav-verified", "verified-open", "verified-parents-only"]
);

// D. both → favorite AND verified
assert.deepEqual(
  ids({
    parentIdentityVerified: true,
    favoritesOnly: true,
    verifiedSittersOnly: true
  }),
  ["fav-verified", "verified-parents-only"]
);

// E. parent has zero favorites → no fallback to all sitters
assert.deepEqual(
  ids({
    parentIdentityVerified: true,
    favoritesOnly: true,
    verifiedSittersOnly: false
  }).filter((id) => id === "open" || id === "verified-open"),
  []
);
assert.deepEqual(
  selectNowBroadcastRecipients(
    [sitter({ sitterId: "anyone", isFavorite: false, sitterIdentityVerified: true })],
    { parentIdentityVerified: true, favoritesOnly: true, verifiedSittersOnly: false }
  ),
  []
);

// F. no verified sitters → no fallback to unverified
assert.deepEqual(
  selectNowBroadcastRecipients(
    [sitter({ sitterId: "unverified-fav", isFavorite: true, sitterIdentityVerified: false })],
    { parentIdentityVerified: true, favoritesOnly: false, verifiedSittersOnly: true }
  ),
  []
);

// Sitter preference
assert.equal(
  sitterAcceptsParentRequest({ onlyVerifiedParents: false, parentIdentityVerified: false }),
  true
);
assert.equal(
  sitterAcceptsParentRequest({ onlyVerifiedParents: true, parentIdentityVerified: false }),
  false
);
assert.equal(
  sitterAcceptsParentRequest({ onlyVerifiedParents: true, parentIdentityVerified: true }),
  true
);

const unverifiedParent: NowBroadcastAudience = {
  parentIdentityVerified: false,
  favoritesOnly: false,
  verifiedSittersOnly: false
};
const verifiedParent: NowBroadcastAudience = {
  ...unverifiedParent,
  parentIdentityVerified: true
};
const optedIn = sitter({
  sitterId: "opted-in",
  sitterIdentityVerified: true,
  onlyVerifiedParents: true
});
assert.equal(sitterIsEligibleForNowBroadcast(optedIn, unverifiedParent), false);
assert.equal(sitterIsEligibleForNowBroadcast(optedIn, verifiedParent), true);
assert.equal(
  sitterIsEligibleForNowBroadcast(
    sitter({ sitterId: "open-sitter", onlyVerifiedParents: false }),
    unverifiedParent
  ),
  true
);

const migration = read("supabase/migrations/20260930120000_request_trust_filters.sql");
assert.match(migration, /only_verified_parents boolean not null default false/);
assert.match(migration, /favorites_only boolean not null default false/);
assert.match(migration, /verified_sitters_only boolean not null default false/);
assert.match(migration, /identity_verification_status = 'verified'/);
assert.match(migration, /parent_favorite_sitters/);
assert.match(migration, /sitter_is_eligible_for_now_broadcast/);
assert.match(migration, /notify_broadcast_alert_recipients/);
assert.match(migration, /bookings_enforce_verified_parent_preference/);
assert.match(migration, /before insert on public\.bookings/);
assert.match(migration, /notify_booking_insert/);
assert.match(migration, /sitter_accepts_parent_request/);
assert.match(migration, /filter_now_broadcasts_for_current_sitter/);
assert.match(migration, /grant update \(only_verified_parents\)/);
assert.match(migration, /grant select \(only_verified_parents\)/);
assert.doesNotMatch(migration, /update public\.profiles\s+set\s+identity_verification_status/i);

const parentPage = read("app/parent/broadcast/page.tsx");
assert.match(parentPage, /למצוא בייביסיטר/);
assert.match(parentPage, /מעכשיו לעכשיו\?/);
assert.match(parentPage, /זה קל!/);
assert.match(parentPage, /NowRecipientFilters/);
assert.match(parentPage, /favoritesOnly/);
assert.match(parentPage, /verifiedSittersOnly/);
assert.match(parentPage, /buildNowBroadcastAlertInsert/);
assert.match(parentPage, /בהקדם האפשרי/);
assert.match(parentPage, /שעה מסוימת/);
assert.doesNotMatch(read("components/parent/anynanny-now-hero.tsx"), /h-\[178px\]/);
assert.match(read("components/parent/anynanny-now-hero.tsx"), /AnyNannyLogo/);
assert.match(read("components/parent/anynanny-now-hero.tsx"), /dir="ltr"/);

const createBooking = read("lib/bookings/create-booking.ts");
assert.match(createBooking, /PARENT_MAY_REQUEST_SITTER_RPC/);
assert.match(createBooking, /SITTER_ACCEPTS_VERIFIED_PARENTS_ONLY_MESSAGE/);
assert.match(createBooking, /status: "pending"/);

const dashboard = read("app/sitter/dashboard/page.tsx");
assert.match(dashboard, /SitterVerifiedParentsPreference/);
const preference = read("components/sitter/sitter-verified-parents-preference.tsx");
const filters = read("lib/trust/request-recipient-filters.ts");
assert.match(filters, /לקבל בקשות רק מהורים עם זהות מאומתת/);
assert.match(
  filters,
  /שימי לב: סינון זה עשוי לצמצם את כמות הפניות, אך הפניות שתקבלי יהיו רק מהורים עם זהות מאומתת\./
);
assert.match(filters, /שלח רק לבייביסיטריות מועדפות/);
assert.match(filters, /שלח רק לבייביסיטריות עם זהות מאומתת/);
assert.match(preference, /SITTER_VERIFIED_PARENTS_ONLY_LABEL/);
assert.match(preference, /SITTER_VERIFIED_PARENTS_ONLY_HELP/);
assert.match(preference, /method: "PATCH"/);
assert.match(preference, /aria-expanded/);

const modal = read("components/sitter/SitterBroadcastAlertModal.tsx");
assert.match(modal, /filterNowBroadcastIdsForCurrentSitter/);
assert.match(modal, /working_cities/);
assert.match(modal, /\.in\(\s*"city"/);

const profileApi = read("app/api/sitter/profile/route.ts");
assert.match(profileApi, /only_verified_parents/);
assert.match(profileApi, /wantsVerifiedParents/);

// Booking coordination click: parent_may_request_sitter false is this block.
// True covers both "preference off" and "parent verified". Missing RPC falls open.
assert.equal(
  shouldOpenVerifiedParentBookingBlock({ parentMayRequest: true, rpcUnavailable: false }),
  false
);
assert.equal(
  shouldOpenVerifiedParentBookingBlock({ parentMayRequest: false, rpcUnavailable: false }),
  true
);
assert.equal(
  shouldOpenVerifiedParentBookingBlock({ parentMayRequest: null, rpcUnavailable: true }),
  false
);
assert.equal(
  shouldOpenVerifiedParentBookingBlock({ parentMayRequest: null, rpcUnavailable: false }),
  false
);

const sitterProfilePage = read("app/parent/sitter/[sitterId]/page.tsx");
assert.match(sitterProfilePage, /isDirectBookingBlockedForUnverifiedParent/);
assert.match(sitterProfilePage, /VerifiedParentBookingBlockModal/);
assert.doesNotMatch(sitterProfilePage, /onClick=\{\(\) => setIsBookingModalOpen\(true\)\}/);
assert.match(sitterProfilePage, /setVerifiedParentBlockOpen\(true\)/);
assert.match(sitterProfilePage, /setIsBookingModalOpen\(true\)/);

const blockModal = read("components/parent/verified-parent-booking-block-modal.tsx");
assert.match(blockModal, /אין באפשרותך לתאם משמרת עם/);
assert.match(blockModal, /בחרה לקבל בקשות רק מהורים עם/);
assert.match(blockModal, /text-\[#00A86B\]/);
assert.match(blockModal, /VERIFIED_IDENTITY_PHRASE/);
assert.match(blockModal, /VERIFIED_PARENT_BOOKING_BLOCK_HELP/);
assert.match(blockModal, /לאימות זהות/);
assert.match(blockModal, /סגור/);
assert.match(blockModal, /aria-expanded/);
assert.match(blockModal, /parentIdentityVerificationHref/);
assert.doesNotMatch(blockModal, /המשך בכל זאת/);
assert.equal(VERIFIED_IDENTITY_PHRASE, "זהות מאומתת");
assert.match(
  VERIFIED_PARENT_BOOKING_BLOCK_HELP,
  /זהות מאומתת של ההורה מעניקה לבייביסיטר תחושת ביטחון ואמון כבר לפני המפגש הראשון/
);
assert.equal(parentIdentityVerificationHref(), "/parent/profile?verifyIdentity=1");

const identitySection = read("components/identity/identity-personal-section.tsx");
assert.match(identitySection, /PARENT_IDENTITY_VERIFICATION_QUERY/);
assert.match(identitySection, /IdentityVerificationForm/);
assert.match(identitySection, /setFormOpen\(true\)/);

assert.match(createBooking, /PARENT_MAY_REQUEST_SITTER_RPC/);
assert.match(migration, /bookings_enforce_verified_parent_preference/);
assert.match(migration, /parent_may_request_sitter/);

assert.equal(UNVERIFIED_PARENT_NOW_NOTICE_HEADING, "שימו לב!");
assert.equal(
  UNVERIFIED_PARENT_NOW_NOTICE_BODY,
  "ייתכן שחלק מהבייביסיטריות הזמינות באזור לא קיבלו את הבקשה הדחופה שלך, משום שהן בחרו לקבל בקשות רק מהורים עם זהות מאומתת."
);
assert.equal(
  UNVERIFIED_PARENT_NOW_NOTICE_FOLLOWUP,
  "מומלץ להשלים את אימות הזהות ולבצע את הקריאה הדחופה שוב, כדי להגדיל את מספר הבייביסיטריות שיכולות לקבל את הבקשה."
);

assert.equal(
  shouldShowUnverifiedParentNowNotice({ broadcastStatus: null, parentIdentityVerified: false }),
  false
);
assert.equal(
  shouldShowUnverifiedParentNowNotice({ broadcastStatus: "expired", parentIdentityVerified: false }),
  false
);
assert.equal(
  shouldShowUnverifiedParentNowNotice({ broadcastStatus: "cancelled", parentIdentityVerified: false }),
  false
);
assert.equal(
  shouldShowUnverifiedParentNowNotice({ broadcastStatus: "filled", parentIdentityVerified: false }),
  false
);
assert.equal(
  shouldShowUnverifiedParentNowNotice({ broadcastStatus: "active", parentIdentityVerified: false }),
  true
);
assert.equal(
  shouldShowUnverifiedParentNowNotice({ broadcastStatus: "paused", parentIdentityVerified: false }),
  true
);
assert.equal(
  shouldShowUnverifiedParentNowNotice({ broadcastStatus: "active", parentIdentityVerified: true }),
  false
);
assert.equal(
  shouldShowUnverifiedParentNowNotice({ broadcastStatus: "active", parentIdentityVerified: null }),
  false
);

const radar = read("app/parent/search/broadcast-radar/page.tsx");
const notice = read("components/parent/unverified-parent-now-notice.tsx");
const statusAt = radar.indexOf("השידור המיידי הופעל");
const noticeAt = radar.indexOf("<UnverifiedParentNowNotice");
const responsesAt = radar.indexOf("מטפלות פנויות שהגיבו");
assert.ok(statusAt >= 0 && noticeAt > statusAt && responsesAt > noticeAt);
assert.match(radar, /identity_verification_status/);
assert.match(radar, /shouldShowUnverifiedParentNowNotice/);
assert.doesNotMatch(read("app/parent/broadcast/page.tsx"), /UnverifiedParentNowNotice/);
assert.match(notice, /UNVERIFIED_PARENT_NOW_NOTICE_HEADING/);
assert.match(notice, /text-\[#00A86B\]/);
assert.match(notice, /bg-\[#FF8A8A\]/);
assert.match(notice, /לאימות זהות/);
assert.match(notice, /להתעלם ולהמשיך/);
assert.match(notice, /onDismiss/);
assert.match(notice, /parentIdentityVerificationHref/);
assert.match(notice, /shadow-\[0_28px_64px/);
assert.match(radar, /top-\[8\.25rem\]/);
assert.match(radar, /min-h-\[26rem\]/);
assert.match(radar, /z-30/);
assert.match(radar, /sessionStorage/);
assert.match(radar, /unverifiedParentNowNoticeDismissKey/);
assert.equal(
  unverifiedParentNowNoticeDismissKey("alert-1"),
  "anynanny_now_unverified_notice_dismissed:alert-1"
);
const dismissFn = radar.slice(
  radar.indexOf("function dismissUnverifiedNowNotice"),
  radar.indexOf("Restore the parent's existing")
);
assert.doesNotMatch(dismissFn, /requestBroadcastStatusChange/);
assert.doesNotMatch(dismissFn, /broadcast_alerts/);
assert.doesNotMatch(notice, /requestBroadcastStatusChange|alert\(/);
assert.doesNotMatch(notice, /ביטול השידור|הפעל מחדש/);

console.log("request trust filters ok");
