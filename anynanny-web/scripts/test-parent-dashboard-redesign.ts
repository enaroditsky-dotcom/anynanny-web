import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parentProfileCityOnly,
  projectOwnParentProfileCard
} from "../lib/parent/own-profile-card-preview";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

const dashboard = read("components/parent/parent-dashboard-client.tsx");
const preview = read("components/parent/parent-own-profile-preview.tsx");
const projection = read("lib/parent/own-profile-card-preview.ts");
const badge = read("components/parent/parent-dashboard-verified-badge.tsx");
const help = read("components/parent/parent-profile-card-help.tsx");
const sitterHeader = read("components/sitter/sitter-dashboard-header.tsx");
const sitterPage = read("app/sitter/dashboard/page.tsx");
const detailsModal = read("components/sitter/parent-details-modal.tsx");
const cardArt = read("components/parent/parent-dashboard-card-art.tsx");

assert.match(dashboard, /data-tour="parent-home"/);
assert.match(dashboard, /data-tour="parent-search"/);
assert.match(dashboard, /href="\/parent\/search"/);
assert.match(dashboard, /PARENT_SITTER_SEARCH_CTA_LABEL/);
assert.match(dashboard, /כרטיס הביקור שלי/);
assert.doesNotMatch(dashboard, /הצג את הפרטים שלי/);
assert.match(dashboard, /justify-center gap-2" dir="rtl">\s*<button[\s\S]*?כרטיס הביקור שלי/);
assert.match(dashboard, /min-h-11[\s\S]{0,500}כרטיס הביקור שלי/);
assert.doesNotMatch(dashboard, /flex-1[\s\S]{0,120}כרטיס הביקור שלי/);
assert.match(dashboard, /bg-\[#EAF7EE\]/);
assert.match(dashboard, /ParentOwnProfilePreview/);
assert.match(dashboard, /ParentProfileCardHelp/);
assert.match(dashboard, /parentSerialLabel \? \(/);
assert.doesNotMatch(dashboard, /\{parentSerial\}/);
assert.doesNotMatch(dashboard, /ברוכים הבאים ל-AnyNanny/);
assert.doesNotMatch(dashboard, /parent-preview/);
assert.doesNotMatch(dashboard, /service_role|SUPABASE_SERVICE_ROLE/);

assert.match(badge, /isIdentityVerified/);
assert.match(badge, /VERIFIED_IDENTITY_LABEL/);
assert.match(badge, /if \(!verified\) return null/);
assert.doesNotMatch(badge, /identity_id_number|idNumber/);

assert.match(help, /כך אחרים רואים את הפרופיל שלך ב־AnyNanny/);
assert.equal(
  help.includes('PARENT_PROFILE_CARD_HELP_TEXT}'),
  true
);
assert.match(help, /aria-expanded/);
assert.match(help, /role="tooltip"/);
assert.doesNotMatch(help, /<p[\s>]/);

assert.doesNotMatch(preview, /<ParentDetailsBody|ParentDetailsBody /);
assert.match(preview, /projectOwnParentProfileCard/);
assert.match(preview, /parentProfileCityOnly/);
assert.match(preview, /fetchIdentityVerification/);
assert.match(preview, /isIdentityVerified/);
assert.doesNotMatch(preview, /fixed inset-0/);
assert.match(preview, /env\(safe-area-inset-top,0px\)/);
assert.match(preview, /env\(safe-area-inset-bottom,0px\)/);
assert.doesNotMatch(preview, /חזרה ללוח הבקרה/);
assert.match(cardArt, /#FFFEFA/);
assert.match(cardArt, /rounded-\[1\.75rem\]/);
assert.match(cardArt, /pb-8 pt-4/);
assert.doesNotMatch(cardArt, /#DDEFE4|#FFFEFB|<svg|ParentDashboardCardArt|border-black|border /);
assert.match(dashboard, /shadow-\[0_12px_24px_-14px_rgba\(0,31,63,0\.4\)\]/);
assert.doesNotMatch(dashboard, /ParentDashboardCardArt/);
assert.match(preview, /כרטיס הביקור שלי/);
assert.doesNotMatch(preview, />\s*הכרטיס שלי\s*</);
assert.match(preview, /פרטי הילדים/);
assert.match(preview, /עיר מגורים/);
assert.doesNotMatch(preview, /מיקום העבודה/);
assert.match(preview, /PARENT_FULL_ADDRESS_DISCLOSURE/);
assert.match(preview, /PARENT_CHILDREN_COUNT_EMPTY/);
assert.match(preview, /rounded-full/);
assert.match(preview, /h-\[84px\] w-\[84px\]/);
assert.match(preview, /flex items-center gap-3/);
assert.doesNotMatch(preview, /flex flex-col items-center text-center/);
assert.match(preview, /rounded-\[1\.75rem\]/);
assert.match(preview, /bg-\[#FFFEFA\]/);
assert.match(preview, /parentDashboardSerialLabel/);
assert.match(preview, /dir="ltr"/);
assert.match(dashboard, /publicId=\{parentSerialLabel\}/);
assert.match(detailsModal, /parentDashboardSerialLabel\(parent\.public_id\)/);
assert.match(detailsModal, /dir="ltr"/);
assert.match(
  read("app/api/sitter/bookings/[bookingId]/parent-preview/route.ts"),
  /public_id: publicId/
);
assert.match(
  read("app/api/sitter/bookings/[bookingId]/parent-preview/route.ts"),
  /pickProfilePublicId/
);
assert.match(preview, /history\.state/);
assert.doesNotMatch(preview, /ערוך את הכרטיס/);
assert.doesNotMatch(preview, /href="\/parent\/profile"/);
assert.match(preview, /aria-label="סגירת הכרטיס"/);
assert.match(preview, /#F5F8FF/);
assert.match(preview, /#E5EEFF/);
assert.match(preview, /#D6E5FF/);
assert.doesNotMatch(preview, /ChevronRight|>\s*חזרה\s*</);
assert.doesNotMatch(preview, /#FFF8F3|#F3D7C4|ParentDashboardCardArt/);
assert.doesNotMatch(preview, /safetyUserId=/);
assert.doesNotMatch(preview, /UserSafetyActions/);
assert.doesNotMatch(preview, /parent-preview/);
assert.doesNotMatch(preview, /service_role|SUPABASE_SERVICE_ROLE/);
assert.doesNotMatch(preview, /identity_id_number|medical|child_special|houseNumber|street/);

assert.match(projection, /address: null/);
assert.match(projection, /address_visible: false/);
assert.match(projection, /children_count: null/);
assert.match(projection, /children_ages: null/);
assert.doesNotMatch(projection, /identity_id_number|from_user_id|child_special_or_medical/);

assert.match(detailsModal, /closeLabel && onClose/);
assert.match(detailsModal, /export function ParentDetailsBody/);
assert.match(detailsModal, /AUTH_MODAL_CARD_SHELL/);
assert.match(detailsModal, /aria-label="סגור"/);
assert.match(detailsModal, /PARENT_FULL_ADDRESS_DISCLOSURE/);
assert.match(detailsModal, /הכתובת המלאה תוצג לאחר אישור המשמרת\./);
assert.doesNotMatch(detailsModal, /מיקום העבודה|עיר מגורים|כרטיס הביקור שלי|הכרטיס שלי|סגירת הכרטיס/);
assert.doesNotMatch(detailsModal, /#F5F8FF|#E5EEFF|#D6E5FF/);
assert.match(sitterHeader, /SitterDashboardAvatar/);
assert.match(sitterHeader, /כרטיס הביקור שלי/);
assert.doesNotMatch(sitterHeader, /PARENT_DASHBOARD_CARD_CLASS|הצג את הפרטים שלי|ParentOwnProfilePreview|ערוך את הכרטיס/);
assert.doesNotMatch(sitterPage, /PARENT_DASHBOARD_CARD_CLASS|הצג את הפרטים שלי|ParentOwnProfilePreview|ערוך את הכרטיס/);
assert.doesNotMatch(detailsModal, /ערוך את הכרטיס/);

const card = projectOwnParentProfileCard({
  firstName: " נועה ",
  avatarUrl: " https://example.com/a.jpg ",
  ratingAverage: 5,
  ratingCount: 22,
  identityVerified: false,
  reviews: [{ rating: 5, comment: "תודה", created_at: "2026-01-01T00:00:00.000Z" }]
});

assert.equal(card.first_name, "נועה");
assert.equal(card.avatar_url, "https://example.com/a.jpg");
assert.equal(card.identity_verified, false);
assert.equal(card.address, null);
assert.equal(card.address_visible, false);
assert.equal(card.city, null);
assert.equal(card.public_id, null);
assert.equal(
  projectOwnParentProfileCard({
    firstName: "נועה",
    avatarUrl: null,
    ratingAverage: 0,
    ratingCount: 0,
    identityVerified: false,
    reviews: [],
    publicId: " p-1002 "
  }).public_id,
  "P-1002"
);
assert.equal(
  projectOwnParentProfileCard({
    firstName: "נועה",
    avatarUrl: null,
    ratingAverage: 0,
    ratingCount: 0,
    identityVerified: false,
    reviews: [],
    publicId: "11111111-1111-4111-8111-111111111111"
  }).public_id,
  null
);
assert.equal(card.children_count, null);
assert.equal(card.children_ages, null);
assert.equal(
  projectOwnParentProfileCard({
    firstName: "נועה",
    avatarUrl: null,
    ratingAverage: 0,
    ratingCount: 0,
    identityVerified: false,
    reviews: [],
    city: "  חיפה  "
  }).city,
  "חיפה"
);
assert.equal(
  parentProfileCityOnly({
    city: "תל אביב-יפו",
    address: { city: "חיפה", street: "הרצל", houseNumber: "12", floor: "3", notes: "קוד 1234" }
  }),
  "חיפה"
);
assert.equal(parentProfileCityOnly({ city: "חיפה", address: "הרצל 12, חיפה" }), "חיפה");
assert.equal(parentProfileCityOnly({ address: "הרצל 12" }), null);
assert.equal(parentProfileCityOnly({ address: { street: "הרצל", houseNumber: "4" } }), null);
assert.deepEqual(card.reviews, [
  { rating: 5, comment: "תודה", created_at: "2026-01-01T00:00:00.000Z" }
]);
assert.equal("id" in card, false);
assert.equal(
  projectOwnParentProfileCard({
    firstName: "",
    avatarUrl: "  ",
    ratingAverage: 0,
    ratingCount: 0,
    identityVerified: true,
    reviews: []
  }).identity_verified,
  true
);

console.log("parent dashboard redesign checks passed.");
