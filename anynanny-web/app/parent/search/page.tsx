"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, Suspense } from "react";
import { Search } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { MainLayout } from "@components/layout/MainLayout";
import { ParentSearchFiltersBar } from "@/components/parent/parent-search-filters";
import {
  EXPERT_SERVICE_OPTIONS,
  EXPERT_SERVICE_VISUALS,
  type ExpertServiceKind
} from "@/components/sitter/expert-service-icons";
import {
  defaultParentSearchFilters,
  normalizeParentSearchFilters,
  normalizeParentSearchServiceType,
  type ParentSearchFilters
} from "@/lib/sitter/parent-search-filters";

function buildResultsSearchParams(filters: ParentSearchFilters, serviceType: ExpertServiceKind): string {
  const safe = normalizeParentSearchFilters({
    ...filters,
    serviceType: normalizeParentSearchServiceType(serviceType)
  });
  const params = new URLSearchParams();

  params.set("roleType", EXPERT_SERVICE_VISUALS[safe.serviceType].alias);
  params.set("serviceType", safe.serviceType);

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

  if (safe.maxHourlyRate != null) {
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
  const [serviceType, setServiceType] = useState<ExpertServiceKind>("babysitter");
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

  useEffect(() => {
    const fromUrl = searchParams.get("serviceType") || searchParams.get("roleType");
    if (fromUrl) setServiceType(normalizeParentSearchServiceType(fromUrl));
  }, [searchParams]);

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
    if (serviceType === "lactation_consultant") return "חפש יועצת הנקה";
    if (serviceType === "sleep_consultant") return "חפש יועצת שינה";
    if (serviceType === "doula") return "חפש דולה";
    return "חפש בייביסיטר";
  };

  return (
    <MainLayout>
      <div className="mx-auto w-full max-w-md space-y-4 bg-[#FDFBF6] py-2 pb-8" dir="rtl">
        {showWait ? (
          <p className="text-center text-sm text-slate-600">טוען…</p>
        ) : redirectingToLogin ? (
          <p className="text-center text-sm text-slate-600">מעבירים להתחברות…</p>
        ) : !showContent ? (
          <p className="text-center text-sm text-slate-600">טוען…</p>
        ) : null}

        {showContent ? (
          <div className="space-y-5">
            <header className="space-y-2 px-1 text-center">
              <h1 className="text-xl font-black tracking-tight text-navy-header sm:text-2xl">
                חיפוש מהיר באפליקציה
              </h1>
              {parentPublicId ? (
                <p className="inline-flex items-center gap-1 rounded-lg border border-purple-100 bg-purple-50 px-2 py-0.5 text-[10px] font-bold text-purple-700">
                  מזהה: {parentPublicId}
                </p>
              ) : null}
            </header>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label="סוג השירות">
              {EXPERT_SERVICE_OPTIONS.map((kind) => {
                const visual = EXPERT_SERVICE_VISUALS[kind];
                const Icon = visual.Icon;
                const selected = serviceType === kind;
                return (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => setServiceType(kind)}
                    aria-pressed={selected}
                    className={`flex flex-col items-center justify-center rounded-2xl border p-3 text-center transition-all duration-200 active:scale-95 ${
                      selected
                        ? visual.selectedClass
                        : "border-slate-100 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <Icon
                      className={`mb-1 h-5 w-5 ${selected ? visual.iconClass : "text-slate-400"}`}
                      aria-hidden
                    />
                    <span className="text-[11px] tracking-tight sm:text-xs">{visual.labelHe}</span>
                  </button>
                );
              })}
            </div>

            <div className="rounded-2xl bg-white p-1">
              <ParentSearchFiltersBar
                filters={draftFilters}
                onChange={(next) => setDraftFilters(normalizeParentSearchFilters(next))}
              />
            </div>

            <div className="pb-4 pt-2">
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
    <Suspense
      fallback={
        <MainLayout>
          <div className="p-4 text-right text-sm text-slate-600">טוען…</div>
        </MainLayout>
      }
    >
      <ParentSearchContent />
    </Suspense>
  );
}
