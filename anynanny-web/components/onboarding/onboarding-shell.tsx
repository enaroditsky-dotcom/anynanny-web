import type { ReactNode } from "react";
import { ONBOARDING_STEP_COUNT, REQUIRED_FIELDS_NOTE } from "@/lib/onboarding/shared";

export function OnboardingPageShell({ children }: { children: ReactNode }) {
  return (
    <main
      className="mx-auto flex min-h-[100dvh] w-full min-w-0 max-w-full flex-col items-center justify-center bg-[#FDFBF6] px-4 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
      dir="rtl"
    >
      {children}
    </main>
  );
}

export function OnboardingCard({
  title,
  description,
  step,
  totalSteps = ONBOARDING_STEP_COUNT,
  error,
  children
}: {
  title: string;
  description?: string;
  step: number;
  totalSteps?: number;
  error?: string | null;
  children: ReactNode;
}) {
  const progress = Math.min(100, Math.max(0, (step / totalSteps) * 100));

  return (
    <section className="flex max-h-[min(85dvh,40rem)] w-full min-w-0 max-w-md flex-col overflow-hidden rounded-3xl border border-[#001F3F]/10 bg-white shadow-[0_16px_40px_-24px_rgba(0,31,63,0.35)]">
      <header className="shrink-0 border-b border-[#001F3F]/8 px-5 pb-4 pt-5">
        <p className="text-center text-xs font-semibold text-teal-700">
          שלב {step} מתוך {totalSteps}
        </p>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden>
          <div className="h-full rounded-full bg-teal-600 transition-all" style={{ width: `${progress}%` }} />
        </div>
        <h1 className="mt-4 text-center text-xl font-bold text-[#001F3F]">{title}</h1>
        {description ? (
          <p className="mt-2 text-center text-sm leading-relaxed text-slate-600">{description}</p>
        ) : null}
        {step === 1 ? <RequiredFieldsNote /> : null}
        {error ? (
          <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800" role="alert">
            {error}
          </p>
        ) : null}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
    </section>
  );
}

export function RequiredFieldsNote() {
  return <p className="mt-3 text-center text-xs leading-relaxed text-slate-500">{REQUIRED_FIELDS_NOTE}</p>;
}

export function OnboardingActions({
  onBack,
  onContinue,
  continueLabel = "המשך",
  backLabel = "חזרה",
  busy = false,
  continueDisabled = false,
  showBack = true
}: {
  onBack?: () => void;
  onContinue: () => void;
  continueLabel?: string;
  backLabel?: string;
  busy?: boolean;
  continueDisabled?: boolean;
  showBack?: boolean;
}) {
  return (
    <div className="mt-6 flex gap-2">
      {showBack ? (
        <button
          type="button"
          onClick={onBack}
          disabled={busy}
          className="min-h-12 flex-1 rounded-2xl border-2 border-[#001F3F]/15 text-sm font-bold text-[#001F3F] transition hover:bg-slate-50 disabled:opacity-60"
        >
          {backLabel}
        </button>
      ) : null}
      <button
        type="button"
        onClick={onContinue}
        disabled={busy || continueDisabled}
        className={`${showBack ? "flex-[1.4]" : "w-full"} min-h-12 rounded-2xl bg-[#001F3F] text-sm font-bold text-white transition hover:bg-[#003366] disabled:opacity-60`}
      >
        {continueLabel}
      </button>
    </div>
  );
}
