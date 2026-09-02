import { BOOKINGS_TABLE, type BookingPaymentStatus, type BookingStatus } from "@/lib/bookings/constants";
import { normalizeBookingStatus } from "@/lib/bookings/booking-status-normalize";
import { coerceBookingPaymentStatus } from "@/lib/bookings/payment-status-label";
import { parseManualPaymentMethod, type ManualPaymentMethod } from "@/lib/billing/manual-payment-lifecycle";
import { SITTER_MANUAL_ACTIONABLE_STATUSES } from "@/lib/billing/manual-payment-ui";
import { isPostgrestMissingColumnError } from "@/lib/supabase/postgrest-schema";
import type { SupabaseClient } from "@supabase/supabase-js";

export type SitterActionableManualPayment = {
  bookingId: string;
  parentId: string;
  sitterId: string;
  bookingStatus: BookingStatus | null;
  paymentStatus: BookingPaymentStatus;
  paymentMethod: ManualPaymentMethod | null;
  chargedAmountNis: number | null;
};

function bookingStatusFromQuery(value: unknown): BookingStatus | null {
  if (typeof value === "string") {
    return normalizeBookingStatus({ name: value }) ?? null;
  }
  if (value != null && typeof value === "object") {
    const name = Reflect.get(value, "name");
    if (typeof name === "string") {
      return normalizeBookingStatus({ name }) ?? null;
    }
  }
  return null;
}

function mapRow(row: Record<string, unknown>): SitterActionableManualPayment | null {
  const bookingId = String(row.id ?? "").trim();
  const parentId = String(row.parent_id ?? "").trim();
  const sitterId = String(row.sitter_id ?? "").trim();
  const paymentStatus = coerceBookingPaymentStatus(row.payment_status);
  if (!bookingId || !parentId || !sitterId || !paymentStatus) return null;
  if (!(SITTER_MANUAL_ACTIONABLE_STATUSES as readonly string[]).includes(paymentStatus)) {
    return null;
  }
  const charged = row.charged_amount_nis;
  return {
    bookingId,
    parentId,
    sitterId,
    bookingStatus: bookingStatusFromQuery(row.status),
    paymentStatus,
    paymentMethod: parseManualPaymentMethod(row.payment_method),
    chargedAmountNis:
      charged != null && Number.isFinite(Number(charged)) ? Number(charged) : null
  };
}

/** Latest sitter-owned booking that still needs confirm, rating, or dispute display. */
export async function fetchSitterActionableManualPayment(
  supabase: SupabaseClient,
  sitterId: string
): Promise<SitterActionableManualPayment | null> {
  const uid = String(sitterId ?? "").trim();
  if (!uid) return null;

  const full = await supabase
    .from(BOOKINGS_TABLE)
    .select("id, parent_id, sitter_id, status, payment_status, payment_method, charged_amount_nis")
    .eq("sitter_id", uid)
    .in("payment_status", [...SITTER_MANUAL_ACTIONABLE_STATUSES])
    .order("updated_at", { ascending: false })
    .limit(5);

  if (full.error) {
    const msg = String(full.error.message ?? "");
    if (
      isPostgrestMissingColumnError(msg, "payment_method") ||
      isPostgrestMissingColumnError(msg, "charged_amount_nis")
    ) {
      const core = await supabase
        .from(BOOKINGS_TABLE)
        .select("id, parent_id, sitter_id, status, payment_status")
        .eq("sitter_id", uid)
        .in("payment_status", [...SITTER_MANUAL_ACTIONABLE_STATUSES])
        .order("updated_at", { ascending: false })
        .limit(5);
      if (core.error || !core.data?.length) return null;
      return mapRow(core.data[0] as Record<string, unknown>);
    }
    console.warn("[fetchSitterActionableManualPayment]", full.error.message);
    return null;
  }

  const rows = (full.data ?? []) as Record<string, unknown>[];
  for (const row of rows) {
    const mapped = mapRow(row);
    if (mapped) return mapped;
  }
  return null;
}
