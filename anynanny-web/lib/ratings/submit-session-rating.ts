import {
  sitterMayRateParent,
  SITTER_RATE_BEFORE_CONFIRMATION_MESSAGE
} from "@/lib/billing/manual-payment-lifecycle";
import { BOOKINGS_TABLE } from "@/lib/bookings/constants";
import { coerceBookingPaymentStatus } from "@/lib/bookings/payment-status-label";
import { bookingRequiresAdminReview } from "@/lib/bookings/stuck-shift-review";
import { isBookingBlockedFromMandatoryRating } from "@/lib/bookings/missed-shift-lifecycle";
import { RATINGS_TABLE } from "@/lib/ratings/constants";
import { SESSIONS_TABLE } from "@/lib/session/protocol";
import { isSupabaseRpcUnavailableError } from "@/lib/supabase/postgrest-schema";
import type { SupabaseClient } from "@supabase/supabase-js";

function isPlausibleUuidSessionId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim());
}

export type SubmitSessionRatingResult =
  | { ok: true }
  | { ok: false; error: string };

type SessionRatingRow = {
  id?: string;
  parent_id?: string | null;
  sitter_id?: string | null;
  status?: string | null;
  booking_id?: string | null;
};

async function markManualPaymentPaidIfReady(
  supabase: SupabaseClient,
  bookingId: string
): Promise<void> {
  const { error } = await supabase.rpc("mark_manual_payment_paid_after_sitter_rating", {
    p_booking_id: bookingId
  });
  if (error && !isSupabaseRpcUnavailableError(error)) {
    console.warn("[submitSessionRating] mark paid skipped:", error.message);
  }
}

