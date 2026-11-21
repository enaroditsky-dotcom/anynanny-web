import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { publicNowServiceLocation } from "../lib/broadcast/now-request-details";
import {
  ASSIGNED_SITTER_STREET_ADDRESS_STATUSES,
  assignedSitterMaySeeStreetAddress,
  parseSitterParentContact,
  streetAddressDisclosedTo
} from "../lib/bookings/sitter-parent-contact";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

const audiences = [
  "parent_self",
  "assigned_sitter_pending",
  "assigned_sitter_after_approval",
  "now_candidate_sitter",
  "ordinary_unassigned_sitter",
  "unrelated_sitter",
  "anonymous"
] as const;

const visible = new Set(
  audiences.filter((audience) => streetAddressDisclosedTo(audience))
);
assert.deepEqual(
  [...visible],
  ["parent_self", "assigned_sitter_after_approval", "now_candidate_sitter"]
);

for (const status of ["pending", "rejected", "cancelled", "did_not_occur", ""]) {
  assert.equal(assignedSitterMaySeeStreetAddress(status), false, status);
}
for (const status of ASSIGNED_SITTER_STREET_ADDRESS_STATUSES) {
  assert.equal(assignedSitterMaySeeStreetAddress(status), true, status);
}

const hidden = parseSitterParentContact({
  booking_id: "booking-pending",
  parent_id: "parent-1",
  first_name: "הורה",
  last_name: "לדוגמה",
  address_line: "הרצל 1, חיפה",
  address_visible: false
});
assert.equal(hidden?.addressLine, null);
assert.equal(hidden?.displayName, "הורה לדוגמה");

const shown = parseSitterParentContact({
  booking_id: "booking-approved",
  parent_id: "parent-1",
  first_name: "הורה",
  last_name: "לדוגמה",
  address_line: "הרצל 1, חיפה",
  address_visible: true
});
assert.equal(shown?.addressLine, "הרצל 1, חיפה");

assert.equal(
  publicNowServiceLocation({
    city: "חיפה",
    street: "הרצל",
    houseNumber: "12",
    apartment: "4",
    floor: "2",
    doorCode: "1234",
    intercom: "9",
    entryNotes: "קוד כניסה"
  }),
  "הרצל 12, חיפה"
);
assert.equal(publicNowServiceLocation({ city: "חיפה", apartment: "4" }), null);

const migration = read("supabase/migrations/20261119194500_booking_address_and_now_disclosure.sql");
const shifts = read("app/sitter/shifts/page.tsx");
const linked = read("lib/bookings/todays-linked-booking.ts");
const preview = read("app/api/sitter/bookings/[bookingId]/parent-preview/route.ts");
const search = read("supabase/migrations/20260822220000_sitter_profiles_private_select.sql");

for (const status of ASSIGNED_SITTER_STREET_ADDRESS_STATUSES) {
  assert.match(migration, new RegExp(`'${status}'`));
}
assert.doesNotMatch(migration, /'pending'/);
assert.doesNotMatch(migration, /child_special_or_medical/);
assert.doesNotMatch(migration, /identity_id_number/);
assert.doesNotMatch(migration, /apartment|doorCode|intercom|entryNotes/);
assert.match(migration, /b\.sitter_id = auth\.uid\(\)/);
assert.match(migration, /auth\.uid\(\) is not null/);
assert.match(migration, /revoke all on function public\.sitter_assigned_booking_parent_contacts/);
assert.match(migration, /grant execute on function public\.sitter_assigned_booking_parent_contacts\(uuid\[\]\) to authenticated/);
assert.match(migration, /drop policy if exists "Users can view all active alerts"/);
assert.match(migration, /broadcast_alerts_insert_own/);
assert.match(migration, /with check \(auth\.uid\(\) = parent_id\)/);
assert.match(migration, /sitter_is_eligible_for_now_broadcast/);
assert.doesNotMatch(migration, /using \(true\)/);
assert.doesNotMatch(
  migration,
  /grant execute on function public\.sitter_is_eligible_for_now_broadcast/
);
assert.match(
  migration,
  /revoke all on function public\.sitter_is_eligible_for_now_broadcast\(uuid, uuid, text, boolean, boolean\) from authenticated/
);
assert.match(
  migration,
  /revoke all on function public\.sitter_is_eligible_for_now_broadcast\(uuid, uuid, text, boolean, boolean\) from anon/
);

