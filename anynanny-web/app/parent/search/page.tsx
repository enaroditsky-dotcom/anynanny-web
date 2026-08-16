"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, Suspense } from "react";
import { Search } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { MainLayout } from "@components/layout/MainLayout";
import { ParentSearchFiltersBar } from "@/components/parent/parent-search-filters";
import {
  defaultParentSearchFilters,
  normalizeParentSearchFilters,
  parentSearchResultsPath,
  type ParentSearchFilters
} from "@/lib/sitter/parent-search-filters";
import {
  validateParentSearchCriteria,
  type ParentSearchMandatoryField
} from "@/lib/sitter/parent-search-validation";

function ParentSearchContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isLoading, signedIn, effectiveRole, user } = useAuth();
  const [draftFilters, setDraftFilters] = useState<ParentSearchFilters>(() => defaultParentSearchFilters());
  const [navigating, setNavigating] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [invalidFields, setInvalidFields] = useState<ParentSearchMandatoryField[]>([]);

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
    const criteria = validateParentSearchCriteria(filters);
    if (!criteria.ok) {
      setSearchError(criteria.error);
      setInvalidFields(criteria.missing);
      setNavigating(false);
      return;
    }

    setSearchError(null);
    setInvalidFields([]);
    setNavigating(true);
    router.push(parentSearchResultsPath(filters));
  }, [draftFilters, router]);

  const authSettled = !isLoading;
  const showContent = authSettled && signedIn && effectiveRole === "parent";
  const showWait = !authSettled || (signedIn && effectiveRole === null);
  const redirectingToLogin = authSettled && !signedIn;

  const parentPublicId = (user as any)?.parent_public_id || (user as any)?.user_metadata?.parent_public_id;

  return (
    <MainLayout showBrandHeader={false}>
      <div className="mx-auto w-full max-w-md overflow-x-hidden bg-[#FDFBF6] px-1 pb-8" dir="rtl">
        {showWait ? (
          <p className="text-center text-sm text-slate-600">טוען…</p>
        ) : redirectingToLogin ? (
          <p className="text-center text-sm text-slate-600">מעבירים להתחברות…</p>
        ) : !showContent ? (
          <p className="text-center text-sm text-slate-600">טוען…</p>
        ) : null}

        {showContent ? (
          <div className="space-y-6">
            <header className="space-y-2.5 px-1 pt-1 text-center sm:pt-2">
              <h1 className="text-center text-[26px] font-extrabold leading-[1.2] tracking-tight text-[#001F3F] sm:text-[28px]">
                חיפוש מהיר באפליקציה
              </h1>
              {parentPublicId ? (
                <p className="inline-flex items-center gap-1 rounded-lg border border-purple-100 bg-purple-50 px-2 py-0.5 text-[10px] font-bold text-purple-700">
                  מזהה: {parentPublicId}
                </p>
              ) : null}
            </header>

            <div className="rounded-[1.5rem] border border-[#001F3F]/10 bg-white/75 p-3.5 shadow-[0_2px_12px_rgba(0,31,63,0.06)]">
              <ParentSearchFiltersBar
                filters={draftFilters}
                invalidFields={invalidFields}
                onChange={(next) => {
                  setDraftFilters(normalizeParentSearchFilters(next));
                  if (searchError) setSearchError(null);
                  if (invalidFields.length > 0) setInvalidFields([]);
                }}
              />
            </div>

            {searchError ? (
              <p
                className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-right text-xs text-rose-900"
                role="alert"
              >
                {searchError}
              </p>
            ) : null}

            <div className="pb-4 pt-1">
              <button
                type="button"
                disabled={navigating}
                onClick={handleSearch}
                className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-[#001F3F] py-4 text-[17px] font-extrabold text-white shadow-[0_4px_14px_rgba(0,31,63,0.22)] transition hover:brightness-105 active:scale-[0.99] disabled:opacity-60"
              >
                <Search className="h-5 w-5" aria-hidden />
                חפש בייביסיטר
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
        <MainLayout showBrandHeader={false}>
          <div className="p-4 text-right text-sm text-slate-600">טוען…</div>
        </MainLayout>
      }
    >
      <ParentSearchContent />
    </Suspense>
  );
}