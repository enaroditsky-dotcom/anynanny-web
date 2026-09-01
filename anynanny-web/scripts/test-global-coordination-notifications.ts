import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyCoordinationRealtimeChange,
  applyOperationalEventPopupChange,
  COORDINATION_NOTIFICATION_KINDS,
  coordinationBookingHref,
  coordinationChatHref,
  coordinationNotificationTitle,
  coordinationScheduleLabel,
  isCoordinationNotificationKind,
  isGlobalOperationalNotificationKind,
  mergeCoordinationNotifications,
  operationalCardActionLabel,
  shouldPresentOperationalEventPopup,
  type CoordinationNotification
} from "../lib/notifications/coordination";
import { isCanonicalNotificationKind, notificationHrefForKind } from "../lib/notifications/kinds";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

const approved: CoordinationNotification = {
  id: "n-approved",
  kind: "booking_approved",
  title: coordinationNotificationTitle("booking_approved"),
  body: "הבייביסיטר אישר/ה את בקשת המשמרת",
  payload: {
    booking_id: "b-future",
    booking_date: "2026-10-27",
    start_time: "2026-10-27T18:00:00.000Z",
    end_time: "2026-10-27T22:00:00.000Z"
  },
  created_at: "2026-08-27T11:00:00.000Z",
  read_at: null
};

assert.equal(coordinationNotificationTitle("booking_approved"), "הבייביסיטר אישרה את המשמרת!");
assert.equal(coordinationNotificationTitle("shift_confirmed"), "המשמרת אושרה בהצלחה");
assert.equal(isCoordinationNotificationKind("booking_approved"), true);
assert.equal(isCoordinationNotificationKind("chat_message"), false);
assert.equal(isCoordinationNotificationKind("payment_received"), false);
assert.equal(isGlobalOperationalNotificationKind("payment_received"), true);
assert.equal(isGlobalOperationalNotificationKind("manual_payment_denied"), true);
assert.equal(isGlobalOperationalNotificationKind("chat_message"), false);
assert.equal(isGlobalOperationalNotificationKind("confirm_start_required"), false);
assert.equal(operationalCardActionLabel("payment_received"), "לארנק");
assert.equal(operationalCardActionLabel("manual_payment_confirmed"), "לפרטים");
assert.equal(isGlobalOperationalNotificationKind("payment_required"), false);
assert.equal(isGlobalOperationalNotificationKind("manual_payment_reported"), false);
assert.equal(isCanonicalNotificationKind("shift_confirmed"), true);
assert.equal(notificationHrefForKind("shift_confirmed", "sitter", { booking_id: "b1" }), "/sitter/shifts?bookingId=b1");
assert.equal(coordinationBookingHref("booking_approved", "parent", { booking_id: "b1" }), "/parent/calendar?bookingId=b1");
assert.equal(coordinationChatHref("parent", { booking_id: "b1" }), "/parent/chat/b1");
assert.equal(coordinationChatHref("sitter", {}), null);
assert.ok(coordinationScheduleLabel(approved.payload)?.includes("27"));
assert.equal(
  coordinationScheduleLabel({ booking_id: "b1" }),
  null
);

const mergedOnce = mergeCoordinationNotifications([], approved);
const mergedTwice = mergeCoordinationNotifications(mergedOnce, approved);
assert.equal(mergedOnce.length, 1);
assert.equal(mergedTwice.length, 1);
assert.equal(mergedTwice[0]?.id, "n-approved");

const afterRead = mergeCoordinationNotifications(mergedTwice, { ...approved, read_at: "2026-08-27T11:01:00.000Z" });
assert.equal(afterRead.length, 0);

const afterInsert = applyCoordinationRealtimeChange([], {
  eventType: "INSERT",
  new: {
    id: "n-approved",
    kind: "booking_approved",
    title: "המשמרת אושרה",
    body: "",
    payload: approved.payload,
    created_at: approved.created_at,
    read_at: null
  }
});
assert.equal(afterInsert.length, 1);
assert.equal(afterInsert[0]?.title, "הבייביסיטר אישרה את המשמרת!");

const ignoredChat = applyCoordinationRealtimeChange(afterInsert, {
  eventType: "INSERT",
  new: { id: "n-chat", kind: "chat_message", title: "msg", body: "", payload: {}, created_at: "2026-08-27T12:00:00.000Z", read_at: null }
});
assert.equal(ignoredChat.length, 1);

const paymentInsert = applyCoordinationRealtimeChange([], {
  eventType: "INSERT",
  new: {
    id: "n-pay",
    kind: "manual_payment_confirmed",
    title: "קבלת התשלום אושרה",
    body: "הנני אישרה שהתשלום התקבל.",
    payload: { booking_id: "b1" },
    created_at: "2026-09-01T12:00:00.000Z",
    read_at: null
  }
});
assert.equal(paymentInsert.length, 1);
assert.equal(paymentInsert[0]?.kind, "manual_payment_confirmed");
assert.equal(paymentInsert[0]?.title, "קבלת התשלום אושרה");

const ignoredPaymentRequired = applyCoordinationRealtimeChange(paymentInsert, {
  eventType: "INSERT",
  new: {
    id: "n-pay-req",
    kind: "payment_required",
    title: "נדרש תשלום",
    body: "",
    payload: {},
    created_at: "2026-09-01T12:01:00.000Z",
    read_at: null
  }
});
assert.equal(ignoredPaymentRequired.length, 1);

