"use client";

import type { ReactNode } from "react";
import { useCallback, useState } from "react";
import { DoubleShakeShiftPanel } from "@/components/session/double-shake-circle-button";
import { BillingSessionMetrics } from "@/components/billing/BillingSessionMetrics";
import { readStrictSessionStatus } from "@/lib/billing/billing-lifecycle";
import { Star } from "lucide-react";
import {
  BILLING_SESSION_SELECT,
  formatNis,
  recordSitterEndShake,
  recordSitterStartShake,
  useBillingSession,
  type BillingSessionRow
} from "@/lib/billing/session-billing";
import { SESSIONS_TABLE } from "@/lib/session/protocol";
import {
  resolveShiftTimeWindow,
  sitterHasOverlappingActiveShift
} from "@/lib/bookings/sitter-shift-overlap";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

const OVERLAP_ALERT_MESSAGE =
  "⚠️ לא ניתן לאשר את המשמרת - קיימת כבר משמרת אחרת בלוח הזמנים שלך בשעות חופפות.";

type SitterActiveSessionProps = {
  sessionId: string;
  sitterId: string;
  className?: string;
};

function triggerHaptic(pattern: number[]) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate(pattern);
  }
}

function BillingResetButton({
  busy,
  onClick
}: {
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      className="w-full rounded-xl border border-dashed border-amber-400 bg-amber-50/90 px-3 py-2.5 text-xs font-semibold text-amber-950 transition hover:bg-amber-100 disabled:opacity-60"
    >
      {busy ? "מאפס משמרת…" : "איפוס משמרת תקועה"}
    </button>
  );
}

function StatusCard({ children }: { children: ReactNode }) {
  return (
    <div className="shrink-0 rounded-2xl border border-navy-header/15 bg-[#FDFBF6]/90 px-4 py-4 text-right text-sm font-semibold text-navy-header">
      {children}
    </div>
  );
}

