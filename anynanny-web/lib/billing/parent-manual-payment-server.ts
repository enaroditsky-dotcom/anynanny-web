import "server-only";

import {
  parentMayReadManualPaymentDestinations,
  type ManualPaymentDestinations
} from "@/lib/billing/manual-payment-ui";
import { parseManualPaymentMethod, type ManualPaymentMethod } from "@/lib/billing/manual-payment-lifecycle";
import { RATINGS_TABLE } from "@/lib/ratings/constants";
import { SITTER_PROFILES_TABLE, SITTER_PROFILES_USER_COLUMN } from "@/lib/sitter/sitter-profile";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/admin";
import {
  formatIsraeliMobileDisplay,
  isValidIsraeliMobile
} from "@/lib/wallet/sitter-payout-methods";
import type { SupabaseClient } from "@supabase/supabase-js";

export function tryGetSupabaseServiceRoleClient(): SupabaseClient | null {
  try {
    return getSupabaseServiceRoleClient();
  } catch {
    return null;
  }
}

export async function parentHasRatedOwnedBooking(
  supabase: SupabaseClient,
  input: { bookingId: string; parentId: string; sitterId: string }
): Promise<boolean> {
  const bookingId = input.bookingId.trim();
  const parentId = input.parentId.trim();
  const sitterId = input.sitterId.trim();
  if (!bookingId || !parentId || !sitterId) return false;

  const sessions = await supabase
    .from("sessions")
    .select("id")
    .eq("booking_id", bookingId)
    .eq("parent_id", parentId);

  if (sessions.error) {
    console.warn("[parentHasRatedOwnedBooking] sessions", sessions.error.message);
    return false;
  }

  const sessionIds = (sessions.data ?? [])
    .map((row) => String((row as { id?: string }).id ?? "").trim())
    .filter(Boolean);
  if (sessionIds.length === 0) return false;

  const ratings = await supabase
    .from(RATINGS_TABLE)
    .select("id")
    .eq("from_user_id", parentId)
    .eq("to_user_id", sitterId)
    .in("session_id", sessionIds)
    .limit(1)
    .maybeSingle();

  if (ratings.error) {
    console.warn("[parentHasRatedOwnedBooking] ratings", ratings.error.message);
    return false;
  }

  return Boolean(ratings.data?.id);
}

export async function loadAuthorizedManualPaymentDestinations(
  supabase: SupabaseClient,
  input: {
    actorId: string;
    bookingId: string;
  }
): Promise<
  | { ok: true; destinations: ManualPaymentDestinations }
  | { ok: false; status: number; error: string; reason: string }
> {
  const bookingId = String(input.bookingId ?? "").trim();
  const actorId = String(input.actorId ?? "").trim();
  if (!bookingId || !actorId) {
    return { ok: false, status: 400, error: "חסר מזהה הזמנה.", reason: "missing_booking" };
  }

  const booking = await supabase
    .from("bookings")
    .select("id, parent_id, sitter_id, status, payment_status")
    .eq("id", bookingId)
    .eq("parent_id", actorId)
    .maybeSingle();

  if (booking.error) {
    return { ok: false, status: 400, error: booking.error.message, reason: "booking_query" };
  }
  if (!booking.data) {
    return { ok: false, status: 404, error: "ההזמנה לא נמצאה.", reason: "not_owner" };
  }

  const row = booking.data as {
    id: string;
    parent_id: string;
    sitter_id: string;
    status: string | null;
    payment_status: string | null;
  };
  const sitterId = String(row.sitter_id ?? "").trim();
  const hasParentRating = await parentHasRatedOwnedBooking(supabase, {
    bookingId: String(row.id),
    parentId: actorId,
    sitterId
  });

  const gate = parentMayReadManualPaymentDestinations({
    actorId,
    bookingParentId: String(row.parent_id ?? ""),
    bookingStatus: row.status,
    paymentStatus: row.payment_status,
    hasParentRating
  });
  if (!gate.ok) {
    const status = gate.reason === "not_owner" ? 404 : 403;
    const error =
      gate.reason === "parent_rating_required"
        ? "יש לדרג את הבייביסיטר לפני התשלום."
        : gate.reason === "shift_not_completed"
          ? "המשמרת טרם הסתיימה."
          : "אין הרשאה לצפות בפרטי התשלום.";
    return { ok: false, status, error, reason: gate.reason };
  }

  const cashOnly: ManualPaymentDestinations = {
    bookingId: String(row.id),
    cash: { available: true },
    bit: { available: false },
    paybox: { available: false }
  };

  const admin = tryGetSupabaseServiceRoleClient();
  if (!admin) {
    console.warn(
      "[loadAuthorizedManualPaymentDestinations] SUPABASE_SERVICE_ROLE_KEY missing; Bit/PayBox hidden"
    );
    return { ok: true, destinations: cashOnly };
  }

  const payout = await admin
    .from(SITTER_PROFILES_TABLE)
    .select("payout_bit_phone, payout_paybox_phone")
    .eq(SITTER_PROFILES_USER_COLUMN, sitterId)
    .maybeSingle();

  if (payout.error) {
    console.warn("[loadAuthorizedManualPaymentDestinations] payout", payout.error.message);
    return { ok: true, destinations: cashOnly };
  }

  const bitPhone = String(
    (payout.data as { payout_bit_phone?: string | null } | null)?.payout_bit_phone ?? ""
  ).trim();
  const payboxPhone = String(
    (payout.data as { payout_paybox_phone?: string | null } | null)?.payout_paybox_phone ?? ""
  ).trim();

  return {
    ok: true,
    destinations: {
      bookingId: String(row.id),
      cash: { available: true },
      bit: isValidIsraeliMobile(bitPhone)
        ? { available: true, destination: formatIsraeliMobileDisplay(bitPhone) }
        : { available: false },
      paybox: isValidIsraeliMobile(payboxPhone)
        ? { available: true, destination: formatIsraeliMobileDisplay(payboxPhone) }
        : { available: false }
    }
  };
}

export function methodHasAuthorizedDestination(
  method: ManualPaymentMethod,
  destinations: ManualPaymentDestinations
): boolean {
  if (method === "cash") return true;
  if (method === "bit") return destinations.bit.available === true;
  return destinations.paybox.available === true;
}

export function parseReportManualPaymentMethod(value: unknown): ManualPaymentMethod | null {
  return parseManualPaymentMethod(value);
}

export function hebrewReportManualPaymentError(message: string): string {
  const raw = String(message ?? "").toLowerCase();
  if (raw.includes("parent rating required")) {
    return "יש לדרג את הבייביסיטר לפני התשלום.";
  }
  if (raw.includes("shift is not completed")) {
    return "המשמרת טרם הסתיימה.";
  }
  if (raw.includes("invalid payment method")) {
    return "אמצעי תשלום לא תקין.";
  }
  if (raw.includes("invalid payment transition")) {
    return "לא ניתן לדווח על תשלום במצב הנוכחי.";
  }
  if (raw.includes("not authorized") || raw.includes("booking not found")) {
    return "אין הרשאה לדווח על תשלום עבור הזמנה זו.";
  }
  return "לא ניתן לדווח שהתשלום בוצע. נסו שוב.";
}
