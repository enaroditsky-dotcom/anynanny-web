"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, Suspense } from "react";
import { Search } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { AuthRetryStatus } from "@/lib/auth/use-online-retry-nonce";
import { MainLayout } from "@components/layout/MainLayout";
import { ParentSearchFiltersBar } from "@/components/parent/parent-search-filters";
import {
  normalizeParentSearchFilters,
  parentSearchResultsPath,
  parseFiltersFromSearchParams,
  type ParentSearchFilters
} from "@/lib/sitter/parent-search-filters";
import {
  validateParentSearchCriteria,
  type ParentSearchMandatoryField
} from "@/lib/sitter/parent-search-validation";
import { LongPrimaryCtaContent } from "@/components/ui/long-primary-cta";
import {
  LONG_PRIMARY_CTA_CLASS,
  LONG_PRIMARY_CTA_ICON_CLASS,
  PARENT_SITTER_SEARCH_CTA_LABEL
} from "@/lib/ui/long-primary-cta";

function ParentSearchContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isLoading, signedIn, effectiveRole, authRetryExhausted, retryAuthentication } = useAuth();
  const searchQuery = searchParams.toString();
  const [draftFilters, setDraftFilters] = useState<ParentSearchFilters>(() =>
    parseFiltersFromSearchParams(searchParams)
  );
  const [navigating, setNavigating] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [invalidFields, setInvalidFields] = useState<ParentSearchMandatoryField[]>([]);

  useEffect(() => {
    setDraftFilters(parseFiltersFromSearchParams(new URLSearchParams(searchQuery)));
  }, [searchQuery]);

  useEffect(() => {
    if (isLoading) return;
    if (!signedIn) {
      const nextPath = searchQuery ? `/parent/search?${searchQuery}` : "/parent/search";
      router.replace(`/auth/login?next=${encodeURIComponent(nextPath)}`);
      return;
    }
    if (effectiveRole === "sitter") {
      router.replace("/sitter/dashboard");
    }
  }, [isLoading, signedIn, effectiveRole, router, searchQuery]);

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

  return (
    <MainLayout showBrandHeader={false} surfaceClassName="parent-search-surface">
      <div className="w-full" dir="rtl">
        {showWait ? (
          authRetryExhausted && !signedIn ? (
            <AuthRetryStatus exhausted onRetry={() => void retryAuthentication()} pending="טוען…" />
          ) : (
            <p className="text-right text-sm text-slate-600">טוען…</p>
          )
        ) : redirectingToLogin ? (
          <p className="text-right text-sm text-slate-600">מעבירים להתחברות…</p>
        ) : !showContent ? (
          <p className="text-right text-sm text-slate-600">טוען…</p>
        ) : null}

        {showContent ? (
          <div className="space-y-1">
            <header className="text-center">
              <h1 className="text-xl font-bold leading-tight text-[#001F3F]">
                חיפוש מהיר באפליקציה
              </h1>
            </header>
            <p
              className="flex w-full flex-row items-center justify-end text-[13px] font-medium leading-none text-[#C44747]"
              dir="ltr"
            >
              <span>שדות חובה</span>
              <span aria-hidden="true">{"\u00a0-\u00a0"}</span>
              <span aria-hidden="true">*</span>
            </p>

            <ParentSearchFiltersBar
              filters={draftFilters}
              invalidFields={invalidFields}
              onChange={(next) => {
                setDraftFilters(normalizeParentSearchFilters(next));
                if (searchError) setSearchError(null);
                if (invalidFields.length > 0) setInvalidFields([]);
              }}
            />

            {searchError ? (
              <p
                className="rounded-2xl border border-rose-200/80 bg-white px-4 py-3 text-right text-sm text-rose-900 shadow-soft"
                role="alert"
              >
                {searchError}
              </p>
            ) : null}

            <div>
              <button
                type="button"
                disabled={navigating}
                onClick={handleSearch}
                className={LONG_PRIMARY_CTA_CLASS}
              >
                <LongPrimaryCtaContent icon={<Search className={LONG_PRIMARY_CTA_ICON_CLASS} />}>
                  {PARENT_SITTER_SEARCH_CTA_LABEL}
                </LongPrimaryCtaContent>
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
        <MainLayout showBrandHeader={false} surfaceClassName="parent-search-surface">
          <div className="p-4 text-right text-sm text-slate-600">טוען…</div>
        </MainLayout>
      }
    >
      <ParentSearchContent />
    </Suspense>
  );
}