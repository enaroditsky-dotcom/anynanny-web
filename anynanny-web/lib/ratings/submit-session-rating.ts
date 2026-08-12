import { RATINGS_TABLE } from "@/lib/ratings/constants";
import { SESSIONS_TABLE } from "@/lib/session/protocol";
import type { SupabaseClient } from "@supabase/supabase-js";

function isPlausibleUuidSessionId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim());
}

export type SubmitSessionRatingResult =
  | { ok: true }
  | { ok: false; error: string };

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

  const { data: sessionRow, error: sessErr } = await supabase
    .from(SESSIONS_TABLE)
    .select("id, parent_id, sitter_id, status")
    .eq("id", sid)
    .maybeSingle();

  if (sessErr || !sessionRow) {
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
    // Sitter → Parent only after successful payment.
    if (status !== "paid") {
      return { ok: false, error: "ניתן לדרג את המשפחה רק לאחר שהתשלום הושלם." };
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

  if (insErr) {
    // unique (session_id, from_user_id) — already rated; treat as success (idempotent).
    const code = String((insErr as { code?: string }).code ?? "");
    const msg = String(insErr.message ?? "");
    if (code === "23505" || /duplicate key|unique/i.test(msg)) {
      return { ok: true };
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
          return { ok: true };
        }
        return { ok: false, error: retryErr.message || "שמירת הדירוג נכשלה." };
      }
      return { ok: true };
    }
    return { ok: false, error: insErr.message || "שמירת הדירוג נכשלה." };
  }

  return { ok: true };
}
