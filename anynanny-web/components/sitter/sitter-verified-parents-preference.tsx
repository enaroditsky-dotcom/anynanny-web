"use client";

import { useEffect, useState } from "react";
import { SITTER_HELP_ICON_CLASS } from "@/components/sitter/sitter-help-icon";
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
    <section dir="rtl" className="w-full min-w-0 shrink-0">
      <div className="flex h-11 min-h-11 items-center gap-1.5 rounded-xl border border-[#9ED9B5] bg-[#E8F8EF] px-1.5">
        <input
          type="checkbox"
          checked={checked}
          disabled={!ready || saving}
          onChange={(event) => void onToggle(event.target.checked)}
          className="h-[18px] w-[18px] shrink-0 rounded border-[#7DCAA0] accent-[#00A86B] disabled:opacity-60"
          aria-describedby={helpOpen ? HELP_ID : undefined}
        />
        <span className="min-w-0 flex-1 whitespace-nowrap text-right text-[11px] font-medium leading-none tracking-tight text-[#001F3F] min-[390px]:text-xs">
          {SITTER_VERIFIED_PARENTS_ONLY_LABEL}
        </span>
        <span className="relative inline-flex shrink-0">
          <button
            type="button"
            aria-label="מידע נוסף"
            aria-expanded={helpOpen}
            aria-controls={HELP_ID}
            onClick={() => setHelpOpen((open) => !open)}
            className={SITTER_HELP_ICON_CLASS}
          >
            <span className="absolute -inset-2" aria-hidden />
            ?
          </button>
          {helpOpen ? (
            <p
              id={HELP_ID}
              role="note"
              className="absolute left-0 top-[calc(100%+0.4rem)] z-20 w-max max-w-[min(16rem,calc(100vw-2.5rem))] rounded-xl bg-[#001F3F] px-3 py-2 text-right text-[13px] font-normal leading-relaxed text-white shadow-lg"
            >
              {SITTER_VERIFIED_PARENTS_ONLY_HELP}
            </p>
          ) : null}
        </span>
      </div>
      {error ? (
        <p role="alert" className="px-1 pt-1 text-right text-xs font-medium text-red-600">
          {error}
        </p>
      ) : null}
    </section>
  );
}
