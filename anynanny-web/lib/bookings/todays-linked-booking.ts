import type { SupabaseClient } from "@supabase/supabase-js";
import { BOOKING_SELECT_MINIMAL } from "@/lib/bookings/booking-status-update";
import { isBookingEligibleForLiveShiftUi } from "@/lib/bookings/booking-shift-ui";
import { todayDateISO } from "@/lib/bookings/booking-date-utils";
import { BOOKINGS_TABLE, type BookingRow, type BookingStatus } from "@/lib/bookings/constants";
import { formatBookingSchedule } from "@/lib/bookings/sitter-pending-bookings";
import { SITTER_PROFILES_TABLE, SITTER_PROFILES_USER_COLUMN } from "@/lib/sitter/sitter-profile";
import { PROFILES_TABLE } from "@/lib/supabase/profiles";

/** Statuses that keep parent/sitter linked for today's Double-Shake flow. */
export const TODAYS_LINKED_BOOKING_STATUSES: BookingStatus[] = [
  "approved",
  "sitter_started",
  "parent_started",
  "sitter_ended"
];

export type TodaysLinkedBookingView = BookingRow & {
  schedule_label: string;
  partner_user_id: string;
  partner_full_name: string | null;
  /** Public nanny serial (e.g. AN-1004) when partner is the sitter. */
  partner_sitter_code: string | null;
};

function pickSitterCode(raw: Record<string, unknown> | null | undefined): string | null {
  if (!raw) return null;
  const serial = String(raw.nanny_serial ?? raw.nanny_id_number ?? raw.nannySerial ?? "").trim();
  return serial.length > 0 ? serial : null;
}

export function formatParentShiftStartButtonLabel(
  fullName: string | null | undefined,
  sitterCode: string | null | undefined
): string {
  const name = fullName?.trim() || "הנני";
  const code = sitterCode?.trim();
  return code ? `תחילת משמרת של ${name} (${code})` : `תחילת משמרת של ${name}`;
}

export function formatParentShiftApproveButtonLabel(
  fullName: string | null | undefined,
  sitterCode: string | null | undefined
): string {
  const name = fullName?.trim() || "הנני";
  const code = sitterCode?.trim();
  return code ? `אשר תחילת משמרת של ${name} (${code})` : `אשר תחילת משמרת של ${name}`;
}

export async function fetchTodaysLinkedBooking(
  supabase: SupabaseClient,
  userId: string,
  role: "parent" | "sitter"
): Promise<{ booking: TodaysLinkedBookingView | null; error: string | null }> {
  const today = todayDateISO();
  const participantColumn = role === "parent" ? "parent_id" : "sitter_id";
  const partnerColumn = role === "parent" ? "sitter_id" : "parent_id";

  const { data: row, error } = await supabase
    .from(BOOKINGS_TABLE)
    .select(
      BOOKING_SELECT_MINIMAL
    )
    .eq(participantColumn, userId)
    .eq("booking_date", today)
    .in("status", TODAYS_LINKED_BOOKING_STATUSES)
    .order("start_time", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    return { booking: null, error: error.message };
  }

  if (!row) {
    return { booking: null, error: null };
  }

  const booking = row as BookingRow;

  if (!isBookingEligibleForLiveShiftUi(booking)) {
    return { booking: null, error: null };
  }

  const partnerId = String(booking[partnerColumn as keyof BookingRow]);

  const { data: profile } = await supabase
    .from(PROFILES_TABLE)
    .select("full_name")
    .eq("id", partnerId)
    .maybeSingle();

  let partnerName =
    profile && typeof profile === "object" && "full_name" in profile
      ? String((profile as { full_name?: string }).full_name ?? "").trim() || null
      : null;

  let partnerSitterCode: string | null = null;

  if (role === "parent") {
    const fk = SITTER_PROFILES_USER_COLUMN;
    const { data: sitterProfile } = await supabase
      .from(SITTER_PROFILES_TABLE)
      .select("full_name, nanny_serial, nanny_id_number")
      .eq(fk, partnerId)
      .maybeSingle();

    if (sitterProfile && typeof sitterProfile === "object") {
      const sp = sitterProfile as Record<string, unknown>;
      partnerSitterCode = pickSitterCode(sp);
      if (!partnerName) {
        const fromSitter = String(sp.full_name ?? "").trim();
        if (fromSitter) partnerName = fromSitter;
      }
    }
  }

  return {
    booking: {
      ...booking,
      schedule_label: formatBookingSchedule(booking),
      partner_user_id: partnerId,
      partner_full_name: partnerName,
      partner_sitter_code: partnerSitterCode
    },
    error: null
  };
}

/** Latest booking row for today (any status) — used to gate session timer UI after early finish. */
export async function fetchTodayBookingShiftGate(
  supabase: SupabaseClient,
  userId: string,
  role: "parent" | "sitter"
): Promise<Pick<BookingRow, "status" | "parent_id" | "sitter_id"> | null> {
  const today = todayDateISO();
  const participantColumn = role === "parent" ? "parent_id" : "sitter_id";

  const { data, error } = await supabase
    .from(BOOKINGS_TABLE)
    .select("status, parent_id, sitter_id")
    .eq(participantColumn, userId)
    .eq("booking_date", today)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as Pick<BookingRow, "status" | "parent_id" | "sitter_id">;
}
