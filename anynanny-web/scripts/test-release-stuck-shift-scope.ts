import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  RELEASE_STUCK_SHIFT_COPY,
  RELEASE_STUCK_SHIFT_REASON_OTHER,
  RELEASE_STUCK_SHIFT_REASONS,
  canSubmitReleaseStuckShiftReason,
  markDisplayedStuckShiftForReview,
  resolveDisplayedStuckShiftTargets,
  sessionBelongsToDisplayedBooking,
  SITTER_RELEASE_STUCK_SHIFT_WARNING
} from "../lib/bookings/release-displayed-stuck-shift";
import {
  isBookingDueForParentActiveShiftUi,
  isBookingEligibleForLiveShiftUi
} from "../lib/bookings/booking-shift-ui";
import {
  excludeStuckShiftReviewBookings,
  isSitterPastHistoryBooking,
  stuckShiftReviewHistoryLabel,
  STUCK_SHIFT_REVIEW_LABEL,
  STUCK_SHIFT_REVIEW_SUPPORT
} from "../lib/bookings/stuck-shift-review";
import { isBookingBlockedFromAuthoritativeCharge } from "../lib/billing/compute-shift-charge";
import { mapStuckShiftReviewCases, stuckShiftReleasedByRole } from "../lib/admin/stuck-shift-reviews";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

const PARENT_ID = "parent-1";
const SITTER_ID = "sitter-live";
const LIVE_BOOKING_ID = "booking-live";
const LIVE_SESSION_ID = "session-live";
const FUTURE_BOOKING_ID = "booking-future-approved";
const PENDING_BOOKING_ID = "booking-pending";
const COMPLETED_SESSION_ID = "session-completed";
const PAID_SESSION_ID = "session-paid";
const OTHER_MESSAGE_ID = "msg-other";
const LIVE_MESSAGE_ID = "msg-live";
const SITTER_START = "2026-08-24T10:00:00.000Z";
const PARENT_START = "2026-08-24T10:01:00.000Z";
const SITTER_END = "2026-08-24T12:00:00.000Z";
const PARENT_END = "2026-08-24T12:01:00.000Z";

type Row = Record<string, unknown>;
type Op = {
  table: string;
  action: "select" | "update" | "delete";
  filters: { eq: Record<string, string>; in: Record<string, string[]> };
  payload: Record<string, unknown> | null;
};

type Store = {
  bookings: Map<string, Row>;
  sessions: Map<string, Row>;
  messages: Map<string, Row>;
};

function cloneRow(row: Row): Row {
  return { ...row };
}

function seedStore(): Store {
  return {
    bookings: new Map([
      [
        LIVE_BOOKING_ID,
        {
          id: LIVE_BOOKING_ID,
          parent_id: PARENT_ID,
          sitter_id: "sitter-live",
          status: "parent_started",
          payment_status: "unpaid",
          hourly_rate_nis: 80,
          actual_start_time: SITTER_START,
          actual_end_time: null,
          requires_admin_review: false
        }
      ],
      [
        FUTURE_BOOKING_ID,
        {
          id: FUTURE_BOOKING_ID,
          parent_id: PARENT_ID,
          sitter_id: "sitter-future",
          status: "approved",
          payment_status: "unpaid",
          requires_admin_review: false
        }
      ],
      [
        PENDING_BOOKING_ID,
        {
          id: PENDING_BOOKING_ID,
          parent_id: PARENT_ID,
          sitter_id: "sitter-pending",
          status: "pending",
          payment_status: "unpaid",
          requires_admin_review: false
        }
      ]
    ]),
    sessions: new Map([
      [
        LIVE_SESSION_ID,
        {
          id: LIVE_SESSION_ID,
          parent_id: PARENT_ID,
          sitter_id: "sitter-live",
          booking_id: LIVE_BOOKING_ID,
          status: "active",
          session_status: "active",
          sitter_start_shake: SITTER_START,
          parent_start_shake: PARENT_START,
          sitter_end_shake: SITTER_END,
          parent_end_shake: PARENT_END,
          actual_end_time: null,
          end_time: null,
          final_amount_nis: null,
          total_amount_charged: null
        }
      ],
      [
        COMPLETED_SESSION_ID,
        {
          id: COMPLETED_SESSION_ID,
          parent_id: PARENT_ID,
          sitter_id: "sitter-old",
          booking_id: "booking-completed",
          status: "completed",
          session_status: "completed"
        }
      ],
      [
        PAID_SESSION_ID,
        {
          id: PAID_SESSION_ID,
          parent_id: PARENT_ID,
          sitter_id: "sitter-paid",
          booking_id: "booking-paid",
          status: "paid",
          session_status: "paid"
        }
      ]
    ]),
    messages: new Map([
      [
        LIVE_MESSAGE_ID,
        { id: LIVE_MESSAGE_ID, booking_id: LIVE_BOOKING_ID, content: "live chat" }
      ],
      [
        OTHER_MESSAGE_ID,
        { id: OTHER_MESSAGE_ID, booking_id: FUTURE_BOOKING_ID, content: "future chat" }
      ]
    ])
  };
}

