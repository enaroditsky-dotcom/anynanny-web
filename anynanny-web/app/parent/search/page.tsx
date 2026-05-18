"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Search } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { ParentSearchFiltersBar } from "@/components/parent/parent-search-filters";
import { PublicSitterSearchCardLink } from "@/components/sitter/public-sitter-search-card";
import type { PublicSitterSearchCard } from "@/lib/sitter/sitter-profile";
import {
  defaultParentSearchFilters,
  isExactSitterSerialQuery,
  isSerialTargetedSearch,
  normalizeParentSearchFilters,
  type ParentSearchFilters
} from "@/lib/sitter/parent-search-filters";
import { fetchPublicSitterSearchBySerial, runParentSitterSearch } from "@/lib/sitter/parent-sitter-search";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export default function ParentSearchPage() {
  const router = useRouter();
  const { isLoading, signedIn, effectiveRole } = useAuth();
  const [draftFilters, setDraftFilters] = useState<ParentSearchFilters>(() => defaultParentSearchFilters());
  const [sitters, setSitters] = useState<PublicSitterSearchCard[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const serialFetchGen = useRef(0);

  useEffect(() => {
    if (isLoading) return;
    if (!signedIn) {
      router.replace("/auth/login?next=/parent/search");
      return;
    }
    if (effectiveRole === "sitter") {
      router.replace("/sitter/dashboard");
    }
  }, [isLoading, signedIn, effectiveRole, router]);

  const runSearch = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setSearchError("Supabase לא מוגדר.");
      setSitters([]);
      setHasSearched(true);
      return;
    }

    const filters = normalizeParentSearchFilters(draftFilters);

    setListLoading(true);
    setSearchError(null);
    setHasSearched(true);

    try {
      const { cards, error } = await runParentSitterSearch(supabase, filters);

      if (error) {
        console.warn("[parent/search] search error:", error);
        setSearchError(error);
        setSitters([]);
        return;
      }

      setSearchError(null);
      setSitters(cards);
    } finally {
      setListLoading(false);
    }
  }, [draftFilters]);

  const authSettled = !isLoading;
  const showContent = authSettled && signedIn && effectiveRole === "parent";

  useEffect(() => {
    if (!showContent) return;

    const serial = draftFilters.searchSitterSerial.trim();
    if (!isExactSitterSerialQuery(serial)) return;

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const gen = ++serialFetchGen.current;
    const timer = window.setTimeout(() => {
      void (async () => {
        setListLoading(true);
        setSearchError(null);
        setHasSearched(true);

        const { cards, error } = await fetchPublicSitterSearchBySerial(supabase, serial);

        if (serialFetchGen.current !== gen) return;

        if (error) {
          setSearchError(error);
          setSitters([]);
        } else {
          setSearchError(null);
          setSitters(cards);
        }
        setListLoading(false);
      })();
    }, 450);

    return () => window.clearTimeout(timer);
  }, [draftFilters.searchSitterSerial, showContent]);

  const showWait = !authSettled || (signedIn && effectiveRole === null);
  const redirectingToLogin = authSettled && !signedIn;
  const serialLookupActive = isSerialTargetedSearch(normalizeParentSearchFilters(draftFilters));

  return (
    <main className="mx-auto w-full max-w-md space-y-4 bg-[#FDFBF6] py-2 pb-24" dir="rtl">
      <header className="flex items-center justify-between px-1">
        <Link
          href="/parent/dashboard"
          className="inline-flex items-center gap-1 rounded-full border border-navy-header/20 bg-white px-3 py-1.5 text-xs font-semibold text-navy-header shadow-sm transition hover:bg-brand-cream"
        >
          <ArrowRight className="h-4 w-4" />
          חזרה לדשבורד
        </Link>
        <h1 className="text-lg font-bold text-navy-header">חיפוש נני</h1>
      </header>

      {showWait ? (
        <p className="px-1 text-right text-sm text-slate-600">טוען…</p>
      ) : redirectingToLogin ? (
        <p className="px-1 text-right text-sm text-slate-600">מעבירים להתחברות…</p>
      ) : !showContent ? (
        <p className="px-1 text-right text-sm text-slate-600">טוען…</p>
      ) : null}

      {showContent ? (
        <div className="space-y-3 px-1">
          <ParentSearchFiltersBar
            filters={draftFilters}
            onChange={(next) => setDraftFilters(normalizeParentSearchFilters(next))}
          />
          <button
            type="button"
            disabled={listLoading}
            onClick={() => void runSearch()}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#001F3F] py-3.5 text-base font-bold text-white shadow-soft transition hover:brightness-105 active:scale-[0.99] disabled:opacity-60"
          >
            <Search className="h-5 w-5" aria-hidden />
            {listLoading ? "מחפשים…" : "חפש בייביסיטר"}
          </button>
        </div>
      ) : null}

      {showContent && listLoading ? (
        <p className="px-1 text-right text-sm text-slate-600">טוען תוצאות…</p>
      ) : null}

      {showContent && hasSearched && !listLoading && !searchError && !serialLookupActive ? (
        <p className="px-1 text-right text-xs text-slate-600">ממוינים לפי דירוג ממוצע (גבוה קודם).</p>
      ) : null}

      {showContent && !hasSearched && !listLoading ? (
        <p className="rounded-2xl border border-navy-header/10 bg-white px-4 py-6 text-center text-sm text-slate-600 shadow-soft">
          הגדירו את הסינון ולחצו «חפש בייביסיטר» כדי לראות תוצאות.
        </p>
      ) : null}

      {showContent && hasSearched && !listLoading ? (
        <section className="space-y-3 px-1">
          {searchError ? (
            <p className="text-right text-xs text-rose-700">{searchError}</p>
          ) : null}

          {sitters.length === 0 && !searchError ? (
            <p className="rounded-3xl border border-navy-header/10 bg-white p-6 text-center text-sm text-slate-600 shadow-soft">
              {serialLookupActive
                ? "לא נמצאה נני עם מספר אישי זה. בדקו את הקוד (למשל AN-1004) או שהפרופיל מפורסם."
                : "לא נמצאו בייביסיטרים התואמים לסינון. נסו להרחיב את החיפוש."}
            </p>
          ) : null}

          {sitters.map((s) => (
            <PublicSitterSearchCardLink key={s.id} sitter={s} />
          ))}
        </section>
      ) : null}
    </main>
  );
}
