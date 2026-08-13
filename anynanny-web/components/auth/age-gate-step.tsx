"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AGE_GATE_COPY, type AgeEligibilityRole } from "@/lib/auth/age-eligibility";

/** Matches existing short success-toast hold (SitterBankDetailsModal ~1500ms) plus read time. */
const DECLINE_EXIT_DELAY_MS = 1800;

type AgeGateStepProps = {
  role: AgeEligibilityRole;
  onEligible: () => void;
  /** Leave the role registration flow after a "לא" answer. */
  onDeclineExit: () => void;
  onBack?: () => void;
  variant?: "card" | "plain";
};

export function AgeGateStep({
  role,
  onEligible,
  onDeclineExit,
  onBack,
  variant = "card"
}: AgeGateStepProps) {
  const [declined, setDeclined] = useState(false);
  const exitedRef = useRef(false);
  const onDeclineExitRef = useRef(onDeclineExit);
  onDeclineExitRef.current = onDeclineExit;
  const copy = AGE_GATE_COPY[role];
  const shellClass =
    variant === "plain"
      ? "text-center"
      : "rounded-2xl border border-slate-100 bg-white p-6 text-center shadow-sm sm:p-8";

  const exitRegistration = useCallback(() => {
    if (exitedRef.current) return;
    exitedRef.current = true;
    onDeclineExitRef.current();
  }, []);

  useEffect(() => {
    setDeclined(false);
    exitedRef.current = false;
  }, [role]);

  useEffect(() => {
    if (!declined) return;
    const id = window.setTimeout(exitRegistration, DECLINE_EXIT_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [declined, exitRegistration]);

  return (
    <div className={`relative ${shellClass}`} dir="rtl">
      <h1 className="text-2xl font-bold leading-snug text-navy-header sm:text-3xl">{copy.question}</h1>
      <div className="mt-8 grid grid-cols-1 gap-3">
        <button
          type="button"
          disabled={declined}
          onClick={onEligible}
          className="w-full rounded-xl bg-navy-header py-4 text-lg font-bold text-white transition-colors hover:bg-blue-900 active:scale-[0.99] disabled:opacity-50"
        >
          כן
        </button>
        <button
          type="button"
          disabled={declined}
          onClick={() => setDeclined(true)}
          className="w-full rounded-xl border-2 border-navy-header/15 bg-[#FDFBF6] py-4 text-lg font-bold text-navy-header transition hover:bg-white active:scale-[0.99] disabled:opacity-50"
        >
          לא
        </button>
      </div>
      {onBack && !declined ? (
        <button
          type="button"
          onClick={onBack}
          className="mt-6 text-sm font-medium text-slate-500 transition hover:text-navy-header"
        >
          חזרה
        </button>
      ) : null}

      {declined ? (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-[#001F3F]/40 p-4 sm:items-center"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="age-gate-decline-message"
        >
          <div className="mb-8 w-full max-w-[20rem] rounded-2xl border border-navy-header/10 bg-white px-5 py-5 text-center shadow-lg sm:mb-0">
            <p id="age-gate-decline-message" className="text-base font-bold leading-snug text-navy-header">
              {copy.ineligible}
            </p>
            <button
              type="button"
              onClick={exitRegistration}
              className="mt-4 w-full rounded-xl bg-navy-header py-3.5 text-sm font-bold text-white transition hover:bg-blue-900"
            >
              הבנתי
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
