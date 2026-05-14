"use client";

import type { FormEvent } from "react";
import { Star } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { SESSIONS_TABLE } from "@/lib/session/protocol";
import { SITTER_PROFILES_TABLE, SITTER_PROFILES_USER_COLUMN } from "@/lib/sitter/sitter-profile";
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
  const [err, setErr] = useState<string | null>(null);

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
      const fk = SITTER_PROFILES_USER_COLUMN;
      const { data: sp } = await supabase.from(SITTER_PROFILES_TABLE).select("full_name").eq(fk, otherId).maybeSingle();
      const n = sp && typeof sp === "object" && "full_name" in sp ? String((sp as { full_name?: string }).full_name ?? "").trim() : "";
      setCounterpartyName(n || "הבייביסיטר");
    } else {
      const { data: p } = await supabase.from(PROFILES_TABLE).select("full_name").eq("id", otherId).maybeSingle();
      const n = p && typeof p === "object" && "full_name" in p ? String((p as { full_name?: string }).full_name ?? "").trim() : "";
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
    setErr(null);
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
      setErr("מזהה משמרת לא תקין — רעננו את הדף ונסו שוב.");
      return;
    }
    if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
      setErr("נא לבחור דירוג בין 1 ל־5 כוכבים.");
      return;
    }

    setBusy(true);
    setErr(null);
    try {
      const payload = {
        session_id: sid,
        rating: stars,
        comment: commentTrimmed
      };
      const supabase = getSupabaseBrowserClient();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (supabase) {
        const { data: sess } = await supabase.auth.getSession();
        const token = sess.session?.access_token;
        if (token) headers.Authorization = `Bearer ${token}`;
      }
      const res = await fetch("/api/ratings", {
        method: "POST",
        credentials: "include",
        headers,
        body: JSON.stringify(payload)
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; details?: unknown };
      if (!res.ok) {
        setErr(typeof json.error === "string" ? json.error : "שמירה נכשלה.");
        return;
      }
      setRatingValue(0);
      setHover(0);
      setComment("");
      setErr(null);
      onResolved();
    } catch {
      setErr("שגיאת רשת — נסו שוב.");
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

          {err ? <p className="mt-2 text-right text-sm text-rose-700">{err}</p> : null}

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
