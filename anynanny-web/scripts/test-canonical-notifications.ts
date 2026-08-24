import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CANONICAL_NOTIFICATION_KINDS,
  DEFERRED_NOTIFICATION_KINDS,
  isCanonicalNotificationKind,
  notificationDedupeKey,
  notificationHrefForKind
} from "../lib/notifications/kinds";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

const MIGRATION = "supabase/migrations/20260820140000_canonical_notifications.sql";
const sql = read(MIGRATION);
const createTableIdx = sql.indexOf("create table if not exists public.notifications");
const helperIdx = sql.indexOf("create or replace function public.create_canonical_notification");
const alterDedupeIdx = sql.indexOf("add column if not exists dedupe_key");
assert.ok(createTableIdx >= 0, "migration must create notifications if missing");
assert.ok(helperIdx > createTableIdx, "helper/triggers must be defined after table creation");
assert.ok(alterDedupeIdx > createTableIdx, "dedupe_key add must be additive after CREATE TABLE");
assert.doesNotMatch(sql, /drop table(\s+if\s+exists)?\s+public\.notifications/i);
assert.doesNotMatch(sql, /truncate\s+public\.notifications/i);
assert.doesNotMatch(sql, /alter table public\.notifications\s+alter column/i);
assert.doesNotMatch(sql, /drop constraint/i);
assert.match(sql, /create table if not exists public\.notifications/);
assert.match(sql, /user_id uuid not null references auth\.users \(id\) on delete cascade/);
assert.match(sql, /kind text not null/);
assert.match(sql, /title text not null/);
assert.match(sql, /payload jsonb not null default '\{\}'::jsonb/);
assert.match(sql, /read_at timestamptz/);
assert.match(sql, /created_at timestamptz not null default now\(\)/);
assert.match(sql, /add column if not exists dedupe_key text/);
assert.match(sql, /enable row level security/);
assert.match(sql, /replica identity full/);
assert.match(sql, /alter publication supabase_realtime add table public\.notifications/);
assert.match(sql, /pg_publication_tables/);
assert.match(sql, /when duplicate_object then null/);
assert.match(sql, /create unique index if not exists notifications_user_kind_dedupe_uidx/);
assert.match(sql, /create index if not exists notifications_user_unread_idx/);
assert.match(sql, /where read_at is null/);
assert.match(sql, /grant select on table public\.notifications to authenticated/);
assert.doesNotMatch(sql, /grant insert on table public\.notifications/i);
assert.doesNotMatch(sql, /grant delete on table public\.notifications/i);
assert.doesNotMatch(sql, /grant update on table public\.notifications to authenticated/i);
const createBooking = read("lib/bookings/create-booking.ts");
const updateStatus = read("lib/bookings/sitter-pending-bookings.ts");
const liveChat = read("lib/chat/constants.ts");
const unread = read("lib/chat/unread-messages.ts");
const createNotif = read("lib/notifications/create-notification.ts");
const finalize = read("lib/billing/finalize-hyp-payment.ts");
const broadcastModal = read("components/sitter/SitterBroadcastAlertModal.tsx");
const cancellationMig = read("supabase/migrations/20260818153000_booking_cancellation_request.sql");
const cancellationClient = read("lib/bookings/cancellation-request.ts");
const legacyChatTrigger = read("supabase/migrations/20260516200100_chat_message_notify_trigger.sql");
const bookingInsertMig = read("supabase/migrations/20260516210000_bookings_table.sql");
const parentDash = read("components/parent/parent-dashboard-client.tsx");
const sitterPending = read("components/sitter/sitter-pending-bookings.tsx");
const bottomNav = read("components/bottom-nav.tsx");
const swSearchFiles = [
  sql,
  createNotif,
  read("lib/notifications/kinds.ts"),
  read("lib/notifications/read-state.ts")
].join("\n");

// --- kinds ---
assert.equal(isCanonicalNotificationKind("booking_request"), true);
assert.equal(isCanonicalNotificationKind("booking_cancellation_rejected"), false);
assert.deepEqual(
  [...CANONICAL_NOTIFICATION_KINDS],
  [
    "booking_request",
    "booking_approved",
    "booking_rejected",
    "chat_message",
    "broadcast_alert",
    "booking_cancellation_requested",
    "booking_cancellation_approved",
    "payment_required",
    "payment_received",
    "pending_no_response_reminder",
    "booking_withdrawn_by_parent",
    "pending_booking_expired",
    "shift_end_reminder",
    "shift_cancelled_no_start"
  ]
);
assert.ok(DEFERRED_NOTIFICATION_KINDS.includes("confirm_start_required"));
assert.ok(DEFERRED_NOTIFICATION_KINDS.includes("confirm_end_required"));
assert.ok(DEFERRED_NOTIFICATION_KINDS.includes("rating_required"));
assert.ok(DEFERRED_NOTIFICATION_KINDS.includes("booking_cancellation_rejected"));

