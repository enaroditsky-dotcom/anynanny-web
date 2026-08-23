"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useState, useRef } from "react";
import {
  DoubleShakeCircleButton,
  DoubleShakeCircleSlot,
  DoubleShakeShiftPanel
} from "@/components/session/double-shake-circle-button";
import { ParentSessionTimerCircle } from "@/components/session/parent-double-shake-idle-circle";
import { BillingSessionMetrics } from "@/components/billing/BillingSessionMetrics";
import { StuckShiftDevResetButton } from "@/components/sitter/stuck-shift-dev-reset";
import {
  readStrictSessionStatus,
  resolveBillingLifecyclePhase,
  shakeSet
} from "@/lib/billing/billing-lifecycle";
import {
  formatNis,
  recordParentConfirmEnd,
  recordParentStartShake,
  useBillingSession,
} from "@/lib/billing/session-billing";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { removeRealtimeChannel, subscribePostgresChanges } from "@/lib/supabase/subscribe-postgres-changes";
import { SessionRatingModal } from "@/components/session/session-rating-modal";

type ParentActiveSessionProps = {
  sessionId: string;
  parentId: string;
  className?: string;
};

function triggerHaptic(pattern: number[]) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate(pattern);
  }
}

function StatusCard({ children }: { children: ReactNode }) {
  return (
    <div className="shrink-0 rounded-2xl border border-navy-header/15 bg-[#FDFBF6]/90 px-3 py-3 text-right text-sm font-semibold text-navy-header">
      {children}
    </div>
  );
}

