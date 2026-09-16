"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, Suspense } from "react";
import { Search } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
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
import { RequiredFieldMark } from "@/components/ui/required-field-mark";
import {
  LONG_PRIMARY_CTA_CLASS,
  LONG_PRIMARY_CTA_ICON_CLASS,
  PARENT_SITTER_SEARCH_CTA_LABEL
} from "@/lib/ui/long-primary-cta";

function ParentSearchContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isLoading, signedIn, effectiveRole, user } = useAuth();
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

  const parentPublicId = (user as any)?.parent_public_id || (user as any)?.user_metadata?.parent_public_id;

  return (
    <MainLayout showBrandHeader={false}>
      <div className="mx-auto w-full max-w-sm overflow-x-hidden bg-[#FDFBF6] pb-8" dir="rtl">
        {showWait ? (
          <p className="text-right text-sm text-slate-600">טוען…</p>
        ) : redirectingToLogin ? (
          <p className="text-right text-sm text-slate-600">מעבירים להתחברות…</p>
        ) : !showContent ? (
          <p className="text-right text-sm text-slate-600">טוען…</p>
        ) : null}

        {showContent ? (
          <div className="space-y-4">
            <header className="text-right">
              <h1 className="text-xl font-bold leading-snug text-[#001F3F]">
                חיפוש מהיר באפליקציה
              </h1>
              <p className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500">
                <RequiredFieldMark />
                <span>שדה חובה</span>
              </p>
              {parentPublicId ? (
                <p className="mt-1.5 text-sm font-medium text-slate-500">
                  מזהה: {parentPublicId}
                </p>
              ) : null}
            </header>

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

            <div className="pt-1">
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
        <MainLayout showBrandHeader={false}>
          <div className="p-4 text-right text-sm text-slate-600">טוען…</div>
        </MainLayout>
      }
    >
      <ParentSearchContent />
    </Suspense>
  );
}