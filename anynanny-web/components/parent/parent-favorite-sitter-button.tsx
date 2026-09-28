"use client";

import { useEffect, useState } from "react";
import { Heart, Loader2 } from "lucide-react";
import {
  addParentFavoriteSitter,
  isParentFavoriteSitter,
  removeParentFavoriteSitter
} from "@/lib/favorites/parent-favorites";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export function ParentFavoriteSitterButton({ sitterId }: { sitterId: string }) {
  const [favorite, setFavorite] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !sitterId) {
      setFavorite(false);
      return;
    }
    void isParentFavoriteSitter(supabase, sitterId).then((value) => {
      if (!cancelled) setFavorite(value);
    });
    return () => {
      cancelled = true;
    };
  }, [sitterId]);

  const toggle = async () => {
    if (favorite == null || busy) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setError("Supabase לא מוגדר.");
      return;
    }

    const next = !favorite;
    setBusy(true);
    setError(null);
    setFavorite(next);

    const result = next
      ? await addParentFavoriteSitter(supabase, sitterId)
      : await removeParentFavoriteSitter(supabase, sitterId);

    setBusy(false);
    if ("ok" in result) {
      if (!result.ok) {
        setFavorite(!next);
        setError(result.error);
      }
      return;
    }
    if (result.error) {
      setFavorite(!next);
      setError(result.error);
      return;
    }
    setFavorite(true);
  };

  const pressed = favorite === true;

  return (
    <div className="w-full text-right">
      <button
        type="button"
        aria-pressed={pressed}
        aria-label={pressed ? "הסירו מהמועדפות" : "הוסיפו למועדפות"}
        disabled={favorite == null || busy}
        onClick={() => void toggle()}
        className={`inline-flex min-h-11 items-center gap-2 rounded-xl border px-3 py-2 text-sm font-bold transition disabled:opacity-60 ${
          pressed
            ? "border-rose-200 bg-rose-50 text-rose-700"
            : "border-slate-200 bg-white text-[#001F3F]"
        }`}
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <Heart className={`h-4 w-4 ${pressed ? "fill-rose-500 text-rose-500" : "text-slate-400"}`} aria-hidden />
        )}
        {pressed ? "במועדפות" : "הוסיפו למועדפות"}
      </button>
      {error ? <p className="mt-1 text-xs text-rose-700">{error}</p> : null}
    </div>
  );
}
