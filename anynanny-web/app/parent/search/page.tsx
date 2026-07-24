"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, Suspense } from "react";
import { Search, Baby, Sparkles, Moon } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { MainLayout } from "@components/layout/MainLayout";
import { ParentSearchFiltersBar } from "@/components/parent/parent-search-filters";
import {
  defaultParentSearchFilters,
  normalizeParentSearchFilters,
  PARENT_SEARCH_MAX_HOURLY_SLIDER,
  type ParentSearchFilters
} from "@/lib/sitter/parent-search-filters";

type ServiceType = "sitter" | "lactation" | "sleep";

function buildResultsSearchParams(filters: ParentSearchFilters, serviceType: ServiceType): string {
  const safe = normalizeParentSearchFilters(filters);
  const params = new URLSearchParams();

  params.set("roleType", serviceType);

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

  if (safe.maxHourlyRate < PARENT_SEARCH_MAX_HOURLY_SLIDER) {
    params.set("maxHourlyRate", String(safe.maxHourlyRate));
  }

  const query = params.toString();
  return query ? `/parent/search/results?${query}` : "/parent/search/results";
}

function ParentSearchContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isLoading, signedIn, effectiveRole, user } = useAuth();
  const [draftFilters, setDraftFilters] = useState<ParentSearchFilters>(() => defaultParentSearchFilters());
  const [serviceType, setServiceType] = useState<ServiceType>("sitter");
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
    router.push(buildResultsSearchParams(filters, serviceType));
  }, [draftFilters, serviceType, router]);

  const authSettled = !isLoading;
  const showContent = authSettled && signedIn && effectiveRole === "parent";
  const showWait = !authSettled || (signedIn && effectiveRole === null);
  const redirectingToLogin = authSettled && !signedIn;

  const parentPublicId = (user as any)?.parent_public_id || (user as any)?.user_metadata?.parent_public_id;

  const getSearchButtonLabel = () => {
    if (navigating) return "מעבירים לתוצאות…";
    if (serviceType === "lactation") return "חפש יועצת הנקה";
    if (serviceType === "sleep") return "חפש יועצת שינה";
    return "חפש בייביסיטר";
  };

  return (
    <MainLayout>
      <div dir="rtl" className="pt-3 px-1">
        {showWait ? (
          <p className="text-right text-sm text-slate-600">טוען…</p>
        ) : redirectingToLogin ? (
          <p className="text-right text-sm text-slate-600">מעבירים להתחברות…</p>
        ) : !showContent ? (
          <p className="text-right text-sm text-slate-600">טוען…</p>
        ) : null}

        {showContent ? (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2 justify-between w-full px-1">
              <h1 className="text-xl font-black text-navy-header tracking-tight">
                שלום! מה תרצה לעשות היום?
              </h1>
              {parentPublicId && (
                <span className="inline-flex items-center gap-1 bg-purple-50 text-purple-700 text-[10px] font-bold px-2 py-0.5 rounded-lg border border-purple-100 shadow-xs">
                  מזהה: {parentPublicId}
                </span>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 mr-1">סוג השירות המבוקש:</label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setServiceType("sitter")}
                  className={`flex flex-col items-center justify-center p-3 rounded-2xl border text-center transition-all duration-200 active:scale-95 ${
                    serviceType === "sitter"
                      ? "border-[#FF8A8A] bg-[#FF8A8A]/10 text-[#FF8A8A] font-bold shadow-sm ring-1 ring-[#FF8A8A]/30"
                      : "border-slate-100 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <Baby className={`h-5 w-5 mb-1 ${serviceType === "sitter" ? "text-[#FF8A8A]" : "text-slate-400"}`} />
                  <span className="text-xs tracking-tight">בייביסיטר</span>
                </button>

                <button
                  type="button"
                  onClick={() => setServiceType("lactation")}
                  className={`flex flex-col items-center justify-center p-3 rounded-2xl border text-center transition-all duration-200 active:scale-95 ${
                    serviceType === "lactation"
                      ? "border-emerald-500 bg-emerald-50 text-emerald-800 font-bold shadow-sm ring-1 ring-emerald-500/30"
                      : "border-slate-100 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <Sparkles className={`h-5 w-5 mb-1 ${serviceType === "lactation" ? "text-emerald-600" : "text-slate-400"}`} />
                  <span className="text-xs tracking-tight">יועצת הנקה</span>
                </button>

                <button
                  type="button"
                  onClick={() => setServiceType("sleep")}
                  className={`flex flex-col items-center justify-center p-3 rounded-2xl border text-center transition-all duration-200 active:scale-95 ${
                    serviceType === "sleep"
                      ? "border-indigo-500 bg-indigo-50 text-indigo-900 font-bold shadow-sm ring-1 ring-indigo-500/30"
                      : "border-slate-100 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <Moon className={`h-5 w-5 mb-1 ${serviceType === "sleep" ? "text-indigo-600" : "text-slate-400"}`} />
                  <span className="text-xs tracking-tight">יועצת שינה</span>
                </button>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-1">
              <ParentSearchFiltersBar
                filters={draftFilters}
                onChange={(next) => setDraftFilters(normalizeParentSearchFilters(next))}
              />
            </div>

            <div className="pt-2">
              <button
                type="button"
                disabled={navigating}
                onClick={handleSearch}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#001F3F] py-3.5 text-sm font-bold text-white shadow-soft transition hover:brightness-105 active:scale-[0.99] disabled:opacity-60"
              >
                <Search className="h-4 w-4" aria-hidden />
                {getSearchButtonLabel()}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </MainLayout>
  );
}

export default function ParentSearchPage() {
  return (
    <Suspense fallback={<MainLayout><div className="p-4 text-right text-sm text-slate-600">טוען…</div></MainLayout>}>
      <ParentSearchContent />
    </Suspense>
  );
}