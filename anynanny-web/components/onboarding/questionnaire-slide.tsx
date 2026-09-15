"use client";

import { useEffect, useState, type ReactNode } from "react";

export const QUESTIONNAIRE_SLIDE_MS = 280;
export type QuestionnaireSlideDirection = "forward" | "back";

export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return reduced;
}

export function QuestionnaireSlideFrame({
  step,
  leavingStep,
  direction,
  reduceMotion,
  hasNavigated,
  renderStep
}: {
  step: number;
  leavingStep: number | null;
  direction: QuestionnaireSlideDirection;
  reduceMotion: boolean;
  hasNavigated: boolean;
  renderStep: (step: number, preview: boolean) => ReactNode;
}) {
  return (
    <div className="relative overflow-hidden">
      {leavingStep != null && !reduceMotion ? (
        <div
          className={`pointer-events-none absolute inset-0 ${
            direction === "forward"
              ? "animate-parent-wizard-out-forward"
              : "animate-parent-wizard-out-back"
          }`}
          aria-hidden
        >
          {renderStep(leavingStep, true)}
        </div>
      ) : null}
      <div
        className={
          reduceMotion
            ? undefined
            : leavingStep != null
              ? "invisible"
              : !hasNavigated
                ? undefined
                : direction === "forward"
                  ? "animate-parent-wizard-in-forward"
                  : "animate-parent-wizard-in-back"
        }
      >
        {renderStep(step, false)}
      </div>
    </div>
  );
}

export function focusOnboardingStepTarget(titleId: string, fieldId: string | null) {
  const heading = document.getElementById(titleId);
  if (!fieldId) {
    heading?.focus();
    return;
  }
  const field = document.getElementById(fieldId);
  if (field instanceof HTMLElement && (field.tagName === "INPUT" || field.tagName === "SELECT" || field.tagName === "TEXTAREA" || field.tabIndex >= 0)) {
    field.focus();
    return;
  }
  const wrapper = field ?? document.getElementById(fieldId);
  if (wrapper) {
    wrapper.querySelector<HTMLElement>("button, input, select, textarea")?.focus();
    return;
  }
  heading?.focus();
}