const selectPolicy = migration.slice(
  migration.lastIndexOf('create policy "broadcast_alerts_select_owner_or_eligible_sitter"')
);
assert.match(selectPolicy, /using \(public\.current_user_may_read_broadcast_alert\(id\)\)/);
assert.doesNotMatch(selectPolicy, /sitter_is_eligible_for_now_broadcast/);
assert.doesNotMatch(selectPolicy, /p_sitter_id|parent_id|favorites_only/);

assert.match(migration, /function public\.current_user_may_read_broadcast_alert\(p_alert_id uuid\)/);
assert.match(migration, /set search_path = ''/);
assert.doesNotMatch(migration, /pg_catalog\.coalesce/);
assert.match(migration, /COALESCE\(alert\.status, ''::text\)/);
assert.match(migration, /COALESCE\(alert\.favorites_only, false\)/);
assert.match(migration, /COALESCE\(alert\.verified_sitters_only, false\)/);
assert.match(migration, /security definer/);
assert.match(migration, /auth\.uid\(\) is not null/);
assert.match(migration, /alert\.parent_id = auth\.uid\(\)/);
assert.match(
  migration,
  /public\.sitter_is_eligible_for_now_broadcast\(\s*auth\.uid\(\),\s*alert\.parent_id,/
);
assert.doesNotMatch(
  migration,
  /current_user_may_read_broadcast_alert\(\s*p_alert_id uuid\s*,/
);
assert.match(
  migration,
  /revoke all on function public\.current_user_may_read_broadcast_alert\(uuid\) from public/
);
assert.match(
  migration,
  /revoke all on function public\.current_user_may_read_broadcast_alert\(uuid\) from anon/
);
assert.match(
  migration,
  /revoke all on function public\.current_user_may_read_broadcast_alert\(uuid\) from service_role/
);
assert.match(
  migration,
  /grant execute on function public\.current_user_may_read_broadcast_alert\(uuid\) to authenticated/
);

/**
 * Static model of the wrapper. This does not open a database session and
 * does not prove PostgreSQL role privileges.
 */
function staticMayReadBroadcast(input: {
  caller: "owner" | "eligible_sitter" | "ineligible_sitter" | "unrelated" | "anonymous";
  alertExists: boolean;
  status?: string;
}): boolean {
  if (!input.alertExists || input.caller === "anonymous") return false;
  if (input.caller === "owner") return true;
  if (input.caller === "eligible_sitter") {
    return (input.status ?? "").trim().toLowerCase() === "active";
  }
  return false;
}

assert.equal(staticMayReadBroadcast({ caller: "owner", alertExists: true, status: "filled" }), true);
assert.equal(staticMayReadBroadcast({ caller: "eligible_sitter", alertExists: true, status: "active" }), true);
assert.equal(staticMayReadBroadcast({ caller: "eligible_sitter", alertExists: true, status: "filled" }), false);
assert.equal(staticMayReadBroadcast({ caller: "ineligible_sitter", alertExists: true, status: "active" }), false);
assert.equal(staticMayReadBroadcast({ caller: "unrelated", alertExists: true, status: "active" }), false);
assert.equal(staticMayReadBroadcast({ caller: "anonymous", alertExists: true, status: "active" }), false);
assert.equal(staticMayReadBroadcast({ caller: "owner", alertExists: false }), false);

assert.doesNotMatch(shifts, /first_name, last_name, address/);
assert.doesNotMatch(shifts, /from\(\s*PROFILES_TABLE/);
assert.match(shifts, /fetchSitterAssignedParentContacts/);
assert.match(shifts, /assignedSitterMaySeeStreetAddress/);

assert.doesNotMatch(linked, /select\("first_name, last_name, address"\)/);
assert.match(linked, /fetchSitterAssignedParentContacts/);
assert.match(linked, /assignedSitterMaySeeStreetAddress/);

assert.match(preview, /fetchSitterAssignedParentContacts/);
assert.doesNotMatch(preview, /parent_profiles/);
assert.doesNotMatch(preview, /child_special_or_medical/);
assert.doesNotMatch(search, /child_special_or_medical/);

const wizard = read("components/parent/parent-onboarding-wizard.tsx");
assert.match(wizard, /נשמר בחשבון ההורה/);
assert.doesNotMatch(wizard, /חשוב שבייביסיטר תדע/);
assert.match(wizard, /required/);

console.log("Booking address disclosure checks passed.");