export function ParentActiveSession({ sessionId, parentId, className = "" }: ParentActiveSessionProps) {
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
    participantColumn: "parent_id",
    participantId: parentId
  });

  const refreshRef = useRef(refresh);
  useEffect(() => { refreshRef.current = refresh; }, [refresh]);

  const sessionStatus = readStrictSessionStatus(row);
  const lifecyclePhase = row ? resolveBillingLifecyclePhase(row, null, Date.now()) : null;
  const sitterInitiatedEnd = shakeSet(row?.sitter_end_shake);
  const genuinelyCompleted =
    sessionStatus === "completed" && lifecyclePhase === "COMPLETED_AND_REVIEW";

  const [startBusy, setStartBusy] = useState(false);
  const [confirmEndBusy, setConfirmEndBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  
  // מודאל הדירוג ייפתח מיד עם סיום המשמרת
  const [ratingOpen, setRatingOpen] = useState(false);
  const [ratingCompleted, setRatingCompleted] = useState(false);

  // Real-time listener לעדכונים מול ה-Database
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const channel = subscribePostgresChanges(supabase, `realtime-session-${sessionId}`, {
      event: 'UPDATE',
      table: 'sessions',
      filter: `id=eq.${sessionId}`,
      handler: () => {
        refreshRef.current();
      }
    });

    return () => {
      removeRealtimeChannel(supabase, channel);
    };
  }, [sessionId]);

  const handleParentStart = useCallback(async () => {
    if (startBusy || sessionStatus !== "sitter_started") return;

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setActionError("Supabase לא מוגדר.");
      return;
    }

    try {
      setStartBusy(true);
      setActionError(null);
      triggerHaptic([120, 60, 120]);

      const { error: updateError, row: updatedRow } = await recordParentStartShake(
        supabase,
        sessionId,
        parentId
      );
      if (updateError) setActionError(updateError);
      else if (updatedRow) commitSessionRow(updatedRow);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "שגיאה באישור הגעת הנני.");
    } finally {
      setStartBusy(false);
    }
  }, [commitSessionRow, parentId, sessionId, sessionStatus, startBusy]);

  const handleParentConfirmEnd = useCallback(async () => {
    if (confirmEndBusy || lifecyclePhase !== "WAITING_PARENT_END_SHAKE" || !row) return;

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setActionError("Supabase לא מוגדר.");
      return;
    }

    try {
      setConfirmEndBusy(true);
      setActionError(null);
      triggerHaptic([120, 60, 120]);

      const { error: updateError, row: updatedRow } = await recordParentConfirmEnd(
        supabase,
        sessionId,
        parentId,
        row
      );
      if (updateError) setActionError(updateError);
      else if (updatedRow) commitSessionRow(updatedRow);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "שגיאה באישור סיום משמרת.");
    } finally {
      setConfirmEndBusy(false);
    }
  }, [commitSessionRow, confirmEndBusy, parentId, row, sessionId, lifecyclePhase]);

  const handleRatingResolved = useCallback(() => {
    setRatingOpen(false);
    setRatingCompleted(true);
  }, []);

  const handleLocalReset = useCallback(async () => {
    setActionError(null);
    setRatingOpen(false);
    setRatingCompleted(false);
    await refresh();
  }, [refresh]);

  useEffect(() => {
    if (!genuinelyCompleted) {
      setRatingOpen(false);
      setRatingCompleted(false);
      return;
    }
    if (!ratingCompleted) {
      setRatingOpen(true);
    }
  }, [genuinelyCompleted, ratingCompleted]);

  const showEmergencyReset =
    sessionStatus === "sitter_started" ||
    sessionStatus === "in_progress" ||
    lifecyclePhase === "WAITING_PARENT_END_SHAKE" ||
    genuinelyCompleted;

  if (error && !row) {
    return (
      <div className={`flex min-h-0 flex-1 flex-col ${className}`}>
        <StatusCard>{error}</StatusCard>
        <div className="mt-auto shrink-0 pt-2 text-center">
          <StuckShiftDevResetButton role="parent" variant="link" onSuccess={() => void handleLocalReset()} />
        </div>
      </div>
    );
  }

  let mainCard: ReactNode;

  if (loading || !row) {
    mainCard = <StatusCard>טוען פרטי משמרת…</StatusCard>;
  } else if (sessionStatus === "confirmed") {
    mainCard = <StatusCard>הנני טרם הגיעה</StatusCard>;
  } else if (sessionStatus === "sitter_started") {
    mainCard = (
      <DoubleShakeCircleButton
        label={startBusy ? "מפעיל מונה…" : "אשר הגעת נני"}
        variant="emerald"
        busy={startBusy}
        onClick={() => void handleParentStart()}
      />
    );
  } else if ((sessionStatus === "in_progress" || lifecyclePhase === "ACTIVE_RUNNING") && lifecyclePhase !== "WAITING_PARENT_END_SHAKE" && !genuinelyCompleted) {
    mainCard = (
      <div className="flex w-full flex-col items-center justify-center gap-3 pt-2">
        <ParentSessionTimerCircle
          timerText={timerText}
          amountLabel={`₪${formatNis(accruedNis)}`}
        />
        <p className="text-center text-[12px] font-medium text-slate-600">
          ₪{ratePerMinute.toFixed(2)}/דקה · {isLive ? "מונה פעיל" : "מונה קפוא"}
        </p>
      </div>
    );
  } else if (lifecyclePhase === "WAITING_PARENT_END_SHAKE" && sitterInitiatedEnd) {
    mainCard = (
      <DoubleShakeCircleButton
        label={confirmEndBusy ? "מאשר סיום…" : "אשר סיום משמרת"}
        variant="emerald"
        busy={confirmEndBusy}
        onClick={() => void handleParentConfirmEnd()}
      />
    );
  } else if (genuinelyCompleted) {
    mainCard = (
      <div className="flex w-full max-w-[14rem] flex-col items-center gap-2">
        {row.session_status === "paid" ? (
          <div className="w-full text-center p-3 bg-emerald-50 border border-emerald-100 rounded-xl space-y-1">
            <h3 className="text-xs font-bold text-emerald-800">🎉 המשמרת שולמה בהצלחה!</h3>
            <p className="text-[12px] text-emerald-600">הסיכום נחתם ונשמר בדשבורד.</p>
          </div>
        ) : (
          <StatusCard>המשמרת הסתיימה.</StatusCard>
        )}
        
        <BillingSessionMetrics
          timerText={timerText}
          accruedNis={formatNis(accruedNis)}
          ratePerMinute={ratePerMinute}
          isLive={false}
          headline="סיכום סופי"
        />
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
    <div className={`flex min-h-0 flex-1 flex-col overflow-hidden ${className}`}>
      <DoubleShakeShiftPanel className="min-h-0 flex-1 !p-2 sm:!p-3">
        <DoubleShakeCircleSlot align="start" pinToBottom={false} className="pt-4">
          {mainCard}
        </DoubleShakeCircleSlot>

        {actionError ? (
          <p className="shrink-0 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-right text-xs font-semibold text-rose-800">
            {actionError}
          </p>
        ) : null}
      </DoubleShakeShiftPanel>

      {showEmergencyReset ? (
        <div className="shrink-0 pb-1 text-center">
          <StuckShiftDevResetButton
            role="parent"
            variant="link"
            onSuccess={() => void handleLocalReset()}
          />
        </div>
      ) : null}

      {ratingOpen && genuinelyCompleted ? (
        <SessionRatingModal
          open={ratingOpen}
          role="parent"
          sessionId={sessionId}
          onResolved={handleRatingResolved}
        />
      ) : null}
    </div>
  );
}