import type { SupabaseClient } from "@supabase/supabase-js";

import { BOOKING_SELECT_MINIMAL } from "@/lib/bookings/booking-status-update";
import {
  BOOKINGS_TABLE,
  type BookingRow
} from "@/lib/bookings/constants";

import { clearParentSessionRatedLocally } from "@/lib/ratings/parent-session-rated";

import {
  SESSIONS_TABLE,
  type SupabaseSessionRow
} from "@/lib/session/protocol";

import { updateSessionReturningRow } from "@/lib/session/sessions-query";
import { isPostgrestMissingColumnError } from "@/lib/supabase/postgrest-schema";

/**
 * Only values allowed by `bookings_status_check`
 * that can legitimately reach parent end confirmation.
 */
const ENDABLE_BOOKING_STATUSES = [
  "sitter_ended",
  "parent_started",
  "sitter_started"
] as const;

type BookingEndSnapshot = {
  id: string;
  parent_id: string;
  sitter_id: string;
  status: string;
  hourly_rate_nis?: number | null;
};

export type ParentConfirmEndResult = {
  row: BookingRow | null;
  session: SupabaseSessionRow | null;
  error: string | null;
};

function normalizeStatus(status: unknown): string {
  return String(status ?? "")
    .trim()
    .toLowerCase();
}

function resolveHourlyRate(
  booking: BookingEndSnapshot
): number | null {
  const rate = Number(booking.hourly_rate_nis);

  if (!Number.isFinite(rate) || rate <= 0) {
    return null;
  }

  return rate;
}

function sessionHasAuthoritativeEnd(
  session: SupabaseSessionRow | null | undefined
): boolean {
  if (!session) return false;
  const endTime =
    typeof session.end_time === "string" ? session.end_time.trim() : "";
  const elapsed = Number(session.final_elapsed_seconds);
  const amount = Number(session.final_amount_nis);
  return (
    normalizeStatus(session.status) === "payment_pending" &&
    endTime !== "" &&
    Number.isFinite(elapsed) &&
    elapsed >= 0 &&
    Number.isFinite(amount)
  );
}

/**
 * Status-only compatibility write.
 * Must NEVER overwrite server-computed end_time / elapsed / amount.
 */
async function ensureSessionPaymentPendingStatus(
  supabase: SupabaseClient,
  session: SupabaseSessionRow,
  parentId: string
): Promise<{
  row: SupabaseSessionRow | null;
  error: string | null;
}> {
  if (normalizeStatus(session.status) === "payment_pending") {
    return { row: session, error: null };
  }

  const updated = await updateSessionReturningRow(
    supabase,
    String(session.id),
    { status: "payment_pending" },
    { parentId }
  );

  if (updated.error || !updated.row) {
    return {
      row: null,
      error:
        updated.error ??
        "לא ניתן להעביר את המשמרת לשלב דירוג ותשלום."
    };
  }

  return { row: updated.row, error: null };
}

async function endShiftViaRpc(
  supabase: SupabaseClient,
  sessionId: string
): Promise<{
  row: SupabaseSessionRow | null;
  error: string | null;
}> {
  const { data, error } = await supabase.rpc("end_shift_atomic", {
    p_session_id: sessionId
  });

  if (error) {
    return { row: null, error: error.message };
  }

  return {
    row: (data as SupabaseSessionRow | null) ?? null,
    error: null
  };
}

/**
 * Parent confirms the sitter's end-shift request.
 *
 * FLOW:
 *
 * sitter requests end
 *        ↓
 * parent confirms end
 *        ↓
 * session = payment_pending
 *        ↓
 * parent MUST rate
 *        ↓
 * parent pays
 *        ↓
 * sitter rates parent
 *        ↓
 * session completed
 *
 * חשוב:
 * booking.status = completed מסמן שהעבודה עצמה הסתיימה.
 * הוא אינו אומר שהתשלום / הדירוגים הושלמו.
 */
