"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Search } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { MainLayout } from "@components/layout/MainLayout";
import { ParentSearchFiltersBar } from "@/components/parent/parent-search-filters";
import {
  defaultParentSearchFilters,
  normalizeParentSearchFilters,
  PARENT_SEARCH_MAX_HOURLY_SLIDER,
  type ParentSearchFilters
} from "@/lib/sitter/parent-search-filters";

function buildResultsSearchParams(filters: ParentSearchFilters): string {
  const safe = normalizeParentSearchFilters(filters);
  const params = new URLSearchParams();

  const serial = safe.searchSitterSerial.trim();
  if (serial) params.set("serial", serial);

  if (safe.selectedCity) params.set("city", safe.selectedCity);
  if (safe.searchDate) params.set("date", safe.searchDate);
  if (safe.searchEndDate) params.set("endDate", safe.searchEndDate);

  if (safe.searchStartHour.trim()) {
    const hour = safe.searchStartHour.padStart(2, "0");
    const minute = (safe.searchStartMinute || "00").padStart(2, "0");
    params.set("startTime", `${hour}:${minute}`);
  }

  if (safe.searchEndHour.trim()) {
    const hour = safe.searchEndHour.padStart(2, "0");
    const minute = (safe.searchEndMinute || "00").padStart(2, "0");
    params.set("endTime", `${hour}:${minute}`);
  }

  if (safe.minYearsExperience > 0) {
    params.set("minYearsExperience", String(safe.minYearsExperience));
  }

  if (safe.minRating !== "all") {
    params.set("minRating", safe.minRating);
  }

  if (safe.transport !== "all") {
    params.set("transport", safe.transport);
  }

  if (safe.maxHourlyRate < PARENT_SEARCH_MAX_HOURLY_SLIDER) {
    params.set("maxHourlyRate", String(safe.maxHourlyRate));
  }

  const query = params.toString();
  return query ? `/parent/search/results?${query}` : "/parent/search/results";
}

export default function ParentSearchPage() {
  const router = useRouter();
  // חילצנו את המידע על ה-user המחובר מה-Auth Provider
  const { isLoading, signedIn, effectiveRole, user } = useAuth();
  const [draftFilters, setDraftFilters] = useState<ParentSearchFilters>(() => defaultParentSearchFilters());
  const [navigating, setNavigating] = useState(false);

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

  const handleSearch = useCallback(() => {
    const filters = normalizeParentSearchFilters(draftFilters);
    setNavigating(true);
    router.push(buildResultsSearchParams(filters));
  }, [draftFilters, router]);

  const authSettled = !isLoading;
  const showContent = authSettled && signedIn && effectiveRole === "parent";
  const showWait = !authSettled || (signedIn && effectiveRole === null);
  const redirectingToLogin = authSettled && !signedIn;

  // חילוץ המזהה החדש מהפרופיל של ה-user המחובר (אם קיים בפרטי ה-user או ה-metadata)
  const parentPublicId = (user as any)?.parent_public_id || (user as any)?.user_metadata?.parent_public_id;

  return (
    <MainLayout>
      <div dir="rtl" className="pt-3">
        {showWait ? (
          <p className="text-right text-sm text-slate-600">טוען…</p>
        ) : redirectingToLogin ? (
          <p className="text-right text-sm text-slate-600">מעבירים להתחברות…</p>
        ) : !showContent ? (
          <p className="text-right text-sm text-slate-600">טוען…</p>
        ) : null}

        {showContent ? (
          <div className="space-y-4">
            
            {/* 👑 הברכה והמזהה המעוצב בול כמו אצל הנני */}
            <div className="flex flex-wrap items-center gap-2 mb-2 justify-start w-full px-1">
              <h1 className="text-xl font-bold text-gray-800">
                שלום! מה תרצה לעשות היום?
              </h1>
              
              {/* 🆔 תג המזהה הסגול להורה */}
              {parentPublicId && (
                <span className="inline-flex items-center gap-1 bg-purple-50 text-purple-700 text-xs font-semibold px-2.5 py-1 rounded-lg border border-purple-100 shadow-sm">
                  <span className="text-[10px] bg-purple-200 text-purple-800 px-1 rounded uppercase font-bold">ID</span>
                  מזהה: {parentPublicId}
                </span>
              )}
            </div>

            <ParentSearchFiltersBar
              filters={draftFilters}
              onChange={(next) => setDraftFilters(normalizeParentSearchFilters(next))}
            />

            <div className="pt-2">
              <button
                type="button"
                disabled={navigating}
                onClick={handleSearch}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#001F3F] py-3.5 text-sm font-bold text-white shadow-soft transition hover:brightness-105 active:scale-[0.99] disabled:opacity-60"
              >
                <Search className="h-4 w-4" aria-hidden />
                {navigating ? "מעבירים לתוצאות…" : "חפש בייביסיטר"}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </MainLayout>
  );
}