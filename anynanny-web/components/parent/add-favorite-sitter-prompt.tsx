"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { addParentFavoriteSitter } from "@/lib/favorites/parent-favorites";
import {
  FAVORITE_PROMPT_PRIMARY_LABEL,
  FAVORITE_PROMPT_SECONDARY_LABEL,
  favoritePromptMessage
} from "@/lib/favorites/parent-favorite-rules";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export function AddFavoriteSitterPrompt({
  sitterId,
  sitterName,
  onClose
}: {
  sitterId: string;
  sitterName: string;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setError("Supabase לא מוגדר.");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await addParentFavoriteSitter(supabase, sitterId);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-[#001F3F]/40 p-3 sm:items-center" dir="rtl">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="favorite-sitter-prompt-title"
        className="w-full max-w-sm rounded-2xl border border-[#C5A059]/30 bg-[#FFFDF8] p-4 text-right shadow-soft"
      >
        <p id="favorite-sitter-prompt-title" className="text-base font-bold leading-relaxed text-[#001F3F]">
          {favoritePromptMessage(sitterName)}
        </p>
        {error ? <p className="mt-2 text-sm text-rose-700">{error}</p> : null}
        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void add()}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#001F3F] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {FAVORITE_PROMPT_PRIMARY_LABEL}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="min-h-11 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600"
          >
            {FAVORITE_PROMPT_SECONDARY_LABEL}
          </button>
        </div>
      </div>
    </div>
  );
}
