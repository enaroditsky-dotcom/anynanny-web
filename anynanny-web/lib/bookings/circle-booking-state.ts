import type { BookingRow, BookingStatus } from "@/lib/bookings/constants";
import type { TodaysLinkedBookingView } from "@/lib/bookings/todays-linked-booking";
import {
  normalizeBookingStatus,
  type BookingStatusInput
} from "@/lib/bookings/use-shift-activation-status";

const HARD_TERMINAL_STATUSES = new Set<BookingStatus>([
  "rejected",
  "cancelled",
  "completed"
]);

function normalizedStatusValue(status: BookingStatusInput): BookingStatus | undefined {
  return normalizeBookingStatus(status);
}

/** Stable fingerprint for circle + activation hook — only live fields that affect UI. */
export function circleBookingFingerprint(
  booking:
    | Pick<BookingRow, "id" | "status" | "start_time" | "end_time" | "updated_at">
    | null
    | undefined
): string | null {
  if (!booking?.id) return null;
  return [
    booking.id,
    normalizedStatusValue(booking.status) ?? "",
    booking.start_time,
    booking.end_time,
    booking.updated_at ?? ""
  ].join("\0");
}

export function circleBookingsEqual(
  a: TodaysLinkedBookingView | null | undefined,
  b: TodaysLinkedBookingView | null | undefined
): boolean {
  return circleBookingFingerprint(a) === circleBookingFingerprint(b);
}

function isHardTerminalStatus(status: BookingStatusInput): boolean {
  const normalized = normalizedStatusValue(status);
  return Boolean(normalized && HARD_TERMINAL_STATUSES.has(normalized));
}

/** Map a Supabase bookings row onto the stable circle view shape. */
export function bookingRowToCircleView(
  row: BookingRow,
  prev: TodaysLinkedBookingView | null,
  role: "parent" | "sitter"
): TodaysLinkedBookingView {
  return {
    id: row.id,
    parent_id: row.parent_id ?? prev?.parent_id ?? "",
    sitter_id: row.sitter_id ?? prev?.sitter_id ?? "",
    booking_date: row.booking_date ?? prev?.booking_date ?? "",
    start_time: row.start_time || prev?.start_time || "",
    end_time: row.end_time || prev?.end_time || "",
    status: normalizedStatusValue(row.status) ?? prev?.status ?? "pending",
    created_at: row.created_at ?? prev?.created_at ?? "",
    updated_at: row.updated_at ?? prev?.updated_at ?? "",
    schedule_label: prev?.schedule_label ?? "",
    partner_user_id:
      prev?.partner_user_id ?? (role === "parent" ? row.sitter_id : row.parent_id),
    partner_full_name: prev?.partner_full_name ?? null,
    partner_sitter_code: prev?.partner_sitter_code ?? null
  };
}

function mergeCircleBookingView(
  next: TodaysLinkedBookingView,
  prev: TodaysLinkedBookingView | null
): TodaysLinkedBookingView {
  if (!prev || prev.id !== next.id) return next;

  return {
    ...prev,
    ...next,
    start_time: next.start_time || prev.start_time,
    end_time: next.end_time || prev.end_time,
    booking_date: next.booking_date || prev.booking_date,
    schedule_label: next.schedule_label || prev.schedule_label,
    partner_user_id: next.partner_user_id || prev.partner_user_id,
    partner_full_name: next.partner_full_name ?? prev.partner_full_name,
    partner_sitter_code: next.partner_sitter_code ?? prev.partner_sitter_code
  };
}

export function resolveCircleBookingFromSync(
  payload: {
    booking: TodaysLinkedBookingView | null;
    row: BookingRow | null;
  },
  prev: TodaysLinkedBookingView | null,
  role: "parent" | "sitter"
): TodaysLinkedBookingView | null {
  if (payload.booking) {
    if (isHardTerminalStatus(payload.booking.status)) {
      return prev?.id === payload.booking.id ? null : prev;
    }
    return mergeCircleBookingView(payload.booking, prev);
  }

  if (!payload.row?.id || !payload.row.status) {
    return prev;
  }

  if (isHardTerminalStatus(payload.row.status)) {
    return prev?.id === payload.row.id ? null : prev;
  }

  if (prev?.id === payload.row.id) {
    return bookingRowToCircleView(payload.row, prev, role);
  }

  return bookingRowToCircleView(payload.row, null, role);
}