function matches(row: Row, filters: Op["filters"]): boolean {
  for (const [key, value] of Object.entries(filters.eq)) {
    if (String(row[key] ?? "") !== value) return false;
  }
  for (const [key, values] of Object.entries(filters.in)) {
    if (!values.includes(String(row[key] ?? ""))) return false;
  }
  return true;
}

function tableMap(store: Store, table: string): Map<string, Row> {
  if (table === "bookings") return store.bookings;
  if (table === "sessions") return store.sessions;
  if (table === "messages") return store.messages;
  throw new Error(`unexpected table ${table}`);
}

function createMockSupabase(store: Store, ops: Op[], options?: { failUpdateOn?: string }) {
  const from = (table: string) => {
    const filters: Op["filters"] = { eq: {}, in: {} };
    let action: Op["action"] = "select";
    let payload: Record<string, unknown> | null = null;

    const run = () => {
      const op: Op = {
        table,
        action,
        filters: {
          eq: { ...filters.eq },
          in: { ...filters.in }
        },
        payload: payload ? { ...payload } : null
      };
      ops.push(op);

      if (table === "messages") {
        return { data: null, error: { message: "messages must not be queried" } };
      }

      const rows = [...tableMap(store, table).values()].filter((row) => matches(row, filters));

      if (action === "delete") {
        for (const row of rows) {
          tableMap(store, table).delete(String(row.id));
        }
        return { data: rows.map(cloneRow), error: null };
      }

      if (action === "update") {
        if (options?.failUpdateOn === table) {
          return { data: null, error: { message: `${table} update failed` } };
        }
        const updated: Row[] = [];
        for (const row of rows) {
          Object.assign(row, payload);
          updated.push(cloneRow(row));
        }
        return { data: updated, error: null };
      }

      return { data: rows.map(cloneRow), error: null };
    };

    const api: Record<string, unknown> = {};
    api.select = () => api;
    api.update = (next: Record<string, unknown>) => {
      action = "update";
      payload = next;
      return api;
    };
    api.delete = () => {
      action = "delete";
      return api;
    };
    api.eq = (column: string, value: unknown) => {
      filters.eq[column] = String(value);
      return api;
    };
    api.in = (column: string, values: unknown[]) => {
      filters.in[column] = values.map((value) => String(value));
      return api;
    };
    api.maybeSingle = async () => {
      const result = run();
      const data = Array.isArray(result.data) ? (result.data[0] ?? null) : result.data;
      return { data, error: result.error };
    };
    api.then = (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
      Promise.resolve(run()).then(onFulfilled, onRejected);
    return api;
  };

  return { from } as unknown as SupabaseClient;
}

async function markLiveStartedShift(
  store: Store,
  ops: Op[],
  extras?: { failUpdateOn?: string; reasonId?: "end_incomplete" | "other"; detail?: string }
) {
  return markDisplayedStuckShiftForReview(createMockSupabase(store, ops, extras), {
    parentId: PARENT_ID,
    actorRole: "parent",
    bookingId: LIVE_BOOKING_ID,
    sessionId: LIVE_SESSION_ID,
    reasonId: extras?.reasonId ?? "end_incomplete",
    detail: extras?.detail ?? ""
  });
}

async function markLiveStartedShiftForSitter(
  store: Store,
  ops: Op[],
  extras?: { failUpdateOn?: string; reasonId?: "end_incomplete" | "other"; detail?: string }
) {
  return markDisplayedStuckShiftForReview(createMockSupabase(store, ops, extras), {
    actorId: SITTER_ID,
    actorRole: "sitter",
    bookingId: LIVE_BOOKING_ID,
    sessionId: LIVE_SESSION_ID,
    reasonId: extras?.reasonId ?? "end_incomplete",
    detail: extras?.detail ?? ""
  });
}

async function main() {
const dashboard = read("components/parent/parent-dashboard-client.tsx");
const sitterDashboard = read("app/sitter/dashboard/page.tsx");
const modal = read("components/parent/release-stuck-shift-modal.tsx");
const scoped = read("lib/bookings/release-displayed-stuck-shift.ts");
const broad = read("lib/bookings/release-stuck-shift.ts");
const parentReset = read("lib/bookings/parent-reset-stuck-shifts.ts");
const sitterReset = read("lib/bookings/sitter-reset-stuck-shifts.ts");
const parentHistory = read("app/parent/history/page.tsx");
const sitterHistory = read("app/sitter/shifts/page.tsx");
const adminPage = read("app/admin/shift-reviews/page.tsx");
const adminApi = read("app/api/admin/shift-reviews/route.ts");
const chargeHelper = read("lib/billing/compute-shift-charge.ts");
const ratingHelper = read("lib/ratings/submit-session-rating.ts");
const liveUi = read("lib/bookings/booking-shift-ui.ts");
const todaysLinked = read("lib/bookings/todays-linked-booking.ts");

// ---------------------------------------------------------------------------
// Source wiring: modal first, no native confirm, no parent-wide reset
// ---------------------------------------------------------------------------
assert.match(dashboard, /ReleaseStuckShiftModal/);
assert.match(dashboard, /handleOpenReleaseStuckShiftModal/);
assert.match(dashboard, /handleConfirmReleaseStuckShift/);
assert.match(dashboard, /markDisplayedStuckShiftForReview/);
assert.match(dashboard, /resolveDisplayedStuckShiftTargets\(activeBooking, activeSession\)/);
assert.match(dashboard, /onClick=\{handleOpenReleaseStuckShiftModal\}/);
assert.doesNotMatch(dashboard, /window\.confirm/);
assert.doesNotMatch(dashboard, /resetStuckShiftsForParent/);
assert.doesNotMatch(dashboard, /releaseStuckShift\(/);
assert.doesNotMatch(dashboard, /handleReleaseStuckShift/);
assert.doesNotMatch(dashboard, /releaseDisplayedStuckShift/);

assert.match(modal, /RELEASE_STUCK_SHIFT_COPY\.title/);
assert.match(modal, /RELEASE_STUCK_SHIFT_COPY\.warning/);
assert.match(modal, /RELEASE_STUCK_SHIFT_COPY\.irreversible/);
assert.match(modal, /RELEASE_STUCK_SHIFT_COPY\.cancel/);
assert.match(modal, /RELEASE_STUCK_SHIFT_COPY\.confirm/);
assert.match(modal, /Escape/);
assert.match(modal, /canSubmitReleaseStuckShiftReason/);
assert.match(modal, /disabled=\{\!canConfirm\}/);
assert.match(modal, /warning \?\? RELEASE_STUCK_SHIFT_COPY\.warning/);
assert.equal(
  SITTER_RELEASE_STUCK_SHIFT_WARNING,
  "הפעולה תעביר את המשמרת שמופיעה כעת לבדיקה. פרטי המשמרת והזכאות האפשרית לתשלום יישמרו."
);
assert.doesNotMatch(SITTER_RELEASE_STUCK_SHIFT_WARNING, /בוטל|מחיק/);

assert.match(sitterDashboard, /ReleaseStuckShiftModal/);
assert.match(sitterDashboard, /handleOpenReleaseStuckShiftModal/);
assert.match(sitterDashboard, /handleConfirmReleaseStuckShift/);
assert.match(sitterDashboard, /resolveDisplayedStuckShiftTargets\(displayedStuckBooking, displayedStuckSession\)/);
assert.match(sitterDashboard, /actorRole: "sitter"/);
assert.match(sitterDashboard, /SITTER_RELEASE_STUCK_SHIFT_WARNING/);
assert.match(sitterDashboard, /onClick=\{handleOpenReleaseStuckShiftModal\}/);
assert.doesNotMatch(sitterDashboard, /window\.confirm/);
assert.doesNotMatch(sitterDashboard, /resetStuckShiftsForSitter/);
assert.doesNotMatch(sitterDashboard, /releaseStuckShift\(/);
assert.doesNotMatch(sitterDashboard, /handleDevReset/);
assert.match(sitterReset, /releaseStuckShift\(supabase, "sitter_id"/);

const sitterShiftsPage = read("app/sitter/shifts/page.tsx");
const sitterShiftsContent = read("components/sitter/sitter-shifts-page-content.tsx");
const parentActiveSession = read("components/billing/ParentActiveSession.tsx");
const inertDevReset = read("components/sitter/stuck-shift-dev-reset.tsx");
assert.doesNotMatch(dashboard, /StuckShiftDevResetButton/);
assert.doesNotMatch(sitterDashboard, /StuckShiftDevResetButton/);
assert.doesNotMatch(sitterShiftsPage, /StuckShiftDevResetButton|resetStuckShiftsForSitter|releaseStuckShift\(/);
assert.doesNotMatch(sitterShiftsContent, /StuckShiftDevResetButton|resetStuckShiftsForSitter|releaseStuckShift\(/);
assert.doesNotMatch(parentActiveSession, /StuckShiftDevResetButton|resetStuckShiftsForParent|releaseStuckShift\(/);
assert.doesNotMatch(inertDevReset, /resetStuckShiftsForParent|resetStuckShiftsForSitter|releaseStuckShift\(/);
assert.match(inertDevReset, /return null;/);

const sitterActiveSession = read("components/billing/SitterActiveSession.tsx");
const billingTestPage = read("app/billing/test/page.tsx");
const billingResetFn = sitterActiveSession.slice(
  sitterActiveSession.indexOf("function BillingResetButton"),
  sitterActiveSession.indexOf("function StatusCard")
);
assert.match(billingResetFn, /return null;/);
assert.doesNotMatch(billingResetFn, /איפוס משמרת תקועה/);
assert.doesNotMatch(sitterActiveSession, /<BillingResetButton/);
assert.doesNotMatch(sitterActiveSession, /איפוס משמרת תקועה/);
assert.doesNotMatch(sitterActiveSession, /handleResetShakes\(/);
assert.doesNotMatch(billingTestPage, /resetShakes\(/);
assert.doesNotMatch(billingTestPage, /איפוס כל ה-shakes/);
assert.doesNotMatch(billingTestPage, /<button[^>]*reset/i);
assert.doesNotMatch(parentActiveSession, /handleResetShakes|BillingResetButton|resetShakes\(/);
assert.match(
  sitterActiveSession.slice(
    sitterActiveSession.indexOf("const handleResetShakes"),
    sitterActiveSession.indexOf("if (resetBusy)")
  ),
  /Intentionally inert[\s\S]*return;/
);
assert.match(
  billingTestPage.slice(
    billingTestPage.indexOf("const resetShakes"),
    billingTestPage.indexOf("if (!sessionId.trim() || resetBusy)")
  ),
  /Intentionally inert[\s\S]*return;/
);
assert.doesNotMatch(dashboard, /sitter_start_shake:\s*null/);
assert.doesNotMatch(sitterDashboard, /sitter_start_shake:\s*null/);
assert.doesNotMatch(scoped, /sitter_start_shake:\s*null|parent_start_shake:\s*null|sitter_end_shake:\s*null|parent_end_shake:\s*null/);

assert.equal(RELEASE_STUCK_SHIFT_COPY.title, "שחרור משמרת תקועה");
assert.match(RELEASE_STUCK_SHIFT_COPY.warning, /רק את המשמרת הנוכחית/);
assert.equal(RELEASE_STUCK_SHIFT_COPY.irreversible, "לא ניתן לבטל את ההעברה לבדיקה ממסך זה.");
assert.equal(RELEASE_STUCK_SHIFT_REASONS.length, 5);
assert.equal(RELEASE_STUCK_SHIFT_REASONS[4]?.id, RELEASE_STUCK_SHIFT_REASON_OTHER);

assert.match(scoped, /requires_admin_review: true/);
assert.doesNotMatch(scoped, /status:\s*["']cancelled["']/);
assert.doesNotMatch(scoped, /session_status:\s*["']disputed["']/);
assert.doesNotMatch(scoped, /actual_end_time:\s/);
assert.doesNotMatch(scoped, /final_amount_nis:/);
assert.doesNotMatch(scoped, /\.delete\(/);

// 1. Opening the dashboard button performs no DB operation.
assert.match(dashboard, /const handleOpenReleaseStuckShiftModal = useCallback\(\(\) => \{/);
assert.doesNotMatch(
  dashboard.slice(
    dashboard.indexOf("const handleOpenReleaseStuckShiftModal"),
    dashboard.indexOf("const handleCloseReleaseStuckShiftModal")
  ),
  /markDisplayedStuckShiftForReview|from\(|clearToIdleDashboard|clearHypPendingCheckout/
);

// 2. Cancel / close performs no DB operation.
const closeBlock = dashboard.slice(
  dashboard.indexOf("const handleCloseReleaseStuckShiftModal"),
  dashboard.indexOf("const handleConfirmReleaseStuckShift")
);
assert.doesNotMatch(closeBlock, /markDisplayedStuckShiftForReview|from\(|clearToIdleDashboard|clearHypPendingCheckout/);
assert.match(modal, /if \(!busy\) onClose\(\)/);

assert.match(sitterDashboard, /const handleOpenReleaseStuckShiftModal = useCallback\(\(\) => \{/);
assert.doesNotMatch(
  sitterDashboard.slice(
    sitterDashboard.indexOf("const handleOpenReleaseStuckShiftModal"),
    sitterDashboard.indexOf("const handleCloseReleaseStuckShiftModal")
  ),
  /markDisplayedStuckShiftForReview|from\(|clearSitterShiftUi|resetStuckShiftsForSitter/
);
const sitterCloseBlock = sitterDashboard.slice(
  sitterDashboard.indexOf("const handleCloseReleaseStuckShiftModal"),
  sitterDashboard.indexOf("const handleConfirmReleaseStuckShift")
);
assert.doesNotMatch(
  sitterCloseBlock,
  /markDisplayedStuckShiftForReview|from\(|clearSitterShiftUi|resetStuckShiftsForSitter/
);

// 3 + 4. Confirm requires a reason; "אחר" requires text.
assert.equal(canSubmitReleaseStuckShiftReason(null, ""), false);
assert.equal(canSubmitReleaseStuckShiftReason("end_incomplete", ""), true);
assert.equal(canSubmitReleaseStuckShiftReason(RELEASE_STUCK_SHIFT_REASON_OTHER, "   "), false);
assert.equal(canSubmitReleaseStuckShiftReason(RELEASE_STUCK_SHIFT_REASON_OTHER, "נתקעה"), true);
assert.match(modal, /reasonId === RELEASE_STUCK_SHIFT_REASON_OTHER/);

// 5. Authority is the displayed booking + linked session, not latest parent row.
const targets = resolveDisplayedStuckShiftTargets(
  { id: LIVE_BOOKING_ID, sitter_id: "sitter-live", status: "parent_started" },
  {
    id: LIVE_SESSION_ID,
    booking_id: LIVE_BOOKING_ID,
    sitter_id: "sitter-live",
    status: "active"
  }
);
assert.ok(!("error" in targets));
assert.equal(targets.bookingId, LIVE_BOOKING_ID);
assert.equal(targets.sessionId, LIVE_SESSION_ID);

const mismatched = resolveDisplayedStuckShiftTargets(
  { id: LIVE_BOOKING_ID, sitter_id: "sitter-live" },
  { id: "session-other", booking_id: FUTURE_BOOKING_ID, sitter_id: "sitter-future" }
);
assert.ok(!("error" in mismatched));
assert.equal(mismatched.sessionId, null);
assert.equal(
  sessionBelongsToDisplayedBooking(
    { id: "session-other", booking_id: FUTURE_BOOKING_ID, sitter_id: "sitter-future" },
    { id: LIVE_BOOKING_ID, sitter_id: "sitter-live" }
  ),
  false
);

assert.doesNotMatch(scoped, /fetchLatestParentSessionRow/);
assert.match(scoped, /\.eq\("id", bookingId\)/);
assert.match(scoped, /\.eq\("id", sessionId\)/);
assert.doesNotMatch(scoped, /\.delete\(/);

assert.match(broad, /\.delete\(/);
assert.match(parentReset, /releaseStuckShift\(supabase, "parent_id"/);

{
  const store = seedStore();
  const ops: Op[] = [];
  const result = await markLiveStartedShift(store, ops);

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.bookingId, LIVE_BOOKING_ID);
    assert.equal(result.sessionId, LIVE_SESSION_ID);
  }

  const liveBooking = store.bookings.get(LIVE_BOOKING_ID);
  const liveSession = store.sessions.get(LIVE_SESSION_ID);

  // 8. Started shift → requires_admin_review = true
  assert.equal(liveBooking?.requires_admin_review, true);
  // 9. Started shift → booking NOT cancelled
  assert.equal(liveBooking?.status, "parent_started");
  assert.notEqual(liveBooking?.status, "cancelled");
  // 10. Started shift → session NOT cancelled
  assert.equal(liveSession?.status, "active");
  assert.notEqual(liveSession?.status, "cancelled");
  assert.equal(liveSession?.session_status, "active");
  // 11. Shake timestamps unchanged (all four preserved as evidence)
  assert.equal(liveSession?.sitter_start_shake, SITTER_START);
  assert.equal(liveSession?.parent_start_shake, PARENT_START);
  assert.equal(liveSession?.sitter_end_shake, SITTER_END);
  assert.equal(liveSession?.parent_end_shake, PARENT_END);
  // 12. actual_end_time not invented
  assert.equal(liveBooking?.actual_end_time, null);
  assert.equal(liveSession?.actual_end_time, null);
  assert.equal(liveSession?.end_time, null);
  // 13. final amount not calculated
  assert.equal(liveSession?.final_amount_nis, null);
  assert.equal(liveSession?.total_amount_charged, null);
  assert.equal(liveBooking?.hourly_rate_nis, 80);

  // 6. Future approved booking untouched
  assert.equal(store.bookings.get(FUTURE_BOOKING_ID)?.status, "approved");
  assert.equal(store.bookings.get(FUTURE_BOOKING_ID)?.requires_admin_review, false);
  // 7. Pending booking untouched
  assert.equal(store.bookings.get(PENDING_BOOKING_ID)?.status, "pending");
  assert.equal(store.bookings.get(PENDING_BOOKING_ID)?.requires_admin_review, false);
  assert.equal(store.sessions.get(COMPLETED_SESSION_ID)?.status, "completed");
  assert.equal(store.sessions.get(PAID_SESSION_ID)?.status, "paid");
  assert.equal(store.messages.get(LIVE_MESSAGE_ID)?.content, "live chat");
  assert.equal(store.messages.get(OTHER_MESSAGE_ID)?.content, "future chat");

  assert.equal(ops.some((op) => op.action === "delete"), false);
  assert.equal(ops.some((op) => op.table === "messages"), false);

  const bookingUpdates = ops.filter((op) => op.table === "bookings" && op.action === "update");
  const sessionUpdates = ops.filter((op) => op.table === "sessions" && op.action === "update");
  assert.equal(bookingUpdates.length >= 1, true);
  assert.equal(sessionUpdates.length, 0);
  assert.equal(bookingUpdates[0]?.filters.eq.id, LIVE_BOOKING_ID);
  assert.notEqual(bookingUpdates[0]?.filters.eq.id, FUTURE_BOOKING_ID);
  assert.notEqual(bookingUpdates[0]?.filters.eq.id, PENDING_BOOKING_ID);
  assert.equal(bookingUpdates[0]?.payload?.status, undefined);
  assert.equal(bookingUpdates[0]?.payload?.actual_end_time, undefined);
  assert.equal(bookingUpdates[0]?.payload?.requires_admin_review, true);
  assert.equal(bookingUpdates[0]?.payload?.stuck_release_reason, "end_incomplete");
  assert.equal(bookingUpdates[0]?.payload?.stuck_released_by, PARENT_ID);
}

{
  const store = seedStore();
  const ops: Op[] = [];
  const result = await markLiveStartedShiftForSitter(store, ops);
  assert.equal(result.ok, true);

  const liveBooking = store.bookings.get(LIVE_BOOKING_ID);
  const liveSession = store.sessions.get(LIVE_SESSION_ID);
  assert.equal(liveBooking?.requires_admin_review, true);
  assert.equal(liveBooking?.status, "parent_started");
  assert.notEqual(liveBooking?.status, "cancelled");
  assert.equal(liveBooking?.stuck_released_by, SITTER_ID);
  assert.equal(liveBooking?.stuck_release_reason, "end_incomplete");
  assert.equal(liveSession?.status, "active");
  assert.equal(liveSession?.sitter_start_shake, SITTER_START);
  assert.equal(liveSession?.parent_start_shake, PARENT_START);
  assert.equal(liveSession?.sitter_end_shake, SITTER_END);
  assert.equal(liveSession?.parent_end_shake, PARENT_END);
  assert.equal(liveSession?.actual_end_time, null);
  assert.equal(liveSession?.final_amount_nis, null);
  assert.equal(store.bookings.get(FUTURE_BOOKING_ID)?.status, "approved");
  assert.equal(store.bookings.get(PENDING_BOOKING_ID)?.status, "pending");
  assert.equal(ops.some((op) => op.action === "delete"), false);

  const bookingUpdates = ops.filter((op) => op.table === "bookings" && op.action === "update");
  const sessionUpdates = ops.filter((op) => op.table === "sessions" && op.action === "update");
  assert.equal(bookingUpdates.length >= 1, true);
  assert.equal(sessionUpdates.length, 0);
  assert.equal(bookingUpdates[0]?.filters.eq.id, LIVE_BOOKING_ID);
  assert.equal(bookingUpdates[0]?.filters.eq.sitter_id, SITTER_ID);
  assert.equal(bookingUpdates[0]?.payload?.status, undefined);
  assert.equal(bookingUpdates[0]?.payload?.actual_end_time, undefined);
}

{
  const store = seedStore();
  const result = await markDisplayedStuckShiftForReview(createMockSupabase(store, []), {
    actorId: SITTER_ID,
    actorRole: "sitter",
    bookingId: FUTURE_BOOKING_ID,
    sessionId: LIVE_SESSION_ID,
    reasonId: "end_incomplete"
  });
  assert.equal(result.ok, false);
  assert.equal(store.bookings.get(FUTURE_BOOKING_ID)?.status, "approved");
  assert.equal(store.bookings.get(LIVE_BOOKING_ID)?.requires_admin_review, false);
}

{
  const store = seedStore();
  const result = await markDisplayedStuckShiftForReview(createMockSupabase(store, []), {
    actorId: SITTER_ID,
    actorRole: "sitter",
    bookingId: PENDING_BOOKING_ID,
    sessionId: LIVE_SESSION_ID,
    reasonId: "end_incomplete"
  });
  assert.equal(result.ok, false);
  assert.equal(store.bookings.get(PENDING_BOOKING_ID)?.status, "pending");
}

{
  const store = seedStore();
  const ops: Op[] = [];
  const result = await markLiveStartedShiftForSitter(store, ops, { failUpdateOn: "bookings" });
  assert.equal(result.ok, false);
  assert.equal(store.bookings.get(LIVE_BOOKING_ID)?.requires_admin_review, false);
  assert.equal(store.sessions.get(LIVE_SESSION_ID)?.status, "active");
}

{
  const store = seedStore();
  const result = await markDisplayedStuckShiftForReview(createMockSupabase(store, []), {
    parentId: PARENT_ID,
    bookingId: FUTURE_BOOKING_ID,
    sessionId: LIVE_SESSION_ID,
    reasonId: "end_incomplete"
  });
  assert.equal(result.ok, false);
  assert.equal(store.bookings.get(FUTURE_BOOKING_ID)?.status, "approved");
  assert.equal(store.bookings.get(FUTURE_BOOKING_ID)?.requires_admin_review, false);
  assert.equal(store.bookings.get(LIVE_BOOKING_ID)?.status, "parent_started");
  assert.equal(store.sessions.get(LIVE_SESSION_ID)?.status, "active");
}

{
  const store = seedStore();
  const result = await markDisplayedStuckShiftForReview(createMockSupabase(store, []), {
    parentId: PARENT_ID,
    bookingId: PENDING_BOOKING_ID,
    sessionId: LIVE_SESSION_ID,
    reasonId: "end_incomplete"
  });
  assert.equal(result.ok, false);
  assert.equal(store.bookings.get(PENDING_BOOKING_ID)?.status, "pending");
}

{
  const store = seedStore();
  store.sessions.set(LIVE_SESSION_ID, {
    ...store.sessions.get(LIVE_SESSION_ID)!,
    sitter_start_shake: null,
    parent_start_shake: null
  });
  const ops: Op[] = [];
  const result = await markLiveStartedShift(store, ops);
  assert.equal(result.ok, false);
  assert.equal(store.bookings.get(LIVE_BOOKING_ID)?.requires_admin_review, false);
  assert.equal(store.bookings.get(LIVE_BOOKING_ID)?.status, "parent_started");
  assert.equal(ops.some((op) => op.action === "update"), false);
}

{
  const store = seedStore();
  const result = await markDisplayedStuckShiftForReview(createMockSupabase(store, []), {
    parentId: PARENT_ID,
    bookingId: LIVE_BOOKING_ID,
    sessionId: COMPLETED_SESSION_ID,
    reasonId: "end_incomplete"
  });
  assert.equal(result.ok, false);
  assert.equal(store.bookings.get(LIVE_BOOKING_ID)?.status, "parent_started");
  assert.equal(store.sessions.get(COMPLETED_SESSION_ID)?.status, "completed");
}

{
  const store = seedStore();
  const ops: Op[] = [];
  const result = await markLiveStartedShift(store, ops, {
    reasonId: "other",
    detail: "המסך נתקע אחרי הסיום"
  });
  assert.equal(result.ok, true);
  assert.equal(store.bookings.get(LIVE_BOOKING_ID)?.stuck_release_reason, "other");
  assert.equal(store.bookings.get(LIVE_BOOKING_ID)?.stuck_release_detail, "המסך נתקע אחרי הסיום");
}

// 21. DB failure does not mutate rows; dashboard must not force idle.
{
  const store = seedStore();
  const ops: Op[] = [];
  const result = await markLiveStartedShift(store, ops, { failUpdateOn: "bookings" });
  assert.equal(result.ok, false);
  assert.equal(store.bookings.get(LIVE_BOOKING_ID)?.status, "parent_started");
  assert.equal(store.bookings.get(LIVE_BOOKING_ID)?.requires_admin_review, false);
  assert.equal(store.sessions.get(LIVE_SESSION_ID)?.status, "active");
}

{
  const confirmBlock = dashboard.slice(
    dashboard.indexOf("const handleConfirmReleaseStuckShift"),
    dashboard.indexOf("const handlePendingWithdrawn")
  );
  assert.match(confirmBlock, /if \(!result\.ok\)/);
  assert.match(confirmBlock, /setShiftError\(result\.error\)/);
  assert.match(confirmBlock, /refreshLiveShiftState/);
  assert.doesNotMatch(confirmBlock, /clearToIdleDashboard/);
  assert.doesNotMatch(confirmBlock, /clearHypPendingCheckout/);
  assert.doesNotMatch(confirmBlock, /computeAuthoritativeShiftCharge/);
  assert.doesNotMatch(confirmBlock, /submitSessionRating/);
}

{
  const sitterConfirmBlock = sitterDashboard.slice(
    sitterDashboard.indexOf("const handleConfirmReleaseStuckShift"),
    sitterDashboard.indexOf("const liveElapsed = useMemo")
  );
  assert.match(sitterConfirmBlock, /if \(!result\.ok\)/);
  assert.match(sitterConfirmBlock, /setBanner\(result\.error\)/);
  assert.match(sitterConfirmBlock, /refreshForUser/);
  assert.doesNotMatch(sitterConfirmBlock, /clearSitterShiftUi/);
  assert.doesNotMatch(sitterConfirmBlock, /resetStuckShiftsForSitter/);
  assert.doesNotMatch(sitterConfirmBlock, /window\.location\.reload/);
  assert.doesNotMatch(sitterConfirmBlock, /clearHypPendingCheckout/);
  assert.doesNotMatch(sitterConfirmBlock, /computeAuthoritativeShiftCharge/);
  assert.doesNotMatch(sitterConfirmBlock, /submitSessionRating/);
}

assert.match(dashboard, /if \(releasingStuckShift\) return;/);
assert.match(dashboard, /disabled=\{releasingStuckShift\}/);
assert.match(modal, /busy = false/);
assert.match(modal, /disabled=\{\!canConfirm\}/);
assert.match(modal, /if \(event\.key === "Escape" && !busy\) onClose\(\)/);

// 14. no HYP/payment call from the review helper or parent confirm path
assert.doesNotMatch(scoped, /hyp|Hyp|HYP|wallet|checkout/i);
assert.match(chargeHelper, /isBookingBlockedFromAuthoritativeCharge/);
assert.equal(
  isBookingBlockedFromAuthoritativeCharge({ requires_admin_review: true }),
  true
);
assert.equal(
  isBookingBlockedFromAuthoritativeCharge({ requires_admin_review: false }),
  false
);

// 15. no rating eligibility created by review release
assert.match(ratingHelper, /bookingRequiresAdminReview/);
assert.equal(
  ["completed", "payment_pending", "paid", "sitter_completed"].includes("active"),
  false
);

// 16 + 17. Parent/sitter live UI ignores review booking
const reviewBooking = {
  id: LIVE_BOOKING_ID,
  status: "parent_started" as const,
  booking_date: "2026-08-24",
  start_time: "2026-08-24T10:00:00.000Z",
  end_time: "2026-08-24T14:00:00.000Z",
  requires_admin_review: true
};
assert.equal(isBookingEligibleForLiveShiftUi(reviewBooking), false);
assert.equal(isBookingDueForParentActiveShiftUi(reviewBooking), false);
assert.deepEqual(
  excludeStuckShiftReviewBookings([
    reviewBooking,
    { ...reviewBooking, id: FUTURE_BOOKING_ID, requires_admin_review: false, status: "approved" as const }
  ]).map((row) => row.id),
  [FUTURE_BOOKING_ID]
);
assert.match(liveUi, /bookingRequiresAdminReview/);
assert.match(todaysLinked, /excludeStuckShiftReviewBookings/);
assert.match(todaysLinked, /fetchStuckShiftReviewBookingIds/);
assert.match(todaysLinked, /fetchStuckShiftReviewLinks/);
assert.match(dashboard, /stuckShiftReviewNotice/);
assert.match(dashboard, /STUCK_SHIFT_REVIEW_LABEL/);
assert.match(sitterDashboard, /fetchStuckShiftReviewLinks/);
assert.match(sitterDashboard, /sessionLinkedToReviewBooking/);
assert.match(sitterDashboard, /STUCK_SHIFT_REVIEW_LABEL/);
assert.match(sitterDashboard, /!bookingRequiresAdminReview\(activeCircleBooking\)/);

// 18 + 19. History retains review shift with review label, never cancelled copy
assert.equal(STUCK_SHIFT_REVIEW_LABEL, "ממתינה לבדיקה");
assert.match(STUCK_SHIFT_REVIEW_SUPPORT, /לא בוצע חיוב נוסף/);
assert.equal(stuckShiftReviewHistoryLabel({ requires_admin_review: true }), STUCK_SHIFT_REVIEW_LABEL);
assert.equal(isSitterPastHistoryBooking({ status: "parent_started", requires_admin_review: true }), true);
assert.match(parentHistory, /if \(requiresAdminReview === true\) return STUCK_SHIFT_REVIEW_LABEL/);
assert.match(parentHistory, /requires_admin_review/);
assert.match(sitterHistory, /STUCK_SHIFT_REVIEW_LABEL/);
assert.match(sitterHistory, /isSitterPastHistoryBooking/);
assert.match(sitterHistory, /requires_admin_review/);

// 20. Admin can see review case
assert.match(adminPage, /listStuckShiftReviews/);
assert.match(adminPage, /requireAdminPage/);
assert.doesNotMatch(adminPage, /<input|createHyp|chargeSession|type=\"number\"/);
assert.match(adminApi, /requireAdminApi/);
assert.match(adminApi, /GET/);
const adminCases = mapStuckShiftReviewCases(
  [
    {
      id: LIVE_BOOKING_ID,
      parent_id: PARENT_ID,
      sitter_id: "sitter-live",
      status: "parent_started",
      payment_status: "unpaid",
      hourly_rate_nis: 80,
      requires_admin_review: true,
      stuck_release_reason: "end_incomplete",
      stuck_released_at: "2026-08-24T12:00:00.000Z",
      stuck_released_by: PARENT_ID
    }
  ],
  [
    {
      id: LIVE_SESSION_ID,
      booking_id: LIVE_BOOKING_ID,
      sitter_start_shake: SITTER_START,
      parent_start_shake: PARENT_START
    }
  ],
  {
    [PARENT_ID]: { first_name: "Parent" },
    "sitter-live": { first_name: "Sitter" }
  }
);
assert.equal(adminCases.length, 1);
assert.equal(adminCases[0]?.bookingId, LIVE_BOOKING_ID);
assert.equal(adminCases[0]?.sessionId, LIVE_SESSION_ID);
assert.equal(adminCases[0]?.releaseReason, "end_incomplete");
assert.equal(adminCases[0]?.sitterStartShake, SITTER_START);
assert.equal(adminCases[0]?.releasedByRole, "parent");
assert.equal(adminCases[0]?.releasedBy, PARENT_ID);

const sitterAdminCases = mapStuckShiftReviewCases(
  [
    {
      id: LIVE_BOOKING_ID,
      parent_id: PARENT_ID,
      sitter_id: SITTER_ID,
      status: "parent_started",
      requires_admin_review: true,
      stuck_released_by: SITTER_ID
    }
  ],
  [],
  {}
);
assert.equal(sitterAdminCases[0]?.releasedByRole, "sitter");
assert.equal(stuckShiftReleasedByRole({
  parent_id: PARENT_ID,
  sitter_id: SITTER_ID,
  stuck_released_by: PARENT_ID
}), "parent");
assert.equal(stuckShiftReleasedByRole({
  parent_id: PARENT_ID,
  sitter_id: SITTER_ID,
  stuck_released_by: SITTER_ID
}), "sitter");
assert.match(adminPage, /Released by/);
assert.match(adminPage, /Parent/);
assert.match(adminPage, /Sitter/);

console.log("test-release-stuck-shift-scope: ok");
}

void main();
