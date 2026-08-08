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

function computeShiftTotals(
  session: Pick<
    SupabaseSessionRow,
    | "start_time"
    | "end_time"
    | "final_elapsed_seconds"
    | "final_amount_nis"
  >,
  hourlyRateNis: number
): {
  elapsedSeconds: number;
  amountNis: number;
} {
  /*
   * אם כבר נשמר elapsed סופי תקין,
   * משתמשים בו.
   */
  if (
    typeof session.final_elapsed_seconds === "number" &&
    Number.isFinite(session.final_elapsed_seconds) &&
    session.final_elapsed_seconds >= 0
  ) {
    const elapsedSeconds = Math.floor(
      session.final_elapsed_seconds
    );

    /*
     * אם כבר נשמר סכום סופי, משאירים אותו.
     * אחרת מחשבים לפי Snapshot של ההזמנה.
     */
    const amountNis =
      typeof session.final_amount_nis === "number" &&
      Number.isFinite(session.final_amount_nis)
        ? Number(session.final_amount_nis)
        : Number(
            (
              (elapsedSeconds / 3600) *
              hourlyRateNis
            ).toFixed(2)
          );

    return {
      elapsedSeconds,
      amountNis
    };
  }

  const startMs = session.start_time
    ? new Date(session.start_time).getTime()
    : NaN;

  const endMs = session.end_time
    ? new Date(session.end_time).getTime()
    : Date.now();

  const elapsedSeconds = Number.isFinite(startMs)
    ? Math.max(
        0,
        Math.floor(
          (endMs - startMs) / 1000
        )
      )
    : 0;

  const amountNis = Number(
    (
      (elapsedSeconds / 3600) *
      hourlyRateNis
    ).toFixed(2)
  );

  return {
    elapsedSeconds,
    amountNis
  };
}

/**
 * מוודא שה-Session נמצא בדיוק ב-payment_pending.
 *
 * זה חשוב כי בשלב הזה:
 *
 * סיום משמרת
 *      ↓
 * דירוג הורה
 *      ↓
 * תשלום
 *
 * עדיין אסור ל-Session להיות paid/completed.
 */
