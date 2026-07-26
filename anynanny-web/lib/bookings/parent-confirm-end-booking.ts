import type { SupabaseClient } from "@supabase/supabase-js";
import { BOOKING_SELECT_MINIMAL } from "@/lib/bookings/booking-status-update";
import { BOOKINGS_TABLE, type BookingRow } from "@/lib/bookings/constants";
import { HOURLY_RATE, SESSIONS_TABLE, type SupabaseSessionRow } from "@/lib/session/protocol";
import { updateSessionReturningRow } from "@/lib/session/sessions-query";

/** Only values allowed by `bookings_status_check` — invalid enums cause PostgREST 400. */
const ENDABLE_BOOKING_STATUSES = [
  "sitter_ended",
  "parent_started",
  "sitter_started"
] as const;

export type ParentConfirmEndResult = {
  row: BookingRow | null;
  session: SupabaseSessionRow | null;
  error: string | null;
};

function computeShiftTotals(session: Pick<SupabaseSessionRow, "start_time" | "end_time" | "final_elapsed_seconds" | "final_amount_nis">) {
  if (
    typeof session.final_elapsed_seconds === "number" &&
    Number.isFinite(session.final_elapsed_seconds) &&
    session.final_elapsed_seconds >= 0
  ) {
    const elapsedSeconds = Math.floor(session.final_elapsed_seconds);
    const amountNis =
      typeof session.final_amount_nis === "number" && Number.isFinite(session.final_amount_nis)
        ? Number(session.final_amount_nis)
        : Number(((elapsedSeconds / 3600) * HOURLY_RATE).toFixed(2));
    return { elapsedSeconds, amountNis };
  }

  const startMs = session.start_time ? new Date(session.start_time).getTime() : NaN;
  const endMs = session.end_time ? new Date(session.end_time).getTime() : Date.now();
  const elapsedSeconds =
    Number.isFinite(startMs) ? Math.max(0, Math.floor((endMs - startMs) / 1000)) : 0;
  const amountNis = Number(((elapsedSeconds / 3600) * HOURLY_RATE).toFixed(2));
  return { elapsedSeconds, amountNis };
}

/**
 * Parent confirms the sitter's end-shift request.
 * Moves the session to `payment_pending` (Rating/Payment screen) — does NOT mark paid.
 */
export async function parentConfirmEndBooking(
  supabase: SupabaseClient,
  parentId: string,
  bookingId: string,
  sessionId?: string | null
): Promise<ParentConfirmEndResult> {
  const now = new Date().toISOString();
  let sessionRow: SupabaseSessionRow | null = null;

  if (sessionId) {
    const { data: existingSession } = await supabase
      .from(SESSIONS_TABLE)
      .select(
        "id, parent_id, sitter_id, status, start_time, end_time, final_elapsed_seconds, final_amount_nis, parent_end_requested_at"
      )
      .eq("id", sessionId)
      .eq("parent_id", parentId)
      .maybeSingle();

    if (existingSession) {
      sessionRow = existingSession as SupabaseSessionRow;
      const totals = computeShiftTotals(sessionRow);

      const { data: rpcData, error: rpcError } = await supabase.rpc("end_shift_atomic", {
        p_session_id: sessionId,
        p_parent_id: parentId,
        p_end_iso: now,
        p_elapsed: totals.elapsedSeconds,
        p_amount: totals.amountNis
      });

      if (!rpcError && rpcData) {
        sessionRow = rpcData as SupabaseSessionRow;
      } else {
        if (rpcError) {
          console.warn("[parentConfirmEndBooking] end_shift_atomic fallback:", rpcError.message);
        }
        const updated = await updateSessionReturningRow(
          supabase,
          String(sessionId),
          {
            status: "payment_pending",
            end_time: now,
            final_elapsed_seconds: totals.elapsedSeconds,
            final_amount_nis: totals.amountNis
          },
          { parentId }
        );
        if (updated.error || !updated.row) {
          return {
            row: null,
            session: null,
            error: updated.error ?? rpcError?.message ?? "לא ניתן לעדכן את הסשן לתשלום."
          };
        }
        sessionRow = updated.row;
      }
    }
  }

  if (!sessionRow) {
    const { data: latest } = await supabase
      .from(SESSIONS_TABLE)
      .select(
        "id, parent_id, sitter_id, status, start_time, end_time, final_elapsed_seconds, final_amount_nis, parent_end_requested_at"
      )
      .eq("parent_id", parentId)
      .in("status", ["active", "in_progress", "sitter_completed", "payment_pending"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latest) {
      sessionRow = latest as SupabaseSessionRow;
      if (normalizeStatus(sessionRow.status) !== "payment_pending") {
        const totals = computeShiftTotals(sessionRow);
        const updated = await updateSessionReturningRow(
          supabase,
          String(sessionRow.id),
          {
            status: "payment_pending",
            end_time: now,
            final_elapsed_seconds: totals.elapsedSeconds,
            final_amount_nis: totals.amountNis
          },
          { parentId }
        );
        if (updated.row) sessionRow = updated.row;
      }
    }
  }

  // Booking: mark shift closed for scheduling, but payment_status stays unpaid until checkout.
  const { data, error } = await supabase
    .from(BOOKINGS_TABLE)
    .update({ status: "completed", updated_at: now })
    .eq("id", bookingId)
    .eq("parent_id", parentId)
    .in("status", [...ENDABLE_BOOKING_STATUSES, "completed"])
    .select(BOOKING_SELECT_MINIMAL)
    .maybeSingle();

  if (error) {
    return { row: null, session: sessionRow, error: error.message };
  }

  if (!data) {
    const { data: existing } = await supabase
      .from(BOOKINGS_TABLE)
      .select(BOOKING_SELECT_MINIMAL)
      .eq("id", bookingId)
      .eq("parent_id", parentId)
      .maybeSingle();

    if (existing && String(existing.status) === "completed") {
      return { row: existing as BookingRow, session: sessionRow, error: null };
    }

    return {
      row: null,
      session: sessionRow,
      error: "לא ניתן לאשר סיום — ייתכן שהמשמרת כבר נסגרה."
    };
  }

  return { row: data as BookingRow, session: sessionRow, error: null };
}

function normalizeStatus(status: unknown): string {
  return String(status ?? "").trim().toLowerCase();
}
