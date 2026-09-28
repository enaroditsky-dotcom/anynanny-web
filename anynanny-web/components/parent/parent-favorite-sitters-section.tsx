"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { PersonalAreaSection } from "@/components/personal-area/personal-area-ui";
import { listParentFavoriteSitters, type FavoriteSitterSummary } from "@/lib/favorites/parent-favorites";
import {
  PARENT_FAVORITES_ACCORDION_TITLE,
  PARENT_FAVORITES_EMPTY_COPY
} from "@/lib/favorites/parent-favorite-rules";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

function favoriteRowName(sitter: FavoriteSitterSummary): string {
  const name = `${sitter.firstName} ${sitter.lastName}`.trim();
  return name || "בייביסיטרית";
}

export function ParentFavoriteSittersSection() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sitters, setSitters] = useState<FavoriteSitterSummary[]>([]);

  const load = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setError("Supabase לא מוגדר.");
      setLoading(false);
      return;
    }
    setLoading(true);
    const result = await listParentFavoriteSitters(supabase);
    setSitters(result.sitters);
    setError(result.error);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = loading
    ? "טוען את הרשימה"
    : sitters.length === 0
      ? "עדיין אין בייביסיטריות ברשימה"
      : sitters.length === 1
        ? "בייביסיטרית אחת ברשימה"
        : `${sitters.length} בייביסיטריות ברשימה`;

  return (
    <PersonalAreaSection title={PARENT_FAVORITES_ACCORDION_TITLE} summary={summary} accent="gold">
      {loading ? <p className="text-sm text-slate-500">טוען…</p> : null}
      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
      {!loading && !error && sitters.length === 0 ? (
        <p className="text-sm leading-relaxed text-slate-600">{PARENT_FAVORITES_EMPTY_COPY}</p>
      ) : null}
      {!loading && sitters.length > 0 ? (
        <ul className="space-y-2">
          {sitters.map((sitter) => (
            <li key={sitter.sitterId}>
              <Link
                href={`/parent/sitter/${encodeURIComponent(sitter.sitterId)}`}
                className="flex min-h-11 flex-col rounded-xl border border-slate-200 bg-[#FDFBF6] px-3 py-2 text-right transition hover:border-[#001F3F]/20 hover:bg-white"
              >
                <span className="text-sm font-bold text-[#001F3F]">{favoriteRowName(sitter)}</span>
                {sitter.anyNannyId ? (
                  <span className="text-xs font-semibold text-violet-600">מזהה: {sitter.anyNannyId}</span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </PersonalAreaSection>
  );
}
