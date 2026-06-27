"use client";

import { ArrowRight } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { TermsOfServiceDocument } from "@/components/legal/terms-of-service-document";

function TermsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get("from");

  const handleBack = () => {
    if (from && from.startsWith("/") && !from.startsWith("//")) {
      router.push(from);
      return;
    }
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push("/");
  };

  return (
    <main
      className="mx-auto flex h-full min-h-0 w-full min-w-0 max-w-md flex-col bg-[#FDFBF6]"
      dir="rtl"
      suppressHydrationWarning
    >
      <header className="sticky top-0 z-10 flex shrink-0 items-center justify-between gap-3 border-b border-navy-header/10 bg-white/95 px-4 py-3 shadow-sm backdrop-blur-sm">
        <button
          type="button"
          onClick={handleBack}
          className="inline-flex items-center gap-1.5 rounded-full border border-navy-header/20 bg-white px-3 py-1.5 text-xs font-semibold text-navy-header shadow-sm transition hover:bg-[#FDFBF6] active:scale-[0.98]"
          aria-label="חזרה"
        >
          <ArrowRight className="h-4 w-4" aria-hidden />
          חזרה
        </button>
        <p className="text-sm font-bold text-navy-header">תנאי שימוש</p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 pb-10">
        <TermsOfServiceDocument />
      </div>
    </main>
  );
}

export function TermsPageView() {
  return (
    <Suspense
      fallback={
        <main
          className="mx-auto flex h-full min-h-0 w-full max-w-md items-center justify-center bg-[#FDFBF6] py-16 text-sm text-slate-600"
          dir="rtl"
        >
          טוען…
        </main>
      }
    >
      <TermsPageInner />
    </Suspense>
  );
}