assert.equal(notificationDedupeKey("booking_request", { bookingId: "b1" }), "b1");
assert.equal(notificationDedupeKey("chat_message", { bookingId: "b1", messageId: "m1" }), "m1");
assert.equal(notificationDedupeKey("broadcast_alert", { broadcastId: "a1" }), "a1");
assert.equal(notificationDedupeKey("payment_required", { sessionId: "s1", bookingId: "b1" }), "s1");
assert.equal(notificationDedupeKey("payment_received", { bookingId: "b1" }), "b1");
assert.equal(notificationHrefForKind("chat_message", "parent", { booking_id: "b1" }), "/parent/chat/b1");
assert.equal(notificationHrefForKind("broadcast_alert", "sitter", {}), "/sitter/dashboard");
assert.equal(notificationHrefForKind("pending_no_response_reminder", "parent", { booking_id: "b1" }), "/parent/dashboard");
assert.equal(notificationHrefForKind("pending_booking_expired", "parent", { booking_id: "b1" }), "/parent/dashboard");
assert.equal(notificationHrefForKind("booking_withdrawn_by_parent", "sitter", { booking_id: "b1" }), "/sitter/dashboard");

// --- A. booking_request: one writer, sitter only ---
assert.match(createBooking, /status:\s*"pending"/);
assert.match(createBooking, /booking_source: bookingSource/);
assert.doesNotMatch(createBooking, /notifications/);
assert.doesNotMatch(createBooking, /createInAppNotification/);
assert.match(bookingInsertMig, /notify_booking_insert/);
assert.match(bookingInsertMig, /kind,\s*title,\s*body,\s*payload[\s\S]*'booking_request'/);
assert.match(sql, /create or replace function public\.notify_booking_insert/);
assert.match(sql, /drop trigger if exists bookings_notify_sitter/);
assert.match(sql, /create trigger bookings_notify_sitter/);
assert.equal((sql.match(/create trigger bookings_notify_sitter/g) || []).length, 1);
assert.match(sql, /new\.sitter_id/);
assert.match(sql, /new\.sitter_id = new\.parent_id/);
assert.match(sql, /'booking_request'/);
assert.match(sql, /'booking_id',\s*new\.id/);
assert.doesNotMatch(sql, /create_canonical_notification\(\s*new\.parent_id,\s*'booking_request'/);

// --- B/C. booking_approved / booking_rejected ---
assert.match(updateStatus, /Extract<BookingStatus, "approved" \| "rejected">/);
assert.match(updateStatus, /\.eq\("status", "pending"\)/);
assert.doesNotMatch(updateStatus, /createInAppNotification|NOTIFICATIONS_TABLE/);
assert.match(sql, /create trigger bookings_notify_parent_response/);
assert.match(sql, /'booking_approved'/);
assert.match(sql, /'booking_rejected'/);
assert.match(sql, /v_old is distinct from 'pending'/);
assert.match(sql, /create_canonical_notification\(\s*new\.parent_id,/);
assert.doesNotMatch(sql, /create_canonical_notification\(\s*new\.sitter_id,\s*'booking_approved'/);

// --- D. live chat uses public.messages ---
assert.match(liveChat, /MESSAGES_TABLE = "messages"/);
assert.match(sql, /create trigger messages_notify_recipient/);
assert.match(sql, /after insert on public\.messages/);
assert.match(sql, /'chat_message'/);
assert.match(sql, /'message_id',\s*new\.id/);
assert.match(sql, /v_recipient = new\.sender_id/);
assert.match(legacyChatTrigger, /on public\.chat_messages/);
assert.doesNotMatch(sql, /after insert on public\.chat_messages/);
assert.match(unread, /kind: "chat_message"/);

// --- E. broadcast recipients = working_cities, not all sitters ---
assert.match(broadcastModal, /working_cities/);
assert.match(broadcastModal, /\.in\(\s*"city"/);
assert.match(sql, /create trigger broadcast_alerts_notify_recipients/);
assert.match(sql, /working_cities[\s\S]*@>\s*array\[v_city\]/);
assert.match(sql, /sp\.id is distinct from new\.parent_id/);
assert.doesNotMatch(sql, /from public\.profiles[\s\S]*broadcast_alert/);
assert.doesNotMatch(sql, /role = 'sitter'[\s\S]*broadcast_alert/);

// --- F. cancellation writers preserved; rejected kind not invented ---
assert.match(cancellationMig, /'booking_cancellation_requested'/);
assert.match(cancellationMig, /'booking_cancellation_approved'/);
assert.doesNotMatch(cancellationMig, /booking_cancellation_rejected/);
assert.doesNotMatch(sql, /booking_cancellation_rejected/);
assert.doesNotMatch(cancellationClient, /דחיית ביטול/);
assert.match(cancellationClient, /booking_cancellation_requested/);
assert.match(cancellationClient, /booking_cancellation_approved/);

// --- G. payment_received only after verified success ---
assert.match(sql, /bookings_notify_payment_received/);
assert.match(sql, /payment_status/);
assert.match(createNotif, /payment_received/);
assert.match(createNotif, /dedupeKey/);
assert.match(finalize, /notifySitterPaymentReceived/);
assert.match(finalize, /async function notifySitterOnce/);
assert.match(finalize, /if \(decision\.action === "noop"\)/);
assert.match(finalize, /noop: true/);
assert.match(finalize, /if \(!parsed\.noop\)/);
const paidPersist = finalize.slice(finalize.indexOf('payment_status: "paid"'));
assert.match(paidPersist, /notifySitterOnce/);
assert.match(finalize, /verifiedAmountNis|hypTransId/);

// --- H. duplicate protection ---
assert.match(sql, /notifications_user_kind_dedupe_uidx/);
assert.match(sql, /on conflict \(user_id, kind, dedupe_key\) where dedupe_key is not null/);
assert.match(sql, /create_canonical_notification/);
assert.match(sql, /notifications_assign_dedupe_key/);
assert.match(createNotif, /isDuplicateNotificationError|23505/);

// --- I. RLS: own rows only, no client insert ---
assert.match(sql, /notifications_select_own/);
assert.match(sql, /for select to authenticated/);
assert.match(sql, /for update to authenticated/);
assert.match(sql, /user_id = auth\.uid\(\)/);
assert.match(sql, /grant update \(read_at\)/);
assert.match(sql, /revoke insert, delete, update on table public\.notifications from authenticated/i);
assert.match(sql, /drop policy if exists notifications_insert_own/);
assert.doesNotMatch(sql, /create policy \w+ on public\.notifications\s+for insert/i);
assert.doesNotMatch(sql, /create policy \w+ on public\.notifications\s+for delete/i);
assert.match(sql, /revoke all on function public\.create_canonical_notification/);
assert.match(sql, /from authenticated/);

// --- payment_required writer; deferred session kinds absent ---
assert.match(sql, /'payment_required'/);
assert.match(sql, /payment_pending/);
assert.doesNotMatch(sql, /confirm_start_required/);
assert.doesNotMatch(sql, /confirm_end_required/);
assert.doesNotMatch(sql, /rating_required/);

// --- this phase is not Web Push ---
assert.doesNotMatch(swSearchFiles, /PushManager|pushManager|applicationServerKey|VAPID|web-push|setAppBadge|serviceWorker|Notification\.requestPermission/);

// --- existing UI not replaced ---
assert.match(parentDash, /shouldShowApprovedScheduleNotification|shouldShowRejectedNotification/);
assert.match(parentDash, /PendingNoResponseReminderModal|pending_no_response_reminder/);
assert.match(sitterPending, /fetchPendingBookingsForSitter|updateBookingStatus/);
assert.match(broadcastModal, /playAlertSound/);
assert.match(bottomNav, /hasUnreadMessages/);
assert.doesNotMatch(parentDash, /from\("notifications"\)/);

const readState = read("lib/notifications/read-state.ts");
assert.match(readState, /countUnreadNotifications/);
assert.match(readState, /markNotificationRead/);
assert.match(readState, /markNotificationsRead/);
assert.doesNotMatch(parentDash, /countUnreadNotifications|markNotificationsRead\(/);
assert.match(read("lib/bookings/dismissed-approved-bookings.ts"), /booking_approved/);
assert.match(read("lib/bookings/dismissed-rejected-bookings.ts"), /booking_rejected/);

console.log("canonical notifications PUSH-1 checks passed.");
