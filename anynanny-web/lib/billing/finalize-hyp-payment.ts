import { BOOKINGS_TABLE } from "@/lib/bookings/constants";
import { SESSIONS_TABLE } from "@/lib/billing/session-types";
import { computeAuthoritativeShiftCharge } from "@/lib/billing/compute-shift-charge";
import { decideHypFinalizeAction, hypAmountToMinorUnits } from "@/lib/billing/hyp/payment-authority";
import {
  isPostgrestMissingColumnError,
  isSupabaseRpcUnavailableError
} from "@/lib/supabase/postgrest-schema";
import type { SupabaseClient } from "@supabase/supabase-js";

export type FinalizeHypPaymentInput = {
  bookingId: string;
  sessionId?: string | null;
  parentId: string;
  hypTransId: string;
  verifiedAmountNis: number;
};

export type FinalizeHypPaymentResult =
  | { ok: true; bookingId: string; sessionIds: string[]; noop: boolean }
  | { ok: false; error: string; status?: number };

type BookingPaymentRow = {
  id: string;
  parent_id: string;
  sitter_id?: string | null;
  payment_status?: string | null;
  paid_at?: string | null;
  hyp_trans_id?: string | null;
  charged_amount_nis?: number | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function parseRpcResult(data: unknown): { noop: boolean; sessionIds: string[] } | null {
  const record = asRecord(data);
  if (!record || record.ok !== true) return null;
  const sessionIds = Array.isArray(record.session_ids)
    ? record.session_ids.map((id) => String(id)).filter(Boolean)
    : [];
  return { noop: record.noop === true, sessionIds };
}

async function publishParentRatingsOnce(
  supabase: SupabaseClient,
  parentId: string,
  sessionIds: string[]
): Promise<void> {
  if (sessionIds.length === 0) return;
  try {
    const { error: publishRpcErr } = await supabase.rpc("publish_parent_ratings_for_paid_sessions", {
      p_session_ids: sessionIds
    });
    if (publishRpcErr) {
      const { error: publishErr } = await supabase
        .from("ratings")
        .update({ published_at: new Date().toISOString() })
        .in("session_id", sessionIds)
        .eq("from_user_id", parentId)
        .is("published_at", null);
      if (publishErr) {
        console.warn(
          "[finalizeHypPaymentSuccess] parent rating publish skipped:",
          publishRpcErr.message,
          publishErr.message
        );
      }
    }
  } catch (err) {
    console.warn("[finalizeHypPaymentSuccess] parent rating publish skipped:", err);
  }
}

async function notifySitterOnce(
  supabase: SupabaseClient,
  input: {
    sitterId: string;
    bookingId: string;
    amountPaid: string;
    hypTransId: string;
    sessionIds: string[];
  }
): Promise<void> {
  try {
    const { notifySitterPaymentReceived } = await import("@/lib/notifications/create-notification");
    await notifySitterPaymentReceived(supabase, {
      sitterId: input.sitterId,
      bookingId: input.bookingId,
      amountPaid: input.amountPaid,
      hypApprovalId: input.hypTransId,
      sessionIds: input.sessionIds
    });
  } catch (err) {
    console.warn("[finalizeHypPaymentSuccess] sitter notification skipped:", err);
  }
}

async function creditSitterOnce(
  supabase: SupabaseClient,
  bookingId: string,
  sessionIds: string[],
  sitterId: string | null
): Promise<void> {
  try {
    const { creditSitterWalletForBooking, creditSitterWalletForSession } = await import(
      "@/lib/wallet/sitter-wallet"
    );
    await creditSitterWalletForBooking(supabase, bookingId);
    for (const sid of sessionIds) {
      await creditSitterWalletForSession(supabase, sid);
    }
  } catch (err) {
    console.warn("[finalizeHypPaymentSuccess] sitter wallet credit skipped:", err);
  }

  if (!sitterId) return;
  try {
    const { SITTER_TRANSACTIONS_TABLE } = await import("@/lib/wallet/sitter-wallet");
    const { error: txErr } = await supabase
      .from(SITTER_TRANSACTIONS_TABLE)
      .update({ status: "succeeded" })
      .eq("sitter_id", sitterId)
      .eq("booking_id", bookingId)
      .eq("status", "pending");
    if (txErr) {
      console.warn("[finalizeHypPaymentSuccess] pending tx promote skipped:", txErr.message);
    }
  } catch (err) {
    console.warn("[finalizeHypPaymentSuccess] pending tx promote skipped:", err);
  }
}

async function finalizeViaTsFallback(
  supabase: SupabaseClient,
  input: {
    bookingId: string;
    sessionId: string | null;
    parentId: string;
    hypTransId: string;
    verifiedAmountNis: number;
    expectedMinorUnits: number;
  }
): Promise<FinalizeHypPaymentResult> {
  const { bookingId, parentId, hypTransId, verifiedAmountNis, expectedMinorUnits } = input;

  const { data: other, error: otherErr } = await supabase
    .from(BOOKINGS_TABLE)
    .select("id")
    .eq("hyp_trans_id", hypTransId)
    .neq("id", bookingId)
    .maybeSingle();

  if (otherErr && !isPostgrestMissingColumnError(otherErr.message, "hyp_trans_id")) {
    return { ok: false, error: "Failed to check transaction uniqueness.", status: 500 };
  }

  const { data: booking, error: bookingReadErr } = await supabase
    .from(BOOKINGS_TABLE)
    .select("id, parent_id, sitter_id, payment_status, paid_at, hyp_trans_id, charged_amount_nis")
    .eq("id", bookingId)
    .maybeSingle();

  if (bookingReadErr) {
    if (
      isPostgrestMissingColumnError(bookingReadErr.message, "hyp_trans_id") ||
      isPostgrestMissingColumnError(bookingReadErr.message, "charged_amount_nis")
    ) {
      return {
        ok: false,
        error: "Payment verification columns are not applied. Apply the F2/F3 migration before taking payment.",
        status: 503
      };
    }
    return { ok: false, error: "Booking not found.", status: 404 };
  }
  if (!booking) {
    return { ok: false, error: "Booking not found.", status: 404 };
  }

  const row = booking as BookingPaymentRow;
  if (String(row.parent_id) !== parentId) {
    return { ok: false, error: "Forbidden.", status: 403 };
  }

  const incomingMinor = hypAmountToMinorUnits(String(verifiedAmountNis));
  if (incomingMinor == null) {
    return { ok: false, error: "Invalid verified amount.", status: 400 };
  }

  const decision = decideHypFinalizeAction({
    bookingPaid: row.payment_status === "paid" || Boolean(row.paid_at),
    bookingHypTransId: row.hyp_trans_id ?? null,
    incomingHypTransId: hypTransId,
    otherBookingIdWithSameTransId: other?.id ? String(other.id) : null,
    expectedMinorUnits,
    incomingMinorUnits: incomingMinor
  });

  if (decision.action === "reject") {
    return { ok: false, error: decision.reason, status: 409 };
  }

  const sessionIds: string[] = [];
  const sessionId = input.sessionId;

  async function markThisSessionPaid(id: string): Promise<string | null> {
    const { data: session, error: sessionReadErr } = await supabase
      .from(SESSIONS_TABLE)
      .select("id, parent_id, booking_id")
      .eq("id", id)
      .maybeSingle();
    if (sessionReadErr || !session) return null;
    if (String(session.parent_id) !== parentId) return null;
    const linked =
      session.booking_id != null && String(session.booking_id).trim() !== ""
        ? String(session.booking_id).trim()
        : null;
    if (linked && linked !== bookingId) return null;

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

  if (decision.action === "noop") {
    if (sessionId) {
      const updated = await markThisSessionPaid(sessionId);
      if (updated) sessionIds.push(updated);
    }
    return { ok: true, bookingId, sessionIds, noop: true };
  }

  const paidAt = new Date().toISOString();
  const { error: bookingErr } = await supabase
    .from(BOOKINGS_TABLE)
    .update({
      payment_status: "paid",
      paid_at: paidAt,
      hyp_trans_id: hypTransId,
      charged_amount_nis: verifiedAmountNis
    })
    .eq("id", bookingId)
    .eq("parent_id", parentId);

  if (bookingErr) {
    const msg = bookingErr.message ?? "";
    if (isPostgrestMissingColumnError(msg, "hyp_trans_id") || isPostgrestMissingColumnError(msg, "charged_amount_nis")) {
      return {
        ok: false,
        error: "Payment verification columns are not applied. Apply the F2/F3 migration before taking payment.",
        status: 503
      };
    }
    if (/duplicate|unique/i.test(msg) || bookingErr.code === "23505") {
      return { ok: false, error: "hyp transaction already used for another booking", status: 409 };
    }
    return { ok: false, error: "Failed to persist verified payment.", status: 500 };
  }

  if (sessionId) {
    const updated = await markThisSessionPaid(sessionId);
    if (updated) sessionIds.push(updated);
  } else {
    const { data: byBooking } = await supabase
      .from(SESSIONS_TABLE)
      .select("id")
      .eq("parent_id", parentId)
      .eq("booking_id", bookingId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (byBooking?.id) {
      const updated = await markThisSessionPaid(String(byBooking.id));
      if (updated) sessionIds.push(updated);
    }
  }

  const sitterId =
    row.sitter_id != null && String(row.sitter_id).trim() !== "" ? String(row.sitter_id).trim() : null;

  await creditSitterOnce(supabase, bookingId, sessionIds, sitterId);
  await publishParentRatingsOnce(supabase, parentId, sessionIds);
  if (sitterId) {
    await notifySitterOnce(supabase, {
      sitterId,
      bookingId,
      amountPaid: String(verifiedAmountNis),
      hypTransId,
      sessionIds
    });
  }

  return { ok: true, bookingId, sessionIds, noop: false };
}

/**
 * Mark booking + the matching session paid after server-side Hyp proof.
 * Does not trust browser amounts. Does not fan out to other sessions.
 */
export async function finalizeHypPaymentSuccess(
  supabase: SupabaseClient,
  input: FinalizeHypPaymentInput
): Promise<FinalizeHypPaymentResult> {
  const bookingId = input.bookingId.trim();
  const parentId = input.parentId.trim();
  const hypTransId = String(input.hypTransId ?? "").trim();
  const sessionId = input.sessionId?.trim() || null;
  const verifiedAmountNis = Number(input.verifiedAmountNis);

  if (!bookingId || !parentId) {
    return { ok: false, error: "Missing booking or parent id.", status: 400 };
  }
  if (!hypTransId) {
    return { ok: false, error: "Missing Hyp transaction id.", status: 400 };
  }
  if (!Number.isFinite(verifiedAmountNis) || verifiedAmountNis < 0.5) {
    return { ok: false, error: "Invalid verified amount.", status: 400 };
  }

  const chargeResult = await computeAuthoritativeShiftCharge(supabase, parentId, {
    bookingId,
    sessionId
  });
  if (!chargeResult.ok) {
    return { ok: false, error: chargeResult.error, status: chargeResult.status };
  }

  const incomingMinor = hypAmountToMinorUnits(String(verifiedAmountNis));
  if (incomingMinor == null || incomingMinor !== chargeResult.charge.amountMinorUnits) {
    return { ok: false, error: "Verified amount does not match the authoritative shift charge.", status: 400 };
  }

  const canonicalSessionId = sessionId || chargeResult.charge.sessionId;

  const { data: rpcData, error: rpcError } = await supabase.rpc("finalize_verified_hyp_payment", {
    p_booking_id: bookingId,
    p_parent_id: parentId,
    p_session_id: canonicalSessionId,
    p_hyp_trans_id: hypTransId,
    p_charged_amount_nis: verifiedAmountNis
  });

  if (!rpcError) {
    const parsed = parseRpcResult(rpcData);
    if (!parsed) {
      return { ok: false, error: "Payment finalize RPC returned an invalid result.", status: 500 };
    }

    const { data: booking } = await supabase
      .from(BOOKINGS_TABLE)
      .select("sitter_id")
      .eq("id", bookingId)
      .maybeSingle();
    const sitterId =
      booking && typeof booking === "object" && "sitter_id" in booking && booking.sitter_id
        ? String(booking.sitter_id)
        : null;

    if (!parsed.noop) {
      await publishParentRatingsOnce(supabase, parentId, parsed.sessionIds);
      if (sitterId) {
        await notifySitterOnce(supabase, {
          sitterId,
          bookingId,
          amountPaid: String(verifiedAmountNis),
          hypTransId,
          sessionIds: parsed.sessionIds
        });
      }
    }

    return {
      ok: true,
      bookingId,
      sessionIds: parsed.sessionIds,
      noop: parsed.noop
    };
  }

  if (!isSupabaseRpcUnavailableError(rpcError)) {
    const message = rpcError.message || "Failed to finalize verified payment.";
    const status = /already paid|already used|not authorized|does not belong/i.test(message)
      ? 409
      : 400;
    return { ok: false, error: message, status };
  }

  return finalizeViaTsFallback(supabase, {
    bookingId,
    sessionId: canonicalSessionId,
    parentId,
    hypTransId,
    verifiedAmountNis,
    expectedMinorUnits: chargeResult.charge.amountMinorUnits
  });
}