async function forceSessionToPaymentPending(
  supabase: SupabaseClient,
  session: SupabaseSessionRow,
  parentId: string,
  now: string,
  hourlyRateNis: number
): Promise<{
  row: SupabaseSessionRow | null;
  error: string | null;
}> {
  const totals = computeShiftTotals(
    session,
    hourlyRateNis
  );

  const updated =
    await updateSessionReturningRow(
      supabase,
      String(session.id),
      {
        status: "payment_pending",
        end_time: now,
        final_elapsed_seconds:
          totals.elapsedSeconds,
        final_amount_nis:
          totals.amountNis
      },
      {
        parentId
      }
    );

  if (updated.error || !updated.row) {
    return {
      row: null,
      error:
        updated.error ??
        "לא ניתן להעביר את המשמרת לשלב דירוג ותשלום."
    };
  }

  return {
    row: updated.row,
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

  const cleanParentId =
    parentId.trim();

  const cleanBookingId =
    bookingId.trim();

  if (!cleanParentId || !cleanBookingId) {
    return {
      row: null,
      session: null,
      error:
        "חסרים פרטי משמרת לאישור סיום."
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
    .select(
      "id, parent_id, sitter_id, status, hourly_rate_nis"
    )
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
      error:
        "המשמרת לא נמצאה."
    };
  }

  const bookingSnapshot =
    bookingData as BookingEndSnapshot;

  const hourlyRateNis =
    resolveHourlyRate(bookingSnapshot);

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

  let sessionRow:
    | SupabaseSessionRow
    | null = null;

  /*
   * 2.
   * אם קיבלנו Session ID מפורש,
   * זה תמיד ה-Session המועדף.
   */
  if (sessionId) {
    const cleanSessionId =
      sessionId.trim();

    if (cleanSessionId) {
      const {
        data: existingSession,
        error: existingSessionError
      } = await supabase
        .from(SESSIONS_TABLE)
        .select(
          [
            "id",
            "parent_id",
            "sitter_id",
            "status",
            "start_time",
            "end_time",
            "final_elapsed_seconds",
            "final_amount_nis",
            "parent_end_requested_at"
          ].join(", ")
        )
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
        sessionRow =
        existingSession as unknown as SupabaseSessionRow;

        /*
         * חשוב:
         * ברגע שההורה אישר סיום,
         * מסך הדירוג צריך להתחיל נקי.
         *
         * אם נשאר sessionStorage ישן מאותו Session,
         * לא ניתן לו לדלג אוטומטית על הדירוג.
         */
        clearParentSessionRatedLocally(
          cleanSessionId
        );

        const totals =
          computeShiftTotals(
            sessionRow,
            hourlyRateNis
          );

        /*
         * קודם מנסים RPC אטומי אם הוא קיים.
         */
        const {
          data: rpcData,
          error: rpcError
        } = await supabase.rpc(
          "end_shift_atomic",
          {
            p_session_id:
              cleanSessionId,

            p_parent_id:
              cleanParentId,

            p_end_iso:
              now,

            p_elapsed:
              totals.elapsedSeconds,

            p_amount:
              totals.amountNis
          }
        );

        if (rpcError) {
          console.warn(
            "[parentConfirmEndBooking] end_shift_atomic fallback:",
            rpcError.message
          );
        }

        if (rpcData) {
          sessionRow =
            rpcData as SupabaseSessionRow;
        }

        /*
         * גם אם ה-RPC הצליח:
         *
         * אנחנו לא סומכים על סטטוס ישן של RPC.
         * בשלב הזה ה-Session חייב להיות
         * payment_pending ולא paid/completed.
         */
        const normalized =
          await forceSessionToPaymentPending(
            supabase,
            sessionRow,
            cleanParentId,
            now,
            hourlyRateNis
          );

        if (
          normalized.error ||
          !normalized.row
        ) {
          return {
            row: null,
            session: null,
            error:
              normalized.error ??
              rpcError?.message ??
              "לא ניתן לעדכן את הסשן לשלב דירוג ותשלום."
          };
        }

        sessionRow =
          normalized.row;
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
    const {
      data: latest,
      error: latestError
    } = await supabase
      .from(SESSIONS_TABLE)
      .select(
        [
          "id",
          "parent_id",
          "sitter_id",
          "status",
          "start_time",
          "end_time",
          "final_elapsed_seconds",
          "final_amount_nis",
          "parent_end_requested_at"
        ].join(", ")
      )
      .eq(
        "parent_id",
        cleanParentId
      )
      .in(
        "status",
        [
          "active",
          "in_progress",
          "sitter_completed",
          "payment_pending"
        ]
      )
      .order(
        "created_at",
        {
          ascending: false
        }
      )
      .limit(1)
      .maybeSingle();

    if (latestError) {
      console.warn(
        "[parentConfirmEndBooking] latest session:",
        latestError.message
      );
    }

    if (latest) {
      sessionRow =
      latest as unknown as SupabaseSessionRow;

      const latestSessionId =
        String(sessionRow.id);

      /*
       * גם כאן מבטיחים שהדירוג לא ידולג
       * בגלל marker מקומי ישן.
       */
      clearParentSessionRatedLocally(
        latestSessionId
      );

      /*
       * גם אם הוא כבר payment_pending,
       * נרענן אותו בצורה idempotent.
       */
      const normalized =
        await forceSessionToPaymentPending(
          supabase,
          sessionRow,
          cleanParentId,
          now,
          hourlyRateNis
        );

      if (
        normalized.error ||
        !normalized.row
      ) {
        return {
          row: null,
          session: null,
          error:
            normalized.error ??
            "לא ניתן להעביר את המשמרת לשלב דירוג ותשלום."
        };
      }

      sessionRow =
        normalized.row;
    }
  }

  /*
   * בלי Session אי אפשר להמשיך ל-FLOW של דירוג ותשלום.
   */
  if (!sessionRow) {
    return {
      row: null,
      session: null,
      error:
        "לא נמצא Session פעיל לסיום המשמרת."
    };
  }

  /*
   * הגנת FLOW נוספת.
   */
  if (
    normalizeStatus(
      sessionRow.status
    ) !== "payment_pending"
  ) {
    return {
      row: null,
      session: sessionRow,
      error:
        "המשמרת לא עברה בצורה תקינה לשלב דירוג ותשלום."
    };
  }

  /*
   * 4.
   * העבודה עצמה הסתיימה ולכן booking הופך completed.
   *
   * זה לא מסמן תשלום.
   * payment_status נשאר unpaid עד checkout מוצלח.
   *
   * ה-Session נשאר payment_pending.
   */
  const {
    data,
    error
  } = await supabase
    .from(BOOKINGS_TABLE)
    .update({
      status: "completed",
      updated_at: now
    })
    .eq(
      "id",
      cleanBookingId
    )
    .eq(
      "parent_id",
      cleanParentId
    )
    .in(
      "status",
      [
        ...ENDABLE_BOOKING_STATUSES,
        "completed"
      ]
    )
    .select(
      BOOKING_SELECT_MINIMAL
    )
    .maybeSingle();

  if (error) {
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
    const {
      data: existing,
      error: existingError
    } = await supabase
      .from(BOOKINGS_TABLE)
      .select(
        BOOKING_SELECT_MINIMAL
      )
      .eq(
        "id",
        cleanBookingId
      )
      .eq(
        "parent_id",
        cleanParentId
      )
      .maybeSingle();

    if (existingError) {
      return {
        row: null,
        session: sessionRow,
        error:
          existingError.message
      };
    }

    if (
      existing &&
      normalizeStatus(
        existing.status
      ) === "completed"
    ) {
      return {
        row:
          existing as BookingRow,
        session:
          sessionRow,
        error:
          null
      };
    }

    return {
      row: null,
      session: sessionRow,
      error:
        "לא ניתן לאשר סיום — ייתכן שהמשמרת כבר נסגרה."
    };
  }

  return {
    row:
      data as BookingRow,

    session:
      sessionRow,

    error:
      null
  };
}