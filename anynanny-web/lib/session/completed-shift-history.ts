import { HOURLY_RATE } from "@/lib/session/protocol";

export type HistorySessionRow = {
  id: string;
  booking_id?: string | null;
  parent_id?: string | null;
  sitter_id?: string | null;
  created_at?: string | null;

  start_time?: string | null;
  end_time?: string | null;

  start_time_confirmed_by_sitter?: string | null;
  end_time_confirmed_by_parent?: string | null;

  final_elapsed_seconds?: number | null;
  total_minutes?: number | null;

  billing_rate_per_minute?: number | null;
  hourly_rate?: number | null;

  total_amount_charged?: number | null;
  final_amount_nis?: number | null;
  total_amount?: number | null;
};

export type HistoryBookingRef = {
  id: string;
  sitter_id?: string | null;
  parent_id?: string | null;
  booking_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
};

export const SESSION_HISTORY_SELECT_ATTEMPTS = [
  [
    "id",
    "booking_id",
    "parent_id",
    "sitter_id",
    "created_at",
    "start_time",
    "end_time",
    "start_time_confirmed_by_sitter",
    "end_time_confirmed_by_parent",
    "final_elapsed_seconds",
    "total_minutes",
    "billing_rate_per_minute",
    "hourly_rate",
    "total_amount_charged",
    "final_amount_nis",
    "total_amount"
  ].join(", "),

  [
    "id",
    "booking_id",
    "parent_id",
    "sitter_id",
    "created_at",
    "start_time",
    "end_time",
    "final_elapsed_seconds",
    "billing_rate_per_minute",
    "total_amount_charged",
    "final_amount_nis"
  ].join(", "),

  [
    "id",
    "booking_id",
    "parent_id",
    "sitter_id",
    "created_at",
    "start_time_confirmed_by_sitter",
    "end_time_confirmed_by_parent",
    "total_minutes",
    "hourly_rate",
    "total_amount"
  ].join(", "),

  [
    "id",
    "booking_id",
    "parent_id",
    "sitter_id",
    "created_at",
    "start_time",
    "end_time"
  ].join(", ")
] as const;

export function finiteNonNegative(
  value: unknown
): number | null {
  if (value == null || value === "") {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number) && number >= 0
    ? number
    : null;
}

export function timestampMs(
  value: unknown
): number | null {
  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    return null;
  }

  const parsed = new Date(value).getTime();

  return Number.isFinite(parsed)
    ? parsed
    : null;
}

export function bookingDateTimeMs(
  date: unknown,
  time: unknown
): number | null {
  if (
    typeof date !== "string" ||
    typeof time !== "string" ||
    !date ||
    !time
  ) {
    return null;
  }

  const direct = timestampMs(time);

  if (direct != null) {
    return direct;
  }

  return timestampMs(
    `${date.slice(0, 10)}T${time}`
  );
}

