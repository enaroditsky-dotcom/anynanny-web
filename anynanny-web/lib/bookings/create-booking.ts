import type { SupabaseClient } from "@supabase/supabase-js";

import {
  BOOKINGS_TABLE,
  type BookingRow
} from "@/lib/bookings/constants";

import { sitterWindowIsAvailable } from "@/lib/bookings/sitter-window-availability";
import {
  resolveShiftTimeWindow,
  sitterHasOverlappingActiveShift
} from "@/lib/bookings/sitter-shift-overlap";

export { validateShiftWindow } from "@/lib/shift-requests/create-shift-request";

export const SITTER_UNAVAILABLE_FOR_WINDOW_MESSAGE =
  "הבייביסיטר כבר אינה פנויה בשעות שבחרת. חזור לחיפוש כדי למצוא בייביסיטר אחרת.";

export async function createBooking(
  supabase: SupabaseClient,
  parentId: string,
  input: {
    sitterId: string;

    /** Calendar start day of the shift (`bookings.booking_date`). */
    bookingDate: string;

    /** Calendar end day. `end_time` itself stores the complete timestamptz. */
    endBookingDate: string;

    startIso: string;
    endIso: string;

    /** Snapshot of the sitter's hourly rate at booking time. */
    hourlyRateNis: number;
  }
): Promise<{
  booking: BookingRow | null;
  error: string | null;
}> {
  const parentIdTrimmed = parentId.trim();
  const sitterIdTrimmed = input.sitterId.trim();

  if (!parentIdTrimmed) {
    return {
      booking: null,
      error: "חסר מזהה הורה ליצירת ההזמנה."
    };
  }

  if (!sitterIdTrimmed) {
    return {
      booking: null,
      error: "חסר מזהה בייביסיטר ליצירת ההזמנה."
    };
  }

  const hourlyRateNis = Number(input.hourlyRateNis);

  /*
   * אסור ליצור הזמנה עם מחיר fallback שרירותי.
   * המחיר שנשמר כאן הוא Snapshot של המחיר שההורה
   * ראה בזמן ביצוע ההזמנה.
   */
  if (
    !Number.isFinite(hourlyRateNis) ||
    hourlyRateNis <= 0
  ) {
    return {
      booking: null,
      error:
        "לא ניתן ליצור הזמנה ללא תעריף תקין של הבייביסיטר."
    };
  }

  const proposed = resolveShiftTimeWindow({
    booking_date: input.bookingDate,
    start_time: input.startIso,
    end_time: input.endIso
  });

  if (proposed) {
    const rpcAvailability = await sitterWindowIsAvailable(
      supabase,
      sitterIdTrimmed,
      input.startIso,
      input.endIso
    );

    if (rpcAvailability.usedRpc) {
      if (rpcAvailability.available === false) {
        return {
          booking: null,
          error: SITTER_UNAVAILABLE_FOR_WINDOW_MESSAGE
        };
      }
    } else {
      const overlapping = await sitterHasOverlappingActiveShift(
        supabase,
        sitterIdTrimmed,
        proposed
      );
      if (overlapping) {
        return {
          booking: null,
          error: SITTER_UNAVAILABLE_FOR_WINDOW_MESSAGE
        };
      }
    }
  }

  const { data, error } = await supabase
    .from(BOOKINGS_TABLE)
    .insert({
      parent_id: parentIdTrimmed,
      sitter_id: sitterIdTrimmed,
      booking_date: input.bookingDate,
      start_time: input.startIso,
      end_time: input.endIso,
      status: "pending",

      /*
       * זה המחיר הקובע של המשמרת.
       * שינוי עתידי במחיר בפרופיל הנני לא ישנה הזמנה קיימת.
       */
      hourly_rate_nis: hourlyRateNis
    })
    .select(
      [
        "id",
        "parent_id",
        "sitter_id",
        "booking_date",
        "start_time",
        "end_time",
        "status",
        "hourly_rate_nis",
        "created_at",
        "updated_at"
      ].join(", ")
    )
    .single();

  if (error) {
    const message = error.message ?? "";
    const lower = message.toLowerCase();

    if (
      lower.includes("row-level security") ||
      lower.includes("policy")
    ) {
      return {
        booking: null,
        error:
          "אין הרשאה לשלוח בקשה. ודאו שהתחברתם כהורה."
      };
    }

    if (
      lower.includes("bookings") &&
      lower.includes("schema cache")
    ) {
      return {
        booking: null,
        error:
          "טבלת bookings עדיין לא זמינה — הריצו את המיגרציה ב-Supabase."
      };
    }

    if (
      lower.includes("hourly_rate_nis") &&
      (
        lower.includes("column") ||
        lower.includes("schema cache")
      )
    ) {
      return {
        booking: null,
        error:
          "השדה hourly_rate_nis עדיין לא קיים או לא נטען בטבלת bookings."
      };
    }

    return {
      booking: null,
      error: message || "יצירת ההזמנה נכשלה."
    };
  }

  return {
    booking: data as unknown as BookingRow,
    error: null
  };
}