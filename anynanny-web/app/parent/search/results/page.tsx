"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { PublicSitterSearchCardLink } from "@/components/sitter/public-sitter-search-card";
import type { PublicSitterSearchCard } from "@/lib/sitter/sitter-profile";
import {
  defaultParentSearchFilters,
  isSerialTargetedSearch,
  normalizeParentSearchFilters,
  type ParentSearchFilters,
  type ParentSearchMinExperience,
  type ParentSearchMinRating,
  type ParentSearchTransportFilter
} from "@/lib/sitter/parent-search-filters";
import { fetchPublicSitterSearchBySerial, runParentSitterSearch } from "@/lib/sitter/parent-sitter-search";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

function normalizeParentSearchError(error: string | null): string | null {
  if (!error) return null;
  if (/נמצאו\s+\d+\s+מטפלות/.test(error)) return null;
  return error;
}

function parseClockParam(raw: string | null): { hour: string; minute: string } {
  const value = (raw ?? "").trim();
  if (!value) return { hour: "", minute: "" };

  if (value.includes(":")) {
    const [hourPart, minutePart = ""] = value.split(":");
    return {
      hour: hourPart.trim().padStart(2, "0"),
      minute: minutePart.trim().padStart(2, "0")
    };
  }

  return { hour: value.padStart(2, "0"), minute: "" };
}

function readParam(params: URLSearchParams, keys: string[]): string {
  for (const key of keys) {
    const value = params.get(key);
    if (value != null && value.trim() !== "") return value.trim();
  }
  return "";
}

function parseFiltersFromSearchParams(params: URLSearchParams): ParentSearchFilters {
  const startClock = parseClockParam(
    readParam(params, ["startTime", "searchStartTime"]) ||
      (readParam(params, ["searchStartHour"])
        ? `${readParam(params, ["searchStartHour"])}:${readParam(params, ["searchStartMinute"]) || "00"}`
        : "")
  );
  const endClock = parseClockParam(
    readParam(params, ["endTime", "searchEndTime"]) ||
      (readParam(params, ["searchEndHour"])
        ? `${readParam(params, ["searchEndHour"])}:${readParam(params, ["searchEndMinute"]) || "00"}`
        : "")
  );

  const minYearsRaw = readParam(params, ["minYearsExperience", "experience"]);
  const minYearsParsed = minYearsRaw ? Number(minYearsRaw) : 0;
  const minYearsExperience = ([0, 1, 3, 5] as const).includes(minYearsParsed as ParentSearchMinExperience)
    ? (minYearsParsed as ParentSearchMinExperience)
    : 0;

  const minRatingRaw = readParam(params, ["minRating", "rating"]) as ParentSearchMinRating;
  const minRating = (["all", "4.5", "4.0", "3.5"] as const).includes(minRatingRaw) ? minRatingRaw : "all";

  const transportRaw = readParam(params, ["transport"]) as ParentSearchTransportFilter;
  const transport = (["all", "self", "taxi"] as const).includes(transportRaw) ? transportRaw : "all";

  const maxHourlyRaw = readParam(params, ["maxHourlyRate", "maxRate"]);
  const maxHourlyRate = maxHourlyRaw ? Number(maxHourlyRaw) : defaultParentSearchFilters().maxHourlyRate;

  return normalizeParentSearchFilters({
    searchSitterSerial: readParam(params, ["searchSitterSerial", "serial", "searchNannyId"]),
    searchDate: readParam(params, ["date", "searchDate"]),
    searchEndDate: readParam(params, ["endDate", "searchEndDate"]),
    searchStartHour: startClock.hour,
    searchStartMinute: startClock.minute,
    searchEndHour: endClock.hour,
    searchEndMinute: endClock.minute,
    minYearsExperience,
    minRating,
    transport,
    maxHourlyRate: Number.isFinite(maxHourlyRate) ? maxHourlyRate : defaultParentSearchFilters().maxHourlyRate,
    selectedCity: readParam(params, ["city", "selectedCity"]) as ParentSearchFilters["selectedCity"],
    serviceType: readParam(params, ["serviceType", "roleType", "p_service_type"])
  });
}

function ParentSearchResultsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isLoading, signedIn, effectiveRole } = useAuth();

  const filters = useMemo(
    () => parseFiltersFromSearchParams(searchParams),
    [searchParams]
  );

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
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        setSearchError("Supabase לא מוגדר.");
        setSitters([]);
        setListLoading(false);
        return;
      }

      const alreadyLoaded = loadedKeyRef.current === searchKey;
      if (alreadyLoaded && !opts?.force) return;

      const normalized = normalizeParentSearchFilters(filters);

      if (!alreadyLoaded) setListLoading(true);
      setSearchError(null);

      try {
        const { cards, error } = isSerialTargetedSearch(normalized)
          ? await fetchPublicSitterSearchBySerial(supabase, normalized.searchSitterSerial)
          : await runParentSitterSearch(supabase, normalized);

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
    [filters, searchKey]
  );

  const authSettled = !isLoading;
  const showContent = authSettled && signedIn && effectiveRole === "parent";
  const serialLookupActive = isSerialTargetedSearch(normalizeParentSearchFilters(filters));
  const visibleSearchError = serialLookupActive ? null : searchError;

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
          href="/parent/search"
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
                <p className="text-right text-xs text-rose-700">{visibleSearchError}</p>
              ) : null}

              {sitters.length === 0 && !visibleSearchError ? (
                <p className="rounded-3xl border border-navy-header/10 bg-white p-6 text-center text-sm text-slate-600 shadow-soft">
                  {serialLookupActive
                    ? "לא נמצאה נני עם מספר אישי זה. בדקו את הקוד או שהפרופיל מפורסם."
                    : "לא נמצאו בייביסיטרים התואמים לסינון. נסו להרחיב את החיפוש."}
                </p>
              ) : null}

              {sitters.map((s) => (
                <PublicSitterSearchCardLink key={s.id} sitter={s} />
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