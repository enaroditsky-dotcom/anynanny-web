import type { SupabaseClient } from "@supabase/supabase-js";
import { BOOKINGS_TABLE, type BookingStatus } from "@/lib/bookings/constants";
import { SESSIONS_TABLE } from "@/lib/session/protocol";
import { isPostgrestMissingColumnError } from "@/lib/supabase/postgrest-schema";
import {
  bookingRequiresAdminReview,
  hasConfirmedDoubleShakeStart
} from "@/lib/bookings/stuck-shift-review";

/** In-flight booking statuses the parent dashboard treats as a stuck/live shift. */
export const RELEASABLE_STUCK_BOOKING_STATUSES: readonly BookingStatus[] = [
  "approved",
  "sitter_started",
  "parent_started",
  "sitter_ended"
];

const PROTECTED_SESSION_STATUSES = new Set([
  "completed",
  "cancelled",
  "paid",
  "payment_pending"
]);

const PROTECTED_SESSION_BILLING_STATUSES = new Set(["paid", "completed"]);

export const RELEASE_STUCK_SHIFT_REASON_OTHER = "other" as const;

export const RELEASE_STUCK_SHIFT_REASONS = [
  { id: "end_incomplete", label: "תהליך סיום המשמרת לא הושלם" },
  { id: "ended_still_active", label: "המשמרת הסתיימה אך עדיין מופיעה כפעילה" },
  { id: "cannot_end_normally", label: "לא הצלחתי לסיים את המשמרת בדרך הרגילה" },
  { id: "other_technical", label: "תקלה טכנית אחרת" },
  { id: RELEASE_STUCK_SHIFT_REASON_OTHER, label: "אחר (פירוט)" }
] as const;

export type ReleaseStuckShiftReasonId = (typeof RELEASE_STUCK_SHIFT_REASONS)[number]["id"];

export const RELEASE_STUCK_SHIFT_COPY = {
  title: "שחרור משמרת תקועה",
  warning:
    "הפעולה מיועדת למשמרת שכבר התחילה ונתקעה במסך. השחרור יעביר רק את המשמרת הנוכחית לבדיקה, ישמור את פרטי המשמרת, ולא יבטל אותה ולא יבצע חיוב.",
  irreversible: "לא ניתן לבטל את ההעברה לבדיקה ממסך זה.",
  cancel: "ביטול",
  confirm: "כן, שחרר את המשמרת",
  confirming: "משחרר…",
  detailLabel: "פירוט",
  detailPlaceholder: "תארו בקצרה את התקלה",
  missingShift: "לא נמצאה משמרת לשחרור.",
  genericFailure: "לא ניתן לשחרר את המשמרת. נסו שוב.",
  notStarted:
    "ניתן לשחרר לבדיקה רק משמרת שהתחילה בפועל. בקשה שטרם התחילה מטופלת בביטול בקשה או בביטול משמרת מתוכננת."
} as const;

export type StuckShiftReviewActorRole = "parent" | "sitter";

export const SITTER_RELEASE_STUCK_SHIFT_WARNING =
  "הפעולה תעביר את המשמרת שמופיעה כעת לבדיקה. פרטי המשמרת והזכאות האפשרית לתשלום יישמרו.";

export type DisplayedStuckBooking = {
  id?: string | null;
  parent_id?: string | null;
  sitter_id?: string | null;
  status?: string | null;
  payment_status?: string | null;
  requires_admin_review?: boolean | null;
};

export type DisplayedStuckSession = {
  id?: string | number | null;
  booking_id?: string | null;
  sitter_id?: string | null;
  status?: string | null;
  session_status?: string | null;
  sitter_start_shake?: string | null;
  parent_start_shake?: string | null;
  sitter_end_shake?: string | null;
  parent_end_shake?: string | null;
};

export type ResolvedStuckShiftTargets = {
  bookingId: string;
  sessionId: string | null;
};

export type MarkDisplayedStuckShiftForReviewResult =
  | { ok: true; bookingId: string; sessionId: string }
  | { ok: false; error: string; bookingId?: string; sessionId?: string | null };