export function localDateKey(
  value: unknown
): string | null {
  const ms = timestampMs(value);

  if (ms == null) {
    return null;
  }

  const date = new Date(ms);

  const year = date.getFullYear();

  const month = String(
    date.getMonth() + 1
  ).padStart(2, "0");

  const day = String(
    date.getDate()
  ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

/**
 * זמן התחלת המשמרת בפועל.
 *
 * סדר העדיפות נשמר זהה בכל המערכת.
 */
export function sessionStartValue(
  session: HistorySessionRow
): string | null {
  return (
    session.start_time ||
    session.start_time_confirmed_by_sitter ||
    session.created_at ||
    null
  );
}

/**
 * זמן סיום המשמרת בפועל.
 */
export function sessionEndValue(
  session: HistorySessionRow
): string | null {
  return (
    session.end_time ||
    session.end_time_confirmed_by_parent ||
    null
  );
}

/**
 * מקשר Booking ל-Session הנכון.
 *
 * עדיפות ראשונה תמיד לקישור מפורש booking_id.
 * ה-fallbacks קיימים רק לתאימות עם Sessions ישנים.
 */
export function resolveSessionForBooking(
  booking: HistoryBookingRef,
  sessions: HistorySessionRow[]
): HistorySessionRow | undefined {
  const directlyLinked =
    sessions.find(
      (session) =>
        session.booking_id === booking.id ||
        session.id === booking.id
    );

  if (directlyLinked) {
    return directlyLinked;
  }

  let candidates = sessions;

  if (booking.sitter_id) {
    candidates = candidates.filter(
      (session) =>
        session.sitter_id === booking.sitter_id
    );
  }

  if (booking.parent_id) {
    const sameParent =
      candidates.filter(
        (session) =>
          !session.parent_id ||
          session.parent_id === booking.parent_id
      );

    if (sameParent.length > 0) {
      candidates = sameParent;
    }
  }

  if (candidates.length === 0) {
    return undefined;
  }

  const bookingDate =
    booking.booking_date?.slice(0, 10);

  if (bookingDate) {
    const sameDate =
      candidates.find(
        (session) =>
          localDateKey(
            sessionStartValue(session)
          ) === bookingDate
      );

    if (sameDate) {
      return sameDate;
    }
  }

  const scheduledStart =
    bookingDateTimeMs(
      booking.booking_date,
      booking.start_time
    );

  if (scheduledStart == null) {
    return candidates[0];
  }

  return candidates.reduce(
    (closest, session) => {
      const currentStart =
        timestampMs(
          sessionStartValue(session)
        );

      const closestStart =
        timestampMs(
          sessionStartValue(closest)
        );

      if (currentStart == null) {
        return closest;
      }

      if (closestStart == null) {
        return session;
      }

      return Math.abs(
        currentStart - scheduledStart
      ) <
        Math.abs(
          closestStart - scheduledStart
        )
        ? session
        : closest;
    }
  );
}

export function formatShiftTime(
  value: unknown
): string | null {
  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    return null;
  }

  const raw = value.trim();

  const timeOnly =
    raw.match(
      /^(\d{1,2}):(\d{2})/
    );

  if (timeOnly) {
    return `${timeOnly[1].padStart(
      2,
      "0"
    )}:${timeOnly[2]}`;
  }

  const parsed =
    new Date(raw);

  if (
    Number.isNaN(
      parsed.getTime()
    )
  ) {
    return null;
  }

  return new Intl.DateTimeFormat(
    "he-IL",
    {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }
  ).format(parsed);
}

export function formatShiftDate(
  value: unknown
): string | null {
  const ms = timestampMs(value);

  if (ms == null) {
    return null;
  }

  const date = new Date(ms);

  return new Intl.DateTimeFormat(
    "he-IL",
    {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    }
  ).format(date);
}

export function formatNis(
  amount: number | null
): string {
  if (
    amount == null ||
    !Number.isFinite(amount)
  ) {
    return "טרם נקבע";
  }

  return new Intl.NumberFormat(
    "he-IL",
    {
      style: "currency",
      currency: "ILS",
      minimumFractionDigits:
        amount % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2
    }
  ).format(amount);
}

/**
 * סכום המשמרת בפועל.
 *
 * קודם משתמשים בסכום שכבר נשמר ב-Session.
 * רק במקרה שאין סכום נשמר - מחשבים fallback.
 */
export function resolveCompletedShiftAmount(
  params: {
    session?: HistorySessionRow;
    bookingStart: unknown;
    bookingEnd: unknown;
    bookingDate: unknown;

    /**
     * עדיף להעביר כאן את hourly_rate_nis
     * שנשמר ב-Booking בזמן ההזמנה.
     */
    sitterHourlyRate: unknown;

    allowCalculation: boolean;
  }
): number | null {
  const { session } = params;

  const storedAmount =
    finiteNonNegative(
      session?.total_amount_charged
    ) ??
    finiteNonNegative(
      session?.total_amount
    ) ??
    finiteNonNegative(
      session?.final_amount_nis
    );

  if (storedAmount != null) {
    return storedAmount;
  }

  if (!params.allowCalculation) {
    return null;
  }

  const elapsedSeconds =
    finiteNonNegative(
      session?.final_elapsed_seconds
    ) ??
    (() => {
      const minutes =
        finiteNonNegative(
          session?.total_minutes
        );

      return minutes == null
        ? null
        : minutes * 60;
    })() ??
    (() => {
      const start =
        timestampMs(
          session
            ? sessionStartValue(
                session
              )
            : null
        ) ??
        bookingDateTimeMs(
          params.bookingDate,
          params.bookingStart
        );

      const end =
        timestampMs(
          session
            ? sessionEndValue(
                session
              )
            : null
        ) ??
        bookingDateTimeMs(
          params.bookingDate,
          params.bookingEnd
        );

      if (
        start == null ||
        end == null ||
        end < start
      ) {
        return null;
      }

      return (
        (end - start) /
        1000
      );
    })();

  if (elapsedSeconds == null) {
    return null;
  }

  const ratePerMinute =
    finiteNonNegative(
      session?.billing_rate_per_minute
    );

  const hourlyRate =
    (
      ratePerMinute != null &&
      ratePerMinute > 0
        ? ratePerMinute * 60
        : null
    ) ??
    finiteNonNegative(
      session?.hourly_rate
    ) ??
    finiteNonNegative(
      params.sitterHourlyRate
    ) ??
    HOURLY_RATE;

  return (
    Math.round(
      (elapsedSeconds /
        3600) *
        hourlyRate *
        100
    ) / 100
  );
}