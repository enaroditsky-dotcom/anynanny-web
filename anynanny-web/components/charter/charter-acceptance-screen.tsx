"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { getCharterDocument } from "@/lib/charter/content";
import {
  beginCharterSubmit,
  canSubmitCharterAcceptance,
  CHARTER_ACCEPTANCE_ERROR
} from "@/lib/charter/acceptance";
import {
  charterFullHref,
  nextPathAfterCharterAcceptance
} from "@/lib/charter/routing";
import type { CharterType } from "@/lib/charter/versions";
import { AnyNannyLogo } from "@/components/brand/anynanny-logo";

type CharterAcceptanceScreenProps = {
  role: CharterType;
};

export function CharterAcceptanceScreen({ role }: CharterAcceptanceScreenProps) {
  const router = useRouter();
  const doc = getCharterDocument(role);
  const [checked, setChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitLock = useRef(false);

  const continueDisabled = !canSubmitCharterAcceptance({ checked, submitting });

  const handleSubmit = async () => {
    const next = beginCharterSubmit({ submitting, accepted: false });
    if (!next || submitLock.current || !checked) return;

    submitLock.current = true;
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/charter/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ charterType: role })
      });

      if (!response.ok) {
        setError(CHARTER_ACCEPTANCE_ERROR);
        setSubmitting(false);
        submitLock.current = false;
        return;
      }

      router.replace(nextPathAfterCharterAcceptance(role));
    } catch {
      setError(CHARTER_ACCEPTANCE_ERROR);
      setSubmitting(false);
      submitLock.current = false;
    }
  };

  return (
    <main
      className="mx-auto flex min-h-dvh w-full min-w-0 max-w-md flex-col bg-[#FDFBF6] px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))]"
      dir="rtl"
    >
      <section className="flex min-h-0 flex-1 flex-col rounded-3xl border border-[#001F3F]/10 bg-white p-5 shadow-soft">
        <header className="space-y-3 text-right">
          <div className="flex justify-center">
            <AnyNannyLogo variant="header" decorative />
          </div>
          <h1 className="text-2xl font-bold text-navy-header">{doc.title}</h1>
          <p className="text-base leading-relaxed text-slate-600">{doc.intro}</p>
        </header>

        <ul className="mt-5 space-y-2.5 text-right">
          {doc.checklist.map((item) => (
            <li key={item} className="flex items-start gap-2.5 text-sm leading-relaxed text-slate-700">
              <span className="mt-0.5 text-emerald-600" aria-hidden>
                ✓
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ul>

        <Link
          href={charterFullHref(role, `/charter?role=${role}`)}
          className="mt-5 inline-flex min-h-11 items-center justify-center text-sm font-semibold text-navy-header underline decoration-navy-header/30 underline-offset-2"
        >
          {doc.fullLinkLabel}
        </Link>

        <label
          htmlFor="charter-acceptance"
          className={`mt-6 flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-right ${
            error ? "border-rose-300" : "border-navy-header/10"
          }`}
        >
          <input
            id="charter-acceptance"
            type="checkbox"
            checked={checked}
            disabled={submitting}
            onChange={(event) => {
              setChecked(event.target.checked);
              if (event.target.checked) setError(null);
            }}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border border-navy-header/25 accent-emerald-600"
          />
          <span className="min-w-0 flex-1 text-sm leading-relaxed text-navy-900">
            {doc.checkboxLabel}
          </span>
        </label>

        {error ? (
          <p className="mt-3 text-sm font-medium text-rose-700" role="alert">
            {error}
          </p>
        ) : null}

        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={continueDisabled}
          className="mt-5 min-h-12 w-full rounded-xl bg-navy-header text-base font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting ? "שומרים את האישור…" : doc.ctaLabel}
        </button>
      </section>
    </main>
  );
}