export async function parentConfirmEndBooking(
  supabase: SupabaseClient,
  parentId: string,
  bookingId: string,
  sessionId?: string | null
): Promise<ParentConfirmEndResult> {
  const now = new Date().toISOString();

  const cleanParentId = parentId.trim();
  const cleanBookingId = bookingId.trim();

  if (!cleanParentId || !cleanBookingId) {
    return {
      row: null,
      session: null,
      error: "חסרים פרטי משמרת לאישור סיום."
    };
  }

  /*
   * 1.
   * טוענים את ההזמנה כדי לקבל את מחיר ה-Snapshot.
   */
  const {
    data: bookingData,
    error: bookingReadError
  } = await supabase
    .from(BOOKINGS_TABLE)
    .select("id, parent_id, sitter_id, status, hourly_rate_nis")
    .eq("id", cleanBookingId)
    .eq("parent_id", cleanParentId)
    .maybeSingle();

  if (bookingReadError) {
    return {
      row: null,
      session: null,
      error:
        bookingReadError.message ||
        "לא ניתן לטעון את פרטי המשמרת."
    };
  }

  if (!bookingData) {
    return {
      row: null,
      session: null,
      error: "המשמרת לא נמצאה."
    };
  }

  const bookingSnapshot = bookingData as BookingEndSnapshot;
  const hourlyRateNis = resolveHourlyRate(bookingSnapshot);

  /*
   * אין יותר fallback אוטומטי של ₪50.
   */
  if (hourlyRateNis == null) {
    return {
      row: null,
      session: null,
      error:
        "לא נמצא תעריף תקין למשמרת. לא ניתן לסגור אותה לתשלום."
    };
  }

  let sessionRow: SupabaseSessionRow | null = null;

  const sessionSelect = [
    "id",
    "parent_id",
    "sitter_id",
    "status",
    "start_time",
    "end_time",
    "final_elapsed_seconds",
    "final_amount_nis",
    "parent_end_requested_at"
  ].join(", ");

  /*
   * 2.
   * אם קיבלנו Session ID מפורש,
   * זה תמיד ה-Session המועדף.
   */
  if (sessionId) {
    const cleanSessionId = sessionId.trim();

    if (cleanSessionId) {
      const {
        data: existingSession,
        error: existingSessionError
      } = await supabase
        .from(SESSIONS_TABLE)
        .select(sessionSelect)
        .eq("id", cleanSessionId)
        .eq("parent_id", cleanParentId)
        .maybeSingle();

      if (existingSessionError) {
        console.warn(
          "[parentConfirmEndBooking] session read:",
          existingSessionError.message
        );
      }

      if (existingSession) {
        sessionRow = existingSession as unknown as SupabaseSessionRow;
        clearParentSessionRatedLocally(cleanSessionId);
      }
    }
  }

  /*
   * 3.
   * Recovery:
   * אם לא קיבלנו sessionId תקין,
   * מחפשים את ה-Session האחרון של ההורה.
   */
  if (!sessionRow) {
    const { data: latest, error: latestError } = await supabase
      .from(SESSIONS_TABLE)
      .select(sessionSelect)
      .eq("parent_id", cleanParentId)
      .in("status", [
        "active",
        "in_progress",
        "sitter_completed",
        "payment_pending"
      ])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestError) {
      console.warn(
        "[parentConfirmEndBooking] latest session:",
        latestError.message
      );
    }

    if (latest) {
      sessionRow = latest as unknown as SupabaseSessionRow;
      clearParentSessionRatedLocally(String(sessionRow.id));
    }
  }

  /*
   * בלי Session אי אפשר להמשיך ל-FLOW של דירוג ותשלום.
   */
  if (!sessionRow) {
    return {
      row: null,
      session: null,
      error: "לא נמצא Session פעיל לסיום המשמרת."
    };
  }

  const rpc = await endShiftViaRpc(supabase, String(sessionRow.id));
  if (rpc.row) {
    sessionRow = rpc.row;
  } else if (!sessionHasAuthoritativeEnd(sessionRow)) {
    return {
      row: null,
      session: null,
      error:
        rpc.error ??
        "לא ניתן לסגור את המשמרת. נסו שוב."
    };
  } else if (rpc.error) {
    console.warn(
      "[parentConfirmEndBooking] end_shift_atomic skipped; session already ended:",
      rpc.error
    );
  }

  const normalized = await ensureSessionPaymentPendingStatus(
    supabase,
    sessionRow,
    cleanParentId
  );

  if (normalized.error || !normalized.row) {
    return {
      row: null,
      session: null,
      error:
        normalized.error ??
        "לא ניתן לעדכן את הסשן לשלב דירוג ותשלום."
    };
  }

  sessionRow = normalized.row;

  if (normalizeStatus(sessionRow.status) !== "payment_pending") {
    return {
      row: null,
      session: sessionRow,
      error: "המשמרת לא עברה בצורה תקינה לשלב דירוג ותשלום."
    };
  }

  /*
   * 4.
   * העבודה עצמה הסתיימה ולכן booking הופך completed.
   *
   * זה לא מסמן תשלום.
   * payment_status נשאר unpaid עד checkout מוצלח.
   *
   * actual_end_time comes from the RPC-written session.end_time.
   */
  const actualEndIso =
    typeof sessionRow.end_time === "string" && sessionRow.end_time.trim()
      ? sessionRow.end_time.trim()
      : null;

  const bookingPatch: Record<string, unknown> = {
    status: "completed",
    updated_at: now
  };
  if (actualEndIso) {
    bookingPatch.actual_end_time = actualEndIso;
  }

  const { data, error } = await supabase
    .from(BOOKINGS_TABLE)
    .update(bookingPatch)
    .eq("id", cleanBookingId)
    .eq("parent_id", cleanParentId)
    .in("status", [...ENDABLE_BOOKING_STATUSES, "completed"])
    .select(BOOKING_SELECT_MINIMAL)
    .maybeSingle();

  if (error && isPostgrestMissingColumnError(error.message, "actual_end_time")) {
    const fallback = await supabase
      .from(BOOKINGS_TABLE)
      .update({
        status: "completed",
        updated_at: now
      })
      .eq("id", cleanBookingId)
      .eq("parent_id", cleanParentId)
      .in("status", [...ENDABLE_BOOKING_STATUSES, "completed"])
      .select(BOOKING_SELECT_MINIMAL)
      .maybeSingle();

    if (fallback.error) {
      return {
        row: null,
        session: sessionRow,
        error: fallback.error.message
      };
    }

    if (fallback.data) {
      return {
        row: fallback.data as BookingRow,
        session: sessionRow,
        error: null
      };
    }
  } else if (error) {
    return {
      row: null,
      session: sessionRow,
      error: error.message
    };
  }

  /*
   * Idempotency:
   * אם booking כבר completed,
   * לא מתייחסים לזה ככשל.
   */
  if (!data) {
    const { data: existing, error: existingError } = await supabase
      .from(BOOKINGS_TABLE)
      .select(BOOKING_SELECT_MINIMAL)
      .eq("id", cleanBookingId)
      .eq("parent_id", cleanParentId)
      .maybeSingle();

    if (existingError) {
      return {
        row: null,
        session: sessionRow,
        error: existingError.message
      };
    }

    if (existing && normalizeStatus(existing.status) === "completed") {
      return {
        row: existing as BookingRow,
        session: sessionRow,
        error: null
      };
    }

    return {
      row: null,
      session: sessionRow,
      error: "לא ניתן לאשר סיום — ייתכן שהמשמרת כבר נסגרה."
    };
  }

  return {
    row: data as BookingRow,
    session: sessionRow,
    error: null
  };
}
