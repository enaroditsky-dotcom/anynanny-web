"use client";

import type { FormEvent } from "react";
import { Star } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { RATINGS_TABLE } from "@/lib/ratings/constants";
import { SESSIONS_TABLE } from "@/lib/session/protocol";
import {
  fetchPublicSitterProfileViaRpc,
  publicSitterDisplayName
} from "@/lib/sitter/fetch-parent-sitter-profile";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { PROFILES_TABLE } from "@/lib/supabase/profiles";

export type SessionRatingModalProps = {
  open: boolean;
  role: "parent" | "sitter";
  sessionId: string | null;
  /** Called after skip, or immediately after a successful submit (modal resets first). */
  onResolved: () => void;
};

function isPlausibleUuidSessionId(value: string): boolean {
  const t = value.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t);
}

export function SessionRatingModal({ open, role, sessionId, onResolved }: SessionRatingModalProps) {
  const [ratingValue, setRatingValue] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [counterpartyName, setCounterpartyName] = useState("");
  const [busy, setBusy] = useState(false);

  const loadCounterparty = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !sessionId) {
      setCounterpartyName(role === "parent" ? "הבייביסיטר" : "ההורה");
      return;
    }
    const { data: s, error: se } = await supabase
      .from(SESSIONS_TABLE)
      .select("parent_id, sitter_id")
      .eq("id", sessionId)
      .maybeSingle();
    if (se || !s) {
      setCounterpartyName(role === "parent" ? "הבייביסיטר" : "ההורה");
      return;
    }
    const otherId =
      role === "parent"
        ? s.sitter_id != null
          ? String(s.sitter_id)
          : null
        : s.parent_id != null
          ? String(s.parent_id)
          : null;
    if (!otherId) {
      setCounterpartyName(role === "parent" ? "הבייביסיטר" : "ההורה");
      return;
    }
    if (role === "parent") {
      const profile = await fetchPublicSitterProfileViaRpc(supabase, otherId);
      setCounterpartyName(publicSitterDisplayName(profile) || "הבייביסיטר");
    } else {
      const { data: p } = await supabase
        .from(PROFILES_TABLE)
        .select("first_name, last_name")
        .eq("id", otherId)
        .maybeSingle();
      const n =
        p && typeof p === "object"
          ? `${(p as { first_name?: string | null }).first_name ?? ""} ${(p as { last_name?: string | null }).last_name ?? ""}`.trim()
          : "";
      setCounterpartyName(n || "ההורה");
    }
  }, [role, sessionId]);

  useEffect(() => {
    if (!open) {
      return;
    }
    setRatingValue(0);
    setHover(0);
    setComment("");
    void loadCounterparty();
  }, [open, sessionId, loadCounterparty]);

  const displayStars = hover || ratingValue;

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    e.stopPropagation();

    const sidRaw = sessionId;
    const sid = typeof sidRaw === "string" ? sidRaw.trim() : "";
    const stars = ratingValue;
    const commentTrimmed = comment.trim() ? comment.trim().slice(0, 2000) : null;

    if (!sid || !isPlausibleUuidSessionId(sid)) {
      console.error("[SessionRatingModal] invalid session id", { sid });
      return;
    }
    if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
      console.log("[SessionRatingModal] No star rating provided, skipping rating step.");
      onResolved();
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      console.error("[SessionRatingModal] Supabase browser client is not configured");
      return;
    }

    setBusy(true);
    try {
      const {
        data: { user },
        error: userErr
      } = await supabase.auth.getUser();
      if (userErr || !user) {
        console.error("[SessionRatingModal] not authenticated", userErr);
        return;
      }

      const { data: sessionRow, error: sessErr } = await supabase
        .from(SESSIONS_TABLE)
        .select("id, parent_id, sitter_id, status")
        .eq("id", sid)
        .maybeSingle();

      if (sessErr || !sessionRow) {
        console.error("[SessionRatingModal] session load failed", { sessErr, sessionRow });
        return;
      }

      const parentId = sessionRow.parent_id != null ? String(sessionRow.parent_id) : null;
      const sitterId = sessionRow.sitter_id != null ? String(sessionRow.sitter_id) : null;
      const uid = user.id;
      const isParent = parentId === uid;
      const isSitter = sitterId === uid;
      if (!isParent && !isSitter) {
        console.error("[SessionRatingModal] user is not a participant", { uid, parentId, sitterId });
        return;
      }
      if (String(sessionRow.status) !== "completed") {
        console.error("[SessionRatingModal] session not completed", { status: sessionRow.status });
        return;
      }

      let toUserId: string | null = null;
      if (isParent) {
        if (!sitterId) {
          console.error("[SessionRatingModal] no sitter on session");
          return;
        }
        toUserId = sitterId;
      } else {
        if (!parentId) {
          console.error("[SessionRatingModal] no parent on session");
          return;
        }
        toUserId = parentId;
      }

      if (toUserId === uid) {
        console.error("[SessionRatingModal] invalid rating target (self)");
        return;
      }

      const { error: insErr } = await supabase.from(RATINGS_TABLE).insert({
        session_id: sid,
        from_user_id: uid,
        to_user_id: toUserId,
        rating: stars,
        comment: commentTrimmed
      });

      if (insErr) {
        console.error("[SessionRatingModal] ratings insert failed", insErr);
        return;
      }

      setRatingValue(0);
      setHover(0);
      setComment("");
      onResolved();
    } catch (err) {
      console.error("[SessionRatingModal] submit error", err);
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  const headline =
    role === "parent"
      ? `איך הייתה חוויית הבייביסיטר עם ${counterpartyName}?`
      : `איך הייתה המשמרת עם ${counterpartyName}?`;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center bg-black/45 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rating-modal-title"
      dir="rtl"
    >
      <div className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-2xl border border-navy-header/15 bg-white p-5 shadow-xl shadow-[#001F3F]/15">
        <form className="space-y-0" onSubmit={handleSubmit}>
          <h2 id="rating-modal-title" className="text-right text-lg font-bold text-[#001F3F]">
            {headline}
          </h2>
          <p className="mt-1 text-right text-xs text-slate-500">הדירוג נשמר באופן מאובטח ומסייע לקהילה.</p>

          <div className="mt-4 flex flex-row-reverse justify-center gap-1" onMouseLeave={() => setHover(0)}>
            {[1, 2, 3, 4, 5].map((n) => {
              const on = displayStars >= n;
              return (
                <button
                  key={n}
                  type="button"
                  className="rounded-md p-1 transition hover:scale-110"
                  aria-label={`${n} כוכבים`}
                  onMouseEnter={() => setHover(n)}
                  onClick={() => setRatingValue(n)}
                >
                  <Star
                    className={`h-10 w-10 sm:h-11 sm:w-11 ${on ? "fill-amber-400 text-amber-500" : "fill-transparent text-slate-300"}`}
                    strokeWidth={on ? 0 : 1.5}
                  />
                </button>
              );
            })}
          </div>

          <label className="mt-5 block text-right text-sm font-medium text-navy-header">
            הוספת הערה (אופציונלי)
            <textarea
              className="mt-1 min-h-[5rem] w-full rounded-xl border border-navy-header/15 bg-[#FDFBF6]/50 p-2 text-right text-sm text-navy-900"
              value={comment}
              onChange={(ev) => setComment(ev.target.value.slice(0, 2000))}
              placeholder="שיתוף קצר יעזור לקהילה…"
              disabled={busy}
            />
          </label>

          <div className="mt-5 flex flex-col gap-2 sm:flex-row-reverse sm:justify-start">
            <button
              type="submit"
              disabled={busy}
              className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 disabled:opacity-50"
            >
              {busy ? "שולחים…" : "שליחה"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={(ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                onResolved();
              }}
              className="rounded-xl border border-navy-header/20 px-4 py-2.5 text-sm font-semibold text-navy-header transition hover:bg-slate-50"
            >
              דילוג
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}