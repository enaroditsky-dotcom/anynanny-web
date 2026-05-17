"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Search } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { ParentSearchFiltersBar } from "@/components/parent/parent-search-filters";
import { PublicSitterSearchCardLink } from "@/components/sitter/public-sitter-search-card";
import type { PublicSitterSearchCard } from "@/lib/sitter/sitter-profile";
import {
  buildSearchEndTimeIso,
  buildSearchStartTimeIso,
  defaultParentSearchFilters,
  isInvalidParentSearchTimeRange,
  minRatingToRpcValue,
  normalizeParentSearchFilters,
  searchNannyIdToRpcParam,
  type ListPublicSittersSearchRpcParams,
  type ParentSearchFilters
} from "@/lib/sitter/parent-search-filters";
import { parsePublicSearchCards } from "@/lib/sitter/public-search-card";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export default function ParentSearchPage() {
  const router = useRouter();
  const { isLoading, signedIn, effectiveRole } = useAuth();
  /** Form state — changes do not hit the database until search is clicked. */
  const [draftFilters, setDraftFilters] = useState<ParentSearchFilters>(() => defaultParentSearchFilters());
  const [listErr, setListErr] = useState<string | null>(null);
  const [sitters, setSitters] = useState<PublicSitterSearchCard[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

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
    const activeFilters = normalizeParentSearchFilters(draftFilters);
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setListErr("Supabase לא מוגדר.");
      setSitters([]);
      setHasSearched(true);
      return;
    }
    const filters = activeFilters;
    const p_start_time = buildSearchStartTimeIso(filters);
    const p_end_time = buildSearchEndTimeIso(filters);

    if (isInvalidParentSearchTimeRange(p_start_time, p_end_time)) {
      setListErr("שעת הסיום חייבת להיות אחרי שעת ההתחלה.");
      setSitters([]);
      setHasSearched(true);
      return;
    }

    const rpcParams: ListPublicSittersSearchRpcParams = {
      p_search_nanny_id: searchNannyIdToRpcParam(filters.searchNannyId),
      p_start_time,
      p_end_time,
      p_min_years_experience: filters.minYearsExperience,
      p_min_rating: minRatingToRpcValue(filters.minRating),
      p_transport: filters.transport,
      p_max_hourly_rate: filters.maxHourlyRate
    };

    setListLoading(true);
    setListErr(null);
    setHasSearched(true);
    const { data, error } = await supabase.rpc("list_public_sitters_search", rpcParams);
    setListLoading(false);
    if (error) {
      setListErr(error.message);
      setSitters([]);
      return;
    }
    setSitters(parsePublicSearchCards(data));
  }, [draftFilters]);

  const authSettled = !isLoading;
  const showContent = authSettled && signedIn && effectiveRole === "parent";
  const showWait = !authSettled || (signedIn && effectiveRole === null);
  const redirectingToLogin = authSettled && !signedIn;

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

      {showContent && listErr ? (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-right text-sm text-amber-950">
          לא ניתן לטעון רשימה ({listErr}). ודאו שהמיגרציה `20260516150000_list_public_sitters_time_range` הורצה ב-Supabase.
        </p>
      ) : null}

      {showContent && hasSearched && !listLoading && !listErr ? (
        <p className="px-1 text-right text-xs text-slate-600">ממוינים לפי דירוג ממוצע (גבוה קודם).</p>
      ) : null}

      {showContent && !hasSearched && !listLoading ? (
        <p className="rounded-2xl border border-navy-header/10 bg-white px-4 py-6 text-center text-sm text-slate-600 shadow-soft">
          הגדירו את הסינון ולחצו «חפש בייביסיטר» כדי לראות תוצאות.
        </p>
      ) : null}

      {showContent && hasSearched && !listLoading ? (
        <section className="space-y-3 px-1">
          {sitters.length === 0 && !listErr ? (
            <p className="rounded-3xl border border-navy-header/10 bg-white p-6 text-center text-sm text-slate-600 shadow-soft">
              לא נמצאו בייביסיטרים התואמים לסינון. נסו להרחיב את החיפוש.
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