const ignoredReported = applyCoordinationRealtimeChange(paymentInsert, {
  eventType: "INSERT",
  new: {
    id: "n-reported",
    kind: "manual_payment_reported",
    title: "ההורה דיווח שהתשלום בוצע",
    body: "",
    payload: {},
    created_at: "2026-09-01T12:02:00.000Z",
    read_at: null
  }
});
assert.equal(ignoredReported.length, 1);

const afterAck = applyCoordinationRealtimeChange(afterInsert, {
  eventType: "UPDATE",
  new: { ...approved, title: approved.title, read_at: "2026-08-27T11:02:00.000Z" }
});
assert.equal(afterAck.length, 0);

assert.ok(COORDINATION_NOTIFICATION_KINDS.includes("booking_request"));
assert.ok(COORDINATION_NOTIFICATION_KINDS.includes("booking_approved"));
assert.ok(COORDINATION_NOTIFICATION_KINDS.includes("shift_confirmed"));

const coordination = read("lib/notifications/coordination.ts");
assert.match(coordination, /is\("read_at", null\)/);
assert.doesNotMatch(coordination, /\.eq\("booking_date"|\.gte\("booking_date"|\.lte\("booking_date"/);
assert.doesNotMatch(coordination, /isFutureConfirmedScheduleBooking|shouldShowApprovedScheduleNotification/);

const shell = read("components/app-shell-gate.tsx");
assert.match(shell, /GlobalCoordinationNotifications/);
assert.match(shell, /isChromelessAuthPath/);
const chromelessReturn = shell.slice(shell.indexOf("if (chromeless)"), shell.indexOf("const mainLayout"));
assert.doesNotMatch(chromelessReturn, /GlobalCoordinationNotifications/);

const ui = read("components/notifications/global-coordination-notifications.tsx");
assert.doesNotMatch(ui, /fetchUnreadCoordinationNotifications/);
assert.match(ui, /event: "INSERT"/);
assert.match(ui, /applyOperationalEventPopupChange/);
assert.match(ui, /isOperationalCardsSuppressedRoute/);
assert.match(ui, /isOperationalCardsSuppressedRoute\(pathname\)\) return null/);
assert.match(ui, /markNotificationsReadBestEffort/);
assert.match(ui, /dismissPopup/);
assert.doesNotMatch(ui, /hideForSession|minimizeForSession|הסתר כרגע/);
assert.match(ui, /isGlobalOperationalNotificationKind/);
assert.match(ui, /pointer-events-none fixed inset-x-0 top-20 z-\[60\]/);
assert.match(ui, /max-h-\[min\(38vh,18rem\)\]/);
assert.match(ui, /h-11 w-11/);
assert.doesNotMatch(ui, /backdrop|bg-black\//);
assert.doesNotMatch(ui, /pickParentDashboardBooking|isBookingDueForParentActiveShiftUi/);
assert.doesNotMatch(ui, /SitterBroadcastAlertHost|confirm_start_required|rating_required/);
assert.doesNotMatch(ui, /ממתין לדירוג|awaiting_sitter_rating/);
assert.doesNotMatch(ui, /dismissed_at|minimized_at/);
assert.equal(
  shouldPresentOperationalEventPopup({
    eventType: "INSERT",
    pathname: "/sitter/profile",
    kind: "booking_approved"
  }),
  true
);
assert.equal(
  applyOperationalEventPopupChange(
    afterInsert,
    { eventType: "UPDATE", new: { ...approved, title: approved.title, read_at: "2026-08-27T11:02:00.000Z" } },
    "/parent/profile"
  ).length,
  1
);

const lifecycle = read("lib/bookings/sitter-pending-bookings.ts");
assert.match(lifecycle, /\.eq\("status", "pending"\)/);
assert.doesNotMatch(lifecycle, /createInAppNotification|NOTIFICATIONS_TABLE/);

const parentDash = read("components/parent/parent-dashboard-client.tsx");
assert.match(parentDash, /הבייביסיטר אישרה את המשמרת!/);

const sitterPending = read("components/sitter/sitter-pending-bookings.tsx");
assert.match(sitterPending, /המשמרת אושרה בהצלחה/);

const oldSql = read("supabase/migrations/20260820140000_canonical_notifications.sql");
assert.doesNotMatch(oldSql, /create_canonical_notification\(\s*new\.sitter_id,\s*'booking_approved'/);

const newSql = read("supabase/migrations/20260827140000_sitter_shift_confirmed_notification.sql");
assert.match(newSql, /create or replace function public\.notify_booking_status_response/);
assert.match(newSql, /create_canonical_notification\(\s*new\.parent_id,/);
assert.match(newSql, /'shift_confirmed'/);
assert.match(newSql, /new\.sitter_id/);
assert.match(newSql, /המשמרת אושרה בהצלחה/);
assert.doesNotMatch(newSql, /create_canonical_notification\(\s*new\.sitter_id,\s*'booking_approved'/);
assert.doesNotMatch(newSql, /status\s*=\s*'pending_response'|intermediate/);

const push = read("lib/push/payload.ts");
assert.match(push, /shift_confirmed: "המשמרת אושרה בהצלחה"/);

console.log("Global coordination notification checks passed.");