type SessionLookupRow = DisplayedStuckSession & {
  id: string | number;
  parent_id?: string | null;
  actual_end_time?: string | null;
  end_time?: string | null;
  final_amount_nis?: number | null;
  total_amount_charged?: number | null;
};

type BookingLookupRow = {
  id: string;
  status: string;
  parent_id?: string | null;
  sitter_id?: string | null;
  payment_status?: string | null;
  requires_admin_review?: boolean | null;
  actual_end_time?: string | null;
};

function normalize(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

export function isReleaseStuckShiftReasonId(value: string): value is ReleaseStuckShiftReasonId {
  return RELEASE_STUCK_SHIFT_REASONS.some((reason) => reason.id === value);
}

export function canSubmitReleaseStuckShiftReason(
  reasonId: string | null | undefined,
  detail: string | null | undefined
): boolean {
  if (!reasonId || !isReleaseStuckShiftReasonId(reasonId)) return false;
  if (reasonId !== RELEASE_STUCK_SHIFT_REASON_OTHER) return true;
  return Boolean(detail?.trim());
}

export function isProtectedStuckSession(session: DisplayedStuckSession | null | undefined): boolean {
  if (!session) return false;
  if (PROTECTED_SESSION_STATUSES.has(normalize(session.status))) return true;
  const billing = normalize(session.session_status);
  return Boolean(billing) && PROTECTED_SESSION_BILLING_STATUSES.has(billing);
}

export function sessionBelongsToDisplayedBooking(
  session: DisplayedStuckSession | null | undefined,
  booking: DisplayedStuckBooking | null | undefined
): boolean {
  if (!session || !booking?.id) return false;
  const sessionBookingId =
    session.booking_id != null ? String(session.booking_id).trim() : "";
  if (sessionBookingId) {
    return sessionBookingId === String(booking.id).trim();
  }
  const sessionSitterId =
    session.sitter_id != null ? String(session.sitter_id).trim() : "";
  const bookingSitterId =
    booking.sitter_id != null ? String(booking.sitter_id).trim() : "";
  if (!sessionSitterId || !bookingSitterId) return false;
  return sessionSitterId === bookingSitterId;
}

/**
 * Authority for stuck-shift release: the dashboard's displayed booking,
 * plus its currently displayed linked session. Do not scan other participant rows.
 */
export function resolveDisplayedStuckShiftTargets(
  booking: DisplayedStuckBooking | null | undefined,
  session: DisplayedStuckSession | null | undefined
): ResolvedStuckShiftTargets | { error: string } {
  const bookingId = booking?.id != null ? String(booking.id).trim() : "";
  if (!bookingId) {
    return { error: RELEASE_STUCK_SHIFT_COPY.missingShift };
  }

  const sessionId =
    session?.id != null && String(session.id).trim() && sessionBelongsToDisplayedBooking(session, booking)
      ? String(session.id).trim()
      : null;

  return { bookingId, sessionId };
}

function isReleasableBookingStatus(status: unknown): boolean {
  return RELEASABLE_STUCK_BOOKING_STATUSES.includes(normalize(status) as BookingStatus);
}

function isPaidBooking(booking: { payment_status?: string | null }): boolean {
  return normalize(booking.payment_status) === "paid";
}

function participantColumnForActor(
  role: StuckShiftReviewActorRole
): "parent_id" | "sitter_id" {
  return role === "sitter" ? "sitter_id" : "parent_id";
}

async function loadSessionRow(
  supabase: SupabaseClient,
  actorId: string,
  actorRole: StuckShiftReviewActorRole,
  sessionId: string
): Promise<{ row: SessionLookupRow | null; error: string | null }> {
  const withShakes = await supabase
    .from(SESSIONS_TABLE)
    .select(
      "id, parent_id, sitter_id, booking_id, status, session_status, sitter_start_shake, parent_start_shake, sitter_end_shake, parent_end_shake, end_time, final_amount_nis, total_amount_charged"
    )
    .eq("id", sessionId)
    .eq(participantColumnForActor(actorRole), actorId)
    .maybeSingle();

  if (!withShakes.error) {
    return { row: (withShakes.data as SessionLookupRow | null) ?? null, error: null };
  }

  if (
    !isPostgrestMissingColumnError(withShakes.error.message, "sitter_start_shake") &&
    !isPostgrestMissingColumnError(withShakes.error.message, "parent_start_shake") &&
    !isPostgrestMissingColumnError(withShakes.error.message, "session_status") &&
    !isPostgrestMissingColumnError(withShakes.error.message, "booking_id")
  ) {
    return { row: null, error: withShakes.error.message };
  }

  return {
    row: null,
    error: RELEASE_STUCK_SHIFT_COPY.notStarted
  };
}

async function loadBookingRow(
  supabase: SupabaseClient,
  actorId: string,
  actorRole: StuckShiftReviewActorRole,
  bookingId: string
): Promise<{ row: BookingLookupRow | null; error: string | null }> {
  const participantColumn = participantColumnForActor(actorRole);
  const withReview = await supabase
    .from(BOOKINGS_TABLE)
    .select("id, status, parent_id, sitter_id, payment_status, requires_admin_review, actual_end_time")
    .eq("id", bookingId)
    .eq(participantColumn, actorId)
    .maybeSingle();

  if (!withReview.error) {
    return { row: (withReview.data as BookingLookupRow | null) ?? null, error: null };
  }

  if (
    !isPostgrestMissingColumnError(withReview.error.message, "requires_admin_review") &&
    !isPostgrestMissingColumnError(withReview.error.message, "payment_status") &&
    !isPostgrestMissingColumnError(withReview.error.message, "actual_end_time")
  ) {
    return { row: null, error: withReview.error.message };
  }

  const core = await supabase
    .from(BOOKINGS_TABLE)
    .select("id, status, parent_id, sitter_id")
    .eq("id", bookingId)
    .eq(participantColumn, actorId)
    .maybeSingle();

  if (core.error) {
    return { row: null, error: core.error.message };
  }

  return { row: (core.data as BookingLookupRow | null) ?? null, error: null };
}

function scopedBookingUpdate(
  supabase: SupabaseClient,
  bookingId: string,
  actorId: string,
  actorRole: StuckShiftReviewActorRole,
  payload: Record<string, unknown>,
  select: string
) {
  return supabase
    .from(BOOKINGS_TABLE)
    .update(payload)
    .eq("id", bookingId)
    .eq(participantColumnForActor(actorRole), actorId)
    .in("status", [...RELEASABLE_STUCK_BOOKING_STATUSES])
    .select(select)
    .maybeSingle();
}

/**
 * Marks the displayed started shift for operator review.
 * Never cancels, deletes, or invents end/amount fields.
 * Does not set sessions.session_status = 'disputed': requires_admin_review plus
 * live-UI gates are sufficient to unstick both sides without a new session state.
 */
export async function markDisplayedStuckShiftForReview(
  supabase: SupabaseClient,
  params: {
    actorId?: string;
    actorRole?: StuckShiftReviewActorRole;
    parentId?: string;
    bookingId: string;
    sessionId?: string | null;
    reasonId: ReleaseStuckShiftReasonId;
    detail?: string | null;
  }
): Promise<MarkDisplayedStuckShiftForReviewResult> {
  const actorRole: StuckShiftReviewActorRole = params.actorRole ?? "parent";
  const actorId = String(params.actorId ?? params.parentId ?? "").trim();
  const bookingId = String(params.bookingId ?? "").trim();
  const sessionId = params.sessionId != null ? String(params.sessionId).trim() : "";
  const reasonId = params.reasonId;
  const detail = params.detail?.trim() ?? "";

  if (!actorId || !bookingId) {
    return { ok: false, error: RELEASE_STUCK_SHIFT_COPY.missingShift };
  }
  if (!canSubmitReleaseStuckShiftReason(reasonId, detail)) {
    return { ok: false, error: "יש לבחור סיבה לשחרור המשמרת." };
  }
  if (!sessionId) {
    return { ok: false, error: RELEASE_STUCK_SHIFT_COPY.notStarted, bookingId };
  }

  const bookingRead = await loadBookingRow(supabase, actorId, actorRole, bookingId);
  if (bookingRead.error) {
    return { ok: false, error: bookingRead.error, bookingId };
  }
  if (!bookingRead.row) {
    return { ok: false, error: "לא נמצאה המשמרת הנוכחית לשחרור.", bookingId };
  }
  if (bookingRequiresAdminReview(bookingRead.row)) {
    return { ok: true, bookingId, sessionId };
  }
  if (!isReleasableBookingStatus(bookingRead.row.status) || isPaidBooking(bookingRead.row)) {
    return {
      ok: false,
      error: "לא ניתן לשחרר משמרת שהסתיימה, שולמה, או שאינה המשמרת הפעילה.",
      bookingId
    };
  }

  const sessionRead = await loadSessionRow(supabase, actorId, actorRole, sessionId);
  if (sessionRead.error) {
    return { ok: false, error: sessionRead.error, bookingId, sessionId };
  }
  if (!sessionRead.row) {
    return { ok: false, error: "לא נמצא הסשן של המשמרת הנוכחית.", bookingId, sessionId };
  }
  if (!sessionBelongsToDisplayedBooking(sessionRead.row, bookingRead.row)) {
    return {
      ok: false,
      error: "הסשן המוצג אינו שייך למשמרת הנוכחית.",
      bookingId,
      sessionId
    };
  }
  if (!hasConfirmedDoubleShakeStart(sessionRead.row)) {
    return {
      ok: false,
      error: RELEASE_STUCK_SHIFT_COPY.notStarted,
      bookingId,
      sessionId
    };
  }
  if (isProtectedStuckSession(sessionRead.row)) {
    return {
      ok: false,
      error: "לא ניתן לשחרר משמרת שנמצאת בתשלום או שכבר הושלמה.",
      bookingId,
      sessionId
    };
  }

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    requires_admin_review: true,
    stuck_release_reason: reasonId,
    stuck_release_detail: reasonId === RELEASE_STUCK_SHIFT_REASON_OTHER ? detail : null,
    stuck_released_at: now,
    stuck_released_by: actorId,
    updated_at: now
  };

  const updated = await scopedBookingUpdate(
    supabase,
    bookingId,
    actorId,
    actorRole,
    patch,
    "id, status, requires_admin_review, actual_end_time"
  );

  if (updated.error && isPostgrestMissingColumnError(updated.error.message, "stuck_release_reason")) {
    const flagOnly = await scopedBookingUpdate(
      supabase,
      bookingId,
      actorId,
      actorRole,
      { requires_admin_review: true, updated_at: now },
      "id, status, requires_admin_review"
    );

    if (flagOnly.error) {
      return { ok: false, error: flagOnly.error.message, bookingId, sessionId };
    }
    if (!flagOnly.data) {
      return { ok: false, error: RELEASE_STUCK_SHIFT_COPY.genericFailure, bookingId, sessionId };
    }
    return { ok: true, bookingId, sessionId };
  }

  if (updated.error && isPostgrestMissingColumnError(updated.error.message, "updated_at")) {
    const withoutTimestamp = { ...patch };
    delete withoutTimestamp.updated_at;
    const retry = await scopedBookingUpdate(
      supabase,
      bookingId,
      actorId,
      actorRole,
      withoutTimestamp,
      "id, status, requires_admin_review"
    );
    if (retry.error) {
      return { ok: false, error: retry.error.message, bookingId, sessionId };
    }
    if (!retry.data) {
      return { ok: false, error: RELEASE_STUCK_SHIFT_COPY.genericFailure, bookingId, sessionId };
    }
    return { ok: true, bookingId, sessionId };
  }

  if (updated.error) {
    return { ok: false, error: updated.error.message, bookingId, sessionId };
  }
  if (!updated.data) {
    return { ok: false, error: RELEASE_STUCK_SHIFT_COPY.genericFailure, bookingId, sessionId };
  }

  return { ok: true, bookingId, sessionId };
}
