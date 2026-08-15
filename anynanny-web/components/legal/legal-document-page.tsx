"use client";

import type { ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { PageBackButton, PageBackRow } from "@/components/navigation/page-back-link";

function LegalDocumentPageInner({
  title,
  children
}: {
  title: string;
  children: ReactNode;
}) {
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
      <header className="sticky top-0 z-10 shrink-0 space-y-2 border-b border-navy-header/10 bg-white/95 px-4 py-3 shadow-sm backdrop-blur-sm">
        <PageBackRow>
          <PageBackButton onClick={handleBack} />
        </PageBackRow>
        <p className="text-right text-sm font-bold text-navy-header">{title}</p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 pb-10">{children}</div>
    </main>
  );
}

export function LegalDocumentPage({
  title,
  children
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex min-h-[40vh] w-full max-w-md items-center justify-center bg-[#FDFBF6]" dir="rtl">
          <p className="text-sm text-slate-600">טוען…</p>
        </main>
      }
    >
      <LegalDocumentPageInner title={title}>{children}</LegalDocumentPageInner>
    </Suspense>
  );
}