/** Persist a 1–5 star rating (+ optional comment) for a completed session. */
export async function submitSessionRating(
  supabase: SupabaseClient,
  params: {
    sessionId: string;
    role: "parent" | "sitter";
    rating: number;
    comment?: string | null;
  }
): Promise<SubmitSessionRatingResult> {
  const sid = params.sessionId.trim();
  const stars = params.rating;
  const commentTrimmed = params.comment?.trim() ? params.comment.trim().slice(0, 2000) : null;

  if (!isPlausibleUuidSessionId(sid)) {
    return { ok: false, error: "מזהה סשן לא תקין." };
  }
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
    return { ok: false, error: "יש לבחור דירוג בין 1 ל-5 כוכבים." };
  }

  const {
    data: { user },
    error: userErr
  } = await supabase.auth.getUser();
  if (userErr || !user) {
    return { ok: false, error: "יש להתחבר כדי לשלוח דירוג." };
  }

  let sessionRow: SessionRatingRow | null = null;

  const withBooking = await supabase
    .from(SESSIONS_TABLE)
    .select("id, parent_id, sitter_id, status, booking_id")
    .eq("id", sid)
    .maybeSingle();

  if (withBooking.error && /booking_id|schema cache|column/i.test(String(withBooking.error.message ?? ""))) {
    const core = await supabase
      .from(SESSIONS_TABLE)
      .select("id, parent_id, sitter_id, status")
      .eq("id", sid)
      .maybeSingle();
    if (core.error || !core.data) {
      return { ok: false, error: "לא נמצא סשן לדירוג." };
    }
    sessionRow = core.data as SessionRatingRow;
  } else if (withBooking.error || !withBooking.data) {
    return { ok: false, error: "לא נמצא סשן לדירוג." };
  } else {
    sessionRow = withBooking.data as SessionRatingRow;
  }

  const linkedBookingId =
    sessionRow?.booking_id != null ? String(sessionRow.booking_id).trim() : "";
  let linkedPaymentStatus: string | null = null;
  if (linkedBookingId) {
    let linkedQuery = await supabase
      .from(BOOKINGS_TABLE)
      .select("requires_admin_review, status, payment_status")
      .eq("id", linkedBookingId)
      .maybeSingle();
    if (linkedQuery.error && /payment_status|schema cache|column/i.test(String(linkedQuery.error.message ?? ""))) {
      linkedQuery = await supabase
        .from(BOOKINGS_TABLE)
        .select("requires_admin_review, status")
        .eq("id", linkedBookingId)
        .maybeSingle();
    }
    const linked = linkedQuery.data as {
      requires_admin_review?: boolean | null;
      status?: string | null;
      payment_status?: string | null;
    } | null;
    if (bookingRequiresAdminReview(linked)) {
      return { ok: false, error: "לא ניתן לדרג משמרת שנמצאת בבדיקה." };
    }
    if (isBookingBlockedFromMandatoryRating(linked?.status)) {
      return { ok: false, error: "לא ניתן לדרג משמרת שלא התקיימה כמשמרת שהושלמה." };
    }
    linkedPaymentStatus = coerceBookingPaymentStatus(linked?.payment_status);
  }

  if (!sessionRow) {
    return { ok: false, error: "לא נמצא סשן לדירוג." };
  }

  const parentId = sessionRow.parent_id != null ? String(sessionRow.parent_id) : null;
  const sitterId = sessionRow.sitter_id != null ? String(sessionRow.sitter_id) : null;
  const uid = user.id;
  const isParent = parentId === uid;
  const isSitter = sitterId === uid;
  const status = String(sessionRow.status ?? "");

  if (!isParent && !isSitter) {
    return { ok: false, error: "אין הרשאה לדרג משמרת זו." };
  }

  if (params.role === "parent") {
    if (!isParent) {
      return { ok: false, error: "אין הרשאה לדרג משמרת זו." };
    }
    const parentRatable = new Set(["completed", "payment_pending", "paid", "sitter_completed"]);
    if (!parentRatable.has(status)) {
      return { ok: false, error: "ניתן לדרג רק משמרת שהסתיימה." };
    }
  } else {
    if (!isSitter) {
      return { ok: false, error: "אין הרשאה לדרג משמרת זו." };
    }
    const mayRate =
      sitterMayRateParent(linkedPaymentStatus) || status === "paid";
    if (!mayRate) {
      return { ok: false, error: SITTER_RATE_BEFORE_CONFIRMATION_MESSAGE };
    }
  }

  const toUserId = isParent ? sitterId : parentId;
  if (!toUserId || toUserId === uid) {
    return { ok: false, error: "לא נמצא משתמש לדירוג." };
  }

  // Parent reviews stay unpublished until finalizeHypPaymentSuccess publishes them.
  // Sitter reviews are published immediately (payment already succeeded).
  // DB BEFORE INSERT trigger also enforces this — clients cannot self-publish as parent.
  const row: Record<string, unknown> = {
    session_id: sid,
    from_user_id: uid,
    to_user_id: toUserId,
    rating: stars,
    comment: commentTrimmed,
    published_at: isParent ? null : new Date().toISOString()
  };

  const { error: insErr } = await supabase.from(RATINGS_TABLE).insert(row);

  const finishOk = async (): Promise<SubmitSessionRatingResult> => {
    if (params.role === "sitter" && linkedBookingId) {
      await markManualPaymentPaidIfReady(supabase, linkedBookingId);
    }
    return { ok: true };
  };

  if (insErr) {
    // unique (session_id, from_user_id) — already rated; treat as success (idempotent).
    const code = String((insErr as { code?: string }).code ?? "");
    const msg = String(insErr.message ?? "");
    if (code === "23505" || /duplicate key|unique/i.test(msg)) {
      return finishOk();
    }
    // Older DBs without published_at: retry without the column.
    if (/published_at|schema cache|column/i.test(msg)) {
      const { error: retryErr } = await supabase.from(RATINGS_TABLE).insert({
        session_id: sid,
        from_user_id: uid,
        to_user_id: toUserId,
        rating: stars,
        comment: commentTrimmed
      });
      if (retryErr) {
        const retryCode = String((retryErr as { code?: string }).code ?? "");
        const retryMsg = String(retryErr.message ?? "");
        if (retryCode === "23505" || /duplicate key|unique/i.test(retryMsg)) {
          return finishOk();
        }
        return { ok: false, error: retryErr.message || "שמירת הדירוג נכשלה." };
      }
      return finishOk();
    }
    return { ok: false, error: insErr.message || "שמירת הדירוג נכשלה." };
  }

  return finishOk();
}
