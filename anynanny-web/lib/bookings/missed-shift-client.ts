import type { SupabaseClient } from "@supabase/supabase-js";
import { BOOKINGS_TABLE, type BookingRow } from "@/lib/bookings/constants";
import {
  isMissedShiftReasonCode,
  missedShiftRequiresViewerAction,
  MISSED_SHIFT_AWAITING_REASON_STATUS,
  MISSED_SHIFT_LIFECYCLE_STATUSES,
  MISSED_SHIFT_REPORTS_TABLE,
  RECONCILE_UNSTARTED_PAST_BOOKINGS_RPC,
  SUBMIT_MISSED_SHIFT_REASON_RPC,
  type MissedShiftReasonCode,
  type MissedShiftReportRow
} from "@/lib/bookings/missed-shift-lifecycle";
import { normalizeBookingStatus } from "@/lib/bookings/booking-status-normalize";
import { readSupabaseErrorMessage } from "@/lib/supabase/postgrest-schema";

export const MISSED_SHIFT_BOOKING_SELECT =
  "id, parent_id, sitter_id, booking_date, start_time, end_time, status, actual_start_time, hourly_rate_nis, created_at, updated_at" as const;

export type MissedShiftBookingView = BookingRow & {
  parent_reason?: MissedShiftReasonCode | null;
  parent_submitted_at?: string | null;
  sitter_reason?: MissedShiftReasonCode | null;
  sitter_submitted_at?: string | null;
};

export type ReconcileUnstartedPastResult = {
  ok: boolean;
  reconciled_count: number;
  booking_ids: string[];
  error?: string;
};

export type SubmitMissedShiftReasonResult =
  | {
      ok: true;
      booking_id: string;
      status: string;
      role: "parent" | "sitter";
      parent_reason: MissedShiftReasonCode | null;
      sitter_reason: MissedShiftReasonCode | null;
    }
  | { ok: false; error: string };

function asIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((id) => String(id ?? "").trim()).filter(Boolean);
}

export async function reconcileUnstartedPastBookings(
  supabase: SupabaseClient
): Promise<ReconcileUnstartedPastResult> {
  const { data, error } = await supabase.rpc(RECONCILE_UNSTARTED_PAST_BOOKINGS_RPC);
  if (error) {
    return {
      ok: false,
      reconciled_count: 0,
      booking_ids: [],
      error: readSupabaseErrorMessage(error) || error.message
    };
  }

  const row = (data ?? {}) as {
    ok?: boolean;
    reconciled_count?: number;
    booking_ids?: unknown;
  };

  return {
    ok: row.ok !== false,
    reconciled_count: Number(row.reconciled_count ?? 0) || 0,
    booking_ids: asIdList(row.booking_ids)
  };
}

export async function submitMissedShiftReason(
  supabase: SupabaseClient,
  bookingId: string,
  reasonCode: MissedShiftReasonCode
): Promise<SubmitMissedShiftReasonResult> {
  const id = String(bookingId ?? "").trim();
  if (!id) return { ok: false, error: "חסר מזהה הזמנה." };
  if (!isMissedShiftReasonCode(reasonCode)) {
    return { ok: false, error: "סיבה לא חוקית." };
  }

  const { data, error } = await supabase.rpc(SUBMIT_MISSED_SHIFT_REASON_RPC, {
    p_booking_id: id,
    p_reason_code: reasonCode
  });

  if (error) {
    return { ok: false, error: mapSubmitMissedShiftError(error.message) };
  }

  const row = (data ?? {}) as {
    ok?: boolean;
    booking_id?: string;
    status?: string;
    role?: "parent" | "sitter";
    parent_reason?: string | null;
    sitter_reason?: string | null;
    error?: string;
  };

  if (row.ok === false) {
    return { ok: false, error: mapSubmitMissedShiftError(row.error) };
  }

  return {
    ok: true,
    booking_id: String(row.booking_id ?? id),
    status: String(row.status ?? MISSED_SHIFT_AWAITING_REASON_STATUS),
    role: row.role === "sitter" ? "sitter" : "parent",
    parent_reason: isMissedShiftReasonCode(row.parent_reason) ? row.parent_reason : null,
    sitter_reason: isMissedShiftReasonCode(row.sitter_reason) ? row.sitter_reason : null
  };
}