export function SitterActiveSession({ sessionId, sitterId, className = "" }: SitterActiveSessionProps) {
  const {
    row,
    loading,
    error,
    ratePerMinute,
    timerText,
    accruedNis,
    isLive,
    refresh,
    commitSessionRow
  } = useBillingSession({
    sessionId,
    participantColumn: "sitter_id",
    participantId: sitterId
  });

  const sessionStatus = readStrictSessionStatus(row);

  const [startBusy, setStartBusy] = useState(false);
  const [endBusy, setEndBusy] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [ratingBusy, setRatingBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  
  // ניהול כוכבי דירוג מקומי אצל הנני
  const [rating, setRating] = useState<number>(0);
  const [isFinishedEntirely, setIsFinishedEntirely] = useState(false);

  const handleSitterStart = useCallback(async () => {
    if (startBusy || sessionStatus !== "confirmed" || !row) return;

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setActionError("Supabase לא מוגדר.");
      return;
    }

    try {
      const proposedWindow =
        row.start_time && row.end_time
          ? resolveShiftTimeWindow({ start_time: row.start_time, end_time: row.end_time })
          : null;

      if (proposedWindow) {
        const hasOverlap = await sitterHasOverlappingActiveShift(supabase, sitterId, proposedWindow, {
          sessionId
        });
        if (hasOverlap) {
          setActionError(OVERLAP_ALERT_MESSAGE);
          return;
        }
      }

      setStartBusy(true);
      setActionError(null);
      triggerHaptic([100, 50, 100]);

      const { error: updateError, row: updatedRow } = await recordSitterStartShake(
        supabase,
        sessionId,
        sitterId
      );
      if (updateError) setActionError(updateError);
      else if (updatedRow) commitSessionRow(updatedRow);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "שגיאה באישור הגעה.");
    } finally {
      setStartBusy(false);
    }
  }, [commitSessionRow, row, sessionId, sessionStatus, sitterId, startBusy]);

  const handleEndShift = useCallback(async () => {
    if (endBusy || sessionStatus !== "in_progress" || !row) return;

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setActionError("Supabase לא מוגדר.");
      return;
    }

    try {
      setEndBusy(true);
      setActionError(null);
      triggerHaptic([80, 40, 80]);

      const { error: updateError, row: updatedRow } = await recordSitterEndShake(
        supabase,
        sessionId,
        sitterId
      );
      if (updateError) setActionError(updateError);
      else if (updatedRow) commitSessionRow(updatedRow);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "שגיאה בבקשת סיום משמרת.");
    } finally {
      setEndBusy(false);
    }
  }, [commitSessionRow, endBusy, row, sessionId, sessionStatus, sitterId]);

  // שליחת דירוג ההורה על ידי הנני וסגירה מוחלטת
  const handleSitterSubmitRating = async () => {
    if (rating === 0 || ratingBusy) return;
    
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setActionError("Supabase לא מוגדר.");
      return;
    }

    setRatingBusy(true);
    
    try {
      // 1. שמירת הדירוג בטבלה המתאימה
      await supabase.from("sitter_ratings").insert([
        {
          session_id: sessionId,
          sitter_id: sitterId,
          parent_id: row?.parent_id,
          rating_stars: rating
        }
      ]);

      // 2. סגירת התצוגה המקומית סופית
      setIsFinishedEntirely(true);
      triggerHaptic([60, 30, 60]);
    } catch (err) {
      console.error("Error submitting rating for parent:", err);
    } finally {
      setRatingBusy(false);
    }
  };

  const handleResetShakes = useCallback(async () => {
    if (resetBusy) return;
    if (
      !window.confirm(
        "לאפס משמרת תקועה? כל חותמות הזמן יימחקו והמשמרת תחזור למצב התחלתי."
      )
    ) {
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setActionError("Supabase לא מוגדר.");
      return;
    }

    setResetBusy(true);
    setActionError(null);

    try {
      const { data, error: updateError } = await supabase
        .from(SESSIONS_TABLE)
        .update({
          sitter_start_shake: null,
          parent_start_shake: null,
          sitter_end_shake: null,
          parent_end_shake: null,
          session_status: "confirmed"
        })
        .eq("id", sessionId)
        .eq("sitter_id", sitterId)
        .select(BILLING_SESSION_SELECT)
        .maybeSingle();

      if (updateError) {
        setActionError(updateError.message);
        return;
      }

      if (data && typeof data === "object") {
        commitSessionRow(data as BillingSessionRow);
      }
      await refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "שגיאה באיפוס המשמרת.");
    } finally {
      setResetBusy(false);
    }
  }, [commitSessionRow, refresh, resetBusy, sessionId, sitterId]);

  if (error && !row) {
    return (
      <div className={`space-y-3 ${className}`}>
        <section className="rounded-3xl border border-rose-200 bg-rose-50 p-5 text-center shadow-soft">
          <p className="text-sm font-semibold text-rose-800">{error}</p>
        </section>
        <BillingResetButton busy={resetBusy} onClick={() => void handleResetShakes()} />
      </div>
    );
  }

  let mainCard: ReactNode;

  if (loading || !row) {
    mainCard = <StatusCard>טוען פרטי משמרת…</StatusCard>;
  } else if (isFinishedEntirely) {
    mainCard = (
      <div className="rounded-2xl border border-emerald-100 bg-emerald-50/80 p-5 text-center space-y-2">
        <h3 className="text-sm font-bold text-emerald-900">המשמרת נסגרה ונחתמה!</h3>
        <p className="text-xs text-emerald-700 font-medium">הכסף הועבר לחשבונך והסיכום שמור במערכת. נתראה במשמרת הבאה!</p>
      </div>
    );
  } else if (sessionStatus === "confirmed") {
    mainCard = (
      <button
        type="button"
        disabled={startBusy}
        onClick={() => void handleSitterStart()}
        className="w-full rounded-2xl bg-emerald-600 px-4 py-5 text-lg font-bold text-white shadow-[0_12px_40px_-10px_rgba(5,150,105,0.55)] ring-2 ring-emerald-300/60 transition hover:bg-emerald-700 active:scale-[0.99] disabled:opacity-70"
      >
        {startBusy ? "שולח אישור…" : "הגעתי"}
      </button>
    );
  } else if (sessionStatus === "sitter_started") {
    mainCard = <StatusCard>ממתין לאישור הורה…</StatusCard>;
  } else if (sessionStatus === "in_progress") {
    mainCard = (
      <div className="space-y-4">
        <BillingSessionMetrics
          timerText={timerText}
          accruedNis={formatNis(accruedNis)}
          ratePerMinute={ratePerMinute}
          isLive={isLive}
          headline="משמרת פעילה"
        />
        <button
          type="button"
          disabled={endBusy}
          onClick={() => void handleEndShift()}
          className="w-full rounded-2xl bg-[#FF8A8A] px-4 py-4 text-base font-bold text-white shadow-[0_10px_36px_-8px_rgba(255,138,138,0.75)] ring-2 ring-[#FF8A8A]/40 transition hover:brightness-105 active:scale-[0.99] disabled:opacity-70"
        >
          {endBusy ? "שולח בקשת סיום…" : "סיום משמרת"}
        </button>
      </div>
    );
  } else if (sessionStatus === "sitter_ended") {
    mainCard = (
      <div className="space-y-4">
        <BillingSessionMetrics
          timerText={timerText}
          accruedNis={formatNis(accruedNis)}
          ratePerMinute={ratePerMinute}
          isLive={false}
          headline="שעון נעצר"
        />
        <StatusCard>ממתין לאישור סיום מההורה…</StatusCard>
      </div>
    );
  } 
  // 🔥 שלב הביניים החדש: ההורה אישר סיום, אבל התשלום טרם בוצע בפועל
  else if (sessionStatus === "completed" && row.session_status !== "paid") {
    mainCard = (
      <div className="space-y-4">
        <div className="rounded-2xl border border-amber-100 bg-amber-50/60 p-4 text-center space-y-1">
          <h3 className="text-xs font-bold text-amber-800">ההורה אישר את סיום המשמרת!</h3>
          <p className="text-[13px] text-amber-700 leading-normal">ההורה נמצא כעת בשלב ביצוע התשלום והסליקה. מיד עם אישור העסקה המסך שלך יתעדכן.</p>
        </div>
        <BillingSessionMetrics
          timerText={timerText}
          accruedNis={formatNis(accruedNis)}
          ratePerMinute={ratePerMinute}
          isLive={false}
          headline="סיכום ממתין לתשלום"
        />
      </div>
    );
  } 
  // 🔥 שלב הגראנד-פינאלה: התשלום סולק בהצלחה! מציגים לנני הודעת הצלחה + בקשת דירוג
  else if (row.session_status === "paid") {
    mainCard = (
      <div className="space-y-4">
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-center space-y-1.5 shadow-soft">
          <span className="text-xl">💰</span>
          <h3 className="text-sm font-black text-emerald-900">התשלום התקבל בהצלחה!</h3>
          <p className="text-xs text-emerald-700">הסכום על סך ₪{formatNis(accruedNis)} הועבר לחשבונך.</p>
        </div>

        <div className="rounded-2xl bg-white border border-slate-100 p-4 text-center space-y-3 shadow-soft">
          <div className="space-y-0.5">
            <h4 className="text-xs font-bold text-slate-700">איך היה ההורה?</h4>
            <p className="text-[12px] text-slate-400">דרגי את החוויה שלך כדי לעזור לנניז אחרות בסביבה</p>
          </div>
          
          <div className="flex justify-center gap-2" dir="ltr">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => setRating(star)}
                className="transition active:scale-95"
              >
                <Star
                  className={`h-7 w-7 ${
                    star <= rating ? "fill-amber-400 text-amber-400" : "text-slate-200"
                  }`}
                />
              </button>
            ))}
          </div>

          <button
            type="button"
            disabled={rating === 0 || ratingBusy}
            onClick={() => void handleSitterSubmitRating()}
            className="w-full rounded-xl bg-navy-header py-2.5 text-xs font-bold text-white shadow-sm transition hover:brightness-110 disabled:opacity-50"
          >
            {ratingBusy ? "שומר..." : "סיום ותודה"}
          </button>
        </div>
      </div>
    );
  } else {
    mainCard = (
      <StatusCard>
        {actionError ??
          `סטטוס משמרת לא מזוהה (${row.session_status ?? "חסר"}). נסו לרענן או לאפס את המשמרת.`}
      </StatusCard>
    );
  }

  return (
    <div className={`flex min-h-0 flex-1 flex-col ${className}`}>
      <DoubleShakeShiftPanel className="min-h-0 flex-1">
        <div className="flex w-full min-h-0 flex-1 flex-col">
          <div className="shrink-0 text-right">
            <p className="text-xs font-semibold uppercase tracking-wide text-navy-800/60">משמרת — בייביסיטר</p>
            <h2 className="text-lg font-bold text-[#001F3F]">מעקב חי וחיוב</h2>
          </div>

          <div className="my-auto flex min-h-0 w-full flex-1 flex-col justify-center gap-4 py-2">
            {mainCard}
          </div>

          {actionError ? (
            <p className="shrink-0 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-right text-sm font-semibold text-rose-800">
              {actionError}
            </p>
          ) : null}
        </div>
      </DoubleShakeShiftPanel>

      {!isFinishedEntirely && row?.session_status !== "paid" && (
        <div className="mt-3 shrink-0 px-1">
          <BillingResetButton busy={resetBusy} onClick={() => void handleResetShakes()} />
        </div>
      )}
    </div>
  );
}