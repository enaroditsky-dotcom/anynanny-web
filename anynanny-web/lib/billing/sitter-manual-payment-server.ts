import "server-only";

import { coerceBookingPaymentStatus } from "@/lib/bookings/payment-status-label";
import { tryGetSupabaseServiceRoleClient } from "@/lib/billing/parent-manual-payment-server";
import {
  notifyParentManualPaymentConfirmed,
  notifyParentManualPaymentDenied
} from "@/lib/notifications/create-notification";
import type { SupabaseClient } from "@supabase/supabase-js";

export type SitterManualPaymentAction = "confirm" | "deny";

export type SitterManualPaymentActionResult =
  | {
      ok: true;
      noop: boolean;
      bookingId: string;
      paymentStatus: string;
    }
  | {
      ok: false;
      status: number;
      error: string;
    };

function hebrewSitterManualPaymentError(message: string, action: SitterManualPaymentAction): string {
  const raw = String(message ?? "").toLowerCase();
  if (raw.includes("not authorized") || raw.includes("booking not found")) {
    return "אין הרשאה לעדכן תשלום עבור הזמנה זו.";
  }
  if (raw.includes("invalid payment transition")) {
    return action === "confirm"
      ? "לא ניתן לאשר את התשלום במצב הנוכחי."
      : "לא ניתן לדחות את התשלום במצב הנוכחי.";
  }
  return "לא ניתן לעדכן את סטטוס התשלום. נסו שוב.";
}

async function readOwnedBookingPayment(
  supabase: SupabaseClient,
  bookingId: string,
  sitterId: string
): Promise<{ parentId: string; paymentStatus: string | null } | null> {
  const { data, error } = await supabase
    .from("bookings")
    .select("id, parent_id, sitter_id, payment_status")
    .eq("id", bookingId)
    .eq("sitter_id", sitterId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    parentId: String((data as { parent_id?: string | null }).parent_id ?? "").trim(),
    paymentStatus: coerceBookingPaymentStatus(
      (data as { payment_status?: string | null }).payment_status
    )
  };
}

export async function runSitterManualPaymentAction(
  supabase: SupabaseClient,
  input: {
    sitterId: string;
    bookingId: string;
    action: SitterManualPaymentAction;
  }
): Promise<SitterManualPaymentActionResult> {
  const bookingId = String(input.bookingId ?? "").trim();
  const sitterId = String(input.sitterId ?? "").trim();
  if (!bookingId || !sitterId) {
    return { ok: false, status: 400, error: "חסר מזהה הזמנה." };
  }

  const owned = await readOwnedBookingPayment(supabase, bookingId, sitterId);
  if (!owned) {
    return { ok: false, status: 403, error: "אין הרשאה לעדכן תשלום עבור הזמנה זו." };
  }

  const rpcName =
    input.action === "confirm"
      ? "confirm_manual_payment_received"
      : "deny_manual_payment_received";
  const expected =
    input.action === "confirm" ? "awaiting_sitter_rating" : "payment_dispute";

  const rpc = await supabase.rpc(rpcName, { p_booking_id: bookingId });
  if (rpc.error) {
    const latest = await readOwnedBookingPayment(supabase, bookingId, sitterId);
    const current = coerceBookingPaymentStatus(latest?.paymentStatus);
    if (input.action === "confirm" && (current === "awaiting_sitter_rating" || current === "paid")) {
      return {
        ok: true,
        noop: true,
        bookingId,
        paymentStatus: current
      };
    }
    if (input.action === "deny" && current === "payment_dispute") {
      return {
        ok: true,
        noop: true,
        bookingId,
        paymentStatus: current
      };
    }
    return {
      ok: false,
      status: 400,
      error: hebrewSitterManualPaymentError(rpc.error.message, input.action)
    };
  }

  const payload = (rpc.data ?? {}) as {
    ok?: boolean;
    noop?: boolean;
    payment_status?: string;
  };
  const paymentStatus = coerceBookingPaymentStatus(payload.payment_status) ?? expected;
  const noop = payload.noop === true;

  if (!noop && owned.parentId) {
    const admin = tryGetSupabaseServiceRoleClient();
    if (admin) {
      if (input.action === "confirm") {
        await notifyParentManualPaymentConfirmed(admin, {
          parentId: owned.parentId,
          bookingId
        });
      } else {
        await notifyParentManualPaymentDenied(admin, {
          parentId: owned.parentId,
          bookingId
        });
      }
    }
  }

  return {
    ok: true,
    noop,
    bookingId,
    paymentStatus
  };
}
