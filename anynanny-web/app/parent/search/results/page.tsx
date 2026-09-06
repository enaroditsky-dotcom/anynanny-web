"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { PublicSitterSearchCardLink } from "@/components/sitter/public-sitter-search-card";
import type { PublicSitterSearchCard } from "@/lib/sitter/sitter-profile";
import {
  isSerialTargetedSearch,
  normalizeParentSearchFilters,
  parentSearchFiltersPath,
  parseFiltersFromSearchParams
} from "@/lib/sitter/parent-search-filters";
import { validateParentSearchCriteria } from "@/lib/sitter/parent-search-validation";
import { runParentSitterSearch } from "@/lib/sitter/parent-sitter-search";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

function normalizeParentSearchError(error: string | null): string | null {
  if (!error) return null;
  if (/נמצאו\s+\d+\s+מטפלות/.test(error)) return null;
  return error;
}

function ParentSearchResultsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isLoading, signedIn, effectiveRole } = useAuth();

  const searchQuery = searchParams.toString();

  const filters = useMemo(
    () => parseFiltersFromSearchParams(searchParams),
    [searchParams]
  );

  const criteria = useMemo(() => validateParentSearchCriteria(filters), [filters]);

  const searchKey = useMemo(
    () => JSON.stringify(normalizeParentSearchFilters(filters)),
    [filters]
  );

  const [sitters, setSitters] = useState<PublicSitterSearchCard[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [searchError, setSearchError] = useState<string | null>(null);

  const loadedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (isLoading) return;
    if (!signedIn) {
      router.replace("/auth/login?next=/parent/search/results");
      return;
    }
    if (effectiveRole === "sitter") {
      router.replace("/sitter/dashboard");
    }
  }, [isLoading, signedIn, effectiveRole, router]);

  const runSearch = useCallback(
    async (opts?: { force?: boolean }) => {
      if (!criteria.ok) {
        setSitters([]);
        setSearchError(criteria.error);
        setListLoading(false);
        loadedKeyRef.current = null;
        return;
      }

      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        setSearchError("Supabase לא מוגדר.");
        setSitters([]);
        setListLoading(false);
        return;
      }

      const alreadyLoaded = loadedKeyRef.current === searchKey;
      if (alreadyLoaded && !opts?.force) return;

      const normalized = criteria.filters;

      if (!alreadyLoaded) setListLoading(true);
      setSearchError(null);

      try {
        const { cards, error } = await runParentSitterSearch(supabase, normalized);

        if (error) {
          console.warn("[parent/search/results] search error:", error);
          setSearchError(normalizeParentSearchError(error));
          setSitters([]);
          loadedKeyRef.current = null;
          return;
        }

        setSearchError(null);
        setSitters(cards);
        loadedKeyRef.current = searchKey;
      } catch (error) {
        console.warn("[parent/search/results] search threw:", error);
        setSearchError(null);
        setSitters([]);
        loadedKeyRef.current = null;
      } finally {
        setListLoading(false);
      }
    },
    [criteria, searchKey]
  );

  const authSettled = !isLoading;
  const showContent = authSettled && signedIn && effectiveRole === "parent";
  const serialLookupActive = isSerialTargetedSearch(normalizeParentSearchFilters(filters));
  const visibleSearchError = criteria.ok && serialLookupActive ? null : searchError;

  useEffect(() => {
    if (!showContent) return;
    void runSearch();
  }, [runSearch, showContent]);

  const showWait = !authSettled || (signedIn && effectiveRole === null);
  const redirectingToLogin = authSettled && !signedIn;

  return (
    <main className="mx-auto w-full max-w-md space-y-4 bg-[#FDFBF6] py-2 pb-24" dir="rtl">
      <div className="px-1">
        <Link
          href={parentSearchFiltersPath(filters)}
          className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-navy-header/15 bg-white px-4 py-3.5 text-sm font-bold text-[#001F3F] shadow-soft transition hover:border-navy-header/25 hover:bg-brand-cream active:scale-[0.99]"
        >
          <span aria-hidden>←</span>
          חזרה לשינוי תנאי החיפוש
        </Link>
      </div>

      {showWait ? (
        <p className="px-1 text-right text-sm text-slate-600">טוען…</p>
      ) : redirectingToLogin ? (
        <p className="px-1 text-right text-sm text-slate-600">מעבירים להתחברות…</p>
      ) : !showContent ? (
        <p className="px-1 text-right text-sm text-slate-600">טוען…</p>
      ) : null}

      {showContent ? (
        <>
          <header className="space-y-1 px-1 text-right">
            <h1 className="text-xl font-bold text-[#001F3F]">
              {filters.serviceType === "lactation_consultant"
                ? "יועצות הנקה זמינות"
                : filters.serviceType === "sleep_consultant"
                  ? "יועצות שינה זמינות"
                  : filters.serviceType === "doula"
                    ? "דולות זמינות"
                    : "בייביסיטריות זמינות"}
            </h1>
            {!listLoading && !visibleSearchError && !serialLookupActive && sitters.length > 0 ? (
              <p className="text-xs text-slate-600">ממוינים לפי דירוג ממוצע (גבוה קודם).</p>
            ) : null}
          </header>

          {listLoading ? (
            <p className="px-1 text-right text-sm text-slate-600">טוען תוצאות…</p>
          ) : (
            <section className="space-y-3 px-1">
              {visibleSearchError ? (
                <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-right text-sm text-rose-900">
                  {visibleSearchError}
                </p>
              ) : null}

              {sitters.length === 0 && !visibleSearchError ? (
                <p className="rounded-3xl border border-navy-header/10 bg-white p-6 text-center text-sm text-slate-600 shadow-soft">
                  {serialLookupActive
                    ? "לא נמצאה בייביסיטר פנויה עם מספר אישי זה לשעות שבחרת."
                    : "לא נמצאו בייביסיטרים פנויים לשעות שבחרת. נסו שעות אחרות או בייביסיטר אחרת."}
                </p>
              ) : null}

              {sitters.map((s) => (
                <PublicSitterSearchCardLink key={s.id} sitter={s} query={searchQuery} />
              ))}
            </section>
          )}
        </>
      ) : null}
    </main>
  );
}

export default function ParentSearchResultsPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto w-full max-w-md bg-[#FDFBF6] px-1 py-6 text-right text-sm text-slate-600" dir="rtl">
          טוען תוצאות…
        </main>
      }
    >
      <ParentSearchResultsInner />
    </Suspense>
  );
}