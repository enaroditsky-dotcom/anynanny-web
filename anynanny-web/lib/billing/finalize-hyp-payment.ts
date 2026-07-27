import { BOOKINGS_TABLE } from "@/lib/bookings/constants";
import { SESSIONS_TABLE } from "@/lib/billing/session-types";
import { isPostgrestMissingColumnError } from "@/lib/supabase/postgrest-schema";
import type { SupabaseClient } from "@supabase/supabase-js";

export type FinalizeHypPaymentInput = {
  bookingId: string;
  sessionId?: string | null;
  parentId: string;
  hypApprovalId?: string | null;
  amountPaid?: string | null;
};

export type FinalizeHypPaymentResult =
  | { ok: true; bookingId: string; sessionIds: string[] }
  | { ok: false; error: string };

/**
 * Mark booking + session paid after a successful Hyp sandbox/production response.
 * Session status `paid` is what unlocks the sitter dashboard after `payment_pending`.
 */
export async function finalizeHypPaymentSuccess(
  supabase: SupabaseClient,
  input: FinalizeHypPaymentInput
): Promise<FinalizeHypPaymentResult> {
  const bookingId = input.bookingId.trim();
  const parentId = input.parentId.trim();
  if (!bookingId || !parentId) {
    return { ok: false, error: "Missing booking or parent id." };
  }

  const paidAt = new Date().toISOString();

  // Keep select minimal — payment_* columns are optional on some projects.
  const { data: booking, error: bookingReadErr } = await supabase
    .from(BOOKINGS_TABLE)
    .select("id, parent_id, sitter_id, status")
    .eq("id", bookingId)
    .maybeSingle();

  if (bookingReadErr || !booking) {
    return { ok: false, error: "Booking not found." };
  }

  if (String(booking.parent_id) !== parentId) {
    return { ok: false, error: "Forbidden." };
  }

  // Best-effort booking paid markers (session `paid` is what drives sitter UI).
  {
    const paymentPatch: Record<string, unknown> = {
      payment_status: "paid",
      paid_at: paidAt
    };

    let { error: bookingErr } = await supabase
      .from(BOOKINGS_TABLE)
      .update(paymentPatch)
      .eq("id", bookingId)
      .eq("parent_id", parentId);

    if (bookingErr) {
      const msg = bookingErr.message ?? "";
      if (
        isPostgrestMissingColumnError(msg, "payment_status") ||
        isPostgrestMissingColumnError(msg, "paid_at")
      ) {
        const minimal: Record<string, unknown> = {};
        if (!isPostgrestMissingColumnError(msg, "payment_status")) {
          minimal.payment_status = "paid";
        }
        if (!isPostgrestMissingColumnError(msg, "paid_at")) {
          minimal.paid_at = paidAt;
        }
        if (Object.keys(minimal).length > 0) {
          const retry = await supabase
            .from(BOOKINGS_TABLE)
            .update(minimal)
            .eq("id", bookingId)
            .eq("parent_id", parentId);
          bookingErr = retry.error;
        } else {
          bookingErr = null;
        }
      }
    }

    if (bookingErr) {
      console.warn(
        "[finalizeHypPaymentSuccess] booking payment update skipped:",
        bookingErr.message
      );
    }
  }

  const sitterId =
    booking.sitter_id != null && String(booking.sitter_id).trim() !== ""
      ? String(booking.sitter_id).trim()
      : null;

  const paidSessionIds = new Set<string>();
  const sessionId = input.sessionId?.trim() || null;

  async function markSessionPaid(id: string): Promise<string | null> {
    const { data, error } = await supabase
      .from(SESSIONS_TABLE)
      .update({ status: "paid" })
      .eq("id", id)
      .eq("parent_id", parentId)
      .in("status", ["payment_pending", "paid", "sitter_completed", "completed"])
      .select("id")
      .maybeSingle();

    if (error) {
      console.warn("[finalizeHypPaymentSuccess] session update:", error.message, { id });
      return null;
    }
    return data?.id ? String(data.id) : id;
  }

  if (sessionId) {
    const updated = await markSessionPaid(sessionId);
    if (updated) paidSessionIds.add(updated);
  }

  // Always also clear payment_pending for this parent↔sitter pair so the sitter UI unlocks
  // even when Hyp return omitted shiftSessionId (common when SuccessUrl is terminal-configured).
  let pendingQuery = supabase
    .from(SESSIONS_TABLE)
    .select("id")
    .eq("parent_id", parentId)
    .eq("status", "payment_pending")
    .order("created_at", { ascending: false })
    .limit(5);

  if (sitterId) {
    pendingQuery = pendingQuery.eq("sitter_id", sitterId);
  }

  const { data: pendingRows, error: pendingErr } = await pendingQuery;
  if (pendingErr) {
    console.warn("[finalizeHypPaymentSuccess] pending session lookup:", pendingErr.message);
  } else {
    for (const row of pendingRows ?? []) {
      if (!row?.id) continue;
      const updated = await markSessionPaid(String(row.id));
      if (updated) paidSessionIds.add(updated);
    }
  }

  if (paidSessionIds.size === 0 && sessionId) {
    // Last resort: force status even if prior filter excluded the row.
    const { error: forceErr } = await supabase
      .from(SESSIONS_TABLE)
      .update({ status: "paid" })
      .eq("id", sessionId)
      .eq("parent_id", parentId);
    if (forceErr) {
      return {
        ok: false,
        error: `Booking marked paid but session update failed: ${forceErr.message}`
      };
    }
    paidSessionIds.add(sessionId);
  }

  if (paidSessionIds.size === 0) {
    console.warn("[finalizeHypPaymentSuccess] no payment_pending session found", {
      bookingId,
      parentId,
      sitterId,
      sessionId
    });
  }

  console.info("[finalizeHypPaymentSuccess] ok", {
    bookingId,
    parentId,
    sessionIds: [...paidSessionIds],
    hypApprovalId: input.hypApprovalId ?? null
  });

  // Wallet credit is primarily handled by DB triggers on sessions/bookings.
  // Best-effort explicit credit when the RPC exists (service role / elevated clients).
  try {
    const { creditSitterWalletForBooking, creditSitterWalletForSession } = await import(
      "@/lib/wallet/sitter-wallet"
    );
    await creditSitterWalletForBooking(supabase, bookingId);
    for (const sid of paidSessionIds) {
      await creditSitterWalletForSession(supabase, sid);
    }
  } catch (err) {
    console.warn("[finalizeHypPaymentSuccess] sitter wallet credit skipped:", err);
  }

  return { ok: true, bookingId, sessionIds: [...paidSessionIds] };
}