export function mapSubmitMissedShiftError(message: string | null | undefined): string {
  const msg = String(message ?? "").toLowerCase();
  if (msg.includes("not authenticated")) return "יש להתחבר כדי לדווח.";
  if (msg.includes("not authorized") || msg.includes("42501")) {
    return "אין הרשאה לדווח על משמרת זו.";
  }
  if (msg.includes("already submitted")) return "כבר נשלח דיווח מצדך למשמרת זו.";
  if (msg.includes("not awaiting") || msg.includes("invalid status")) {
    return "המשמרת אינה ממתינה לדיווח.";
  }
  if (msg.includes("invalid reason")) return "סיבה לא חוקית.";
  if (msg.includes("booking not found")) return "ההזמנה לא נמצאה.";
  return "לא ניתן לשמור את הדיווח. נסו שוב.";
}

export async function fetchMissedShiftReportsForBooking(
  supabase: SupabaseClient,
  bookingId: string
): Promise<MissedShiftReportRow[]> {
  const { data, error } = await supabase
    .from(MISSED_SHIFT_REPORTS_TABLE)
    .select("booking_id, role, reason_code, submitted_by, submitted_at")
    .eq("booking_id", bookingId);

  if (error || !data) return [];
  return (data as MissedShiftReportRow[]).filter((row) => isMissedShiftReasonCode(row.reason_code));
}

function attachReports(
  booking: BookingRow,
  reports: MissedShiftReportRow[]
): MissedShiftBookingView {
  const parent = reports.find((row) => row.role === "parent");
  const sitter = reports.find((row) => row.role === "sitter");
  return {
    ...booking,
    status: normalizeBookingStatus(booking.status) ?? booking.status,
    parent_reason: parent?.reason_code ?? null,
    parent_submitted_at: parent?.submitted_at ?? null,
    sitter_reason: sitter?.reason_code ?? null,
    sitter_submitted_at: sitter?.submitted_at ?? null
  };
}

export async function fetchMissedShiftLifecycleBookings(
  supabase: SupabaseClient,
  userId: string,
  role: "parent" | "sitter"
): Promise<MissedShiftBookingView[]> {
  const column = role === "parent" ? "parent_id" : "sitter_id";
  const { data, error } = await supabase
    .from(BOOKINGS_TABLE)
    .select(MISSED_SHIFT_BOOKING_SELECT)
    .eq(column, userId)
    .in("status", [...MISSED_SHIFT_LIFECYCLE_STATUSES])
    .order("end_time", { ascending: false })
    .limit(12);

  if (error || !data?.length) return [];

  const rows = data as BookingRow[];
  const ids = rows.map((row) => row.id);
  const { data: reports } = await supabase
    .from(MISSED_SHIFT_REPORTS_TABLE)
    .select("booking_id, role, reason_code, submitted_by, submitted_at")
    .in("booking_id", ids);

  const byBooking = new Map<string, MissedShiftReportRow[]>();
  for (const report of (reports as MissedShiftReportRow[] | null) ?? []) {
    if (!isMissedShiftReasonCode(report.reason_code)) continue;
    const list = byBooking.get(report.booking_id) ?? [];
    list.push(report);
    byBooking.set(report.booking_id, list);
  }

  return rows.map((row) => attachReports(row, byBooking.get(row.id) ?? []));
}

export function pickActionableMissedShiftBooking(
  rows: MissedShiftBookingView[],
  role: "parent" | "sitter",
  dismissedIds?: ReadonlySet<string>
): MissedShiftBookingView | null {
  return (
    rows.find(
      (row) =>
        missedShiftRequiresViewerAction(row, role) &&
        !dismissedIds?.has(String(row.id ?? "").trim())
    ) ?? null
  );
}
