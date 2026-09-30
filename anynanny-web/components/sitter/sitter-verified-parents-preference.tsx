"use client";

import { useEffect, useState } from "react";
import {
  SITTER_ONLY_VERIFIED_PARENTS_COLUMN,
  SITTER_VERIFIED_PARENTS_ONLY_HELP,
  SITTER_VERIFIED_PARENTS_ONLY_LABEL
} from "@/lib/trust/request-recipient-filters";

const HELP_ID = "sitter-verified-parents-help";

/**
 * Persistent sitter preference. Saved through the existing profile PATCH,
 * which updates only this sitter's own row.
 */
export function SitterVerifiedParentsPreference() {
  const [checked, setChecked] = useState(false);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch("/api/sitter/profile", { cache: "no-store" });
        const json = (await response.json()) as {
          profile?: { only_verified_parents?: unknown } | null;
        };
        if (cancelled || !response.ok) return;
        setChecked(json.profile?.only_verified_parents === true);
      } catch {
        if (!cancelled) setChecked(false);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const onToggle = async (next: boolean) => {
    if (!ready || saving) return;
    setChecked(next);
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/sitter/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [SITTER_ONLY_VERIFIED_PARENTS_COLUMN]: next })
      });
      const json = (await response.json()) as {
        error?: string;
        profile?: { only_verified_parents?: unknown } | null;
      };
      if (!response.ok) {
        setChecked(!next);
        setError(json.error || "שמירת ההעדפה נכשלה.");
        return;
      }
      setChecked(json.profile?.only_verified_parents === true);
    } catch {
      setChecked(!next);
      setError("שמירת ההעדפה נכשלה.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      dir="rtl"
      className="shrink-0 rounded-xl border border-slate-200/80 bg-white px-3 py-2 shadow-soft"
    >
      <div className="flex min-h-11 items-center gap-2">
        <input
          type="checkbox"
          checked={checked}
          disabled={!ready || saving}
          onChange={(event) => void onToggle(event.target.checked)}
          className="h-5 w-5 shrink-0 rounded border-slate-300 accent-[#00A86B] disabled:opacity-60"
          aria-describedby={helpOpen ? HELP_ID : undefined}
        />
        <span className="min-w-0 flex-1 text-right text-[14px] font-medium leading-snug text-[#001F3F]">
          {SITTER_VERIFIED_PARENTS_ONLY_LABEL}
        </span>
        <button
          type="button"
          aria-label="מידע נוסף"
          aria-expanded={helpOpen}
          aria-controls={HELP_ID}
          onClick={() => setHelpOpen((open) => !open)}
          className="relative inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-slate-300/80 bg-white text-[11px] font-semibold leading-none text-slate-400 transition hover:border-slate-400 hover:text-slate-600"
        >
          <span className="absolute -inset-2" aria-hidden />
          ?
        </button>
      </div>
      {helpOpen ? (
        <p
          id={HELP_ID}
          role="note"
          className="mb-1 mt-1 break-words text-right text-[13px] font-normal leading-relaxed text-slate-600"
        >
          {SITTER_VERIFIED_PARENTS_ONLY_HELP}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="pb-1 text-right text-xs font-medium text-red-600">
          {error}
        </p>
      ) : null}
    </section>
  );
}
