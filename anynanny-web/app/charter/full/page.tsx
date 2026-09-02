"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { CharterFullDocument } from "@/components/charter/charter-full-document";
import { LegalDocumentPage } from "@/components/legal/legal-document-page";
import { getCharterDocument } from "@/lib/charter/content";
import { isCharterType } from "@/lib/charter/versions";

function CharterFullInner() {
  const searchParams = useSearchParams();
  const role = searchParams.get("role");
  const type = isCharterType(role) ? role : null;

  if (!type) {
    return (
      <main className="mx-auto flex min-h-[40vh] w-full max-w-md items-center justify-center bg-[#FDFBF6]" dir="rtl">
        <p className="text-sm text-slate-600">לא נבחרה אמנה להצגה.</p>
      </main>
    );
  }

  const doc = getCharterDocument(type);

  return (
    <LegalDocumentPage title={doc.title}>
      <CharterFullDocument type={type} />
    </LegalDocumentPage>
  );
}

export default function CharterFullPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex min-h-[40vh] w-full max-w-md items-center justify-center bg-[#FDFBF6]" dir="rtl">
          <p className="text-sm text-slate-600">טוענים…</p>
        </main>
      }
    >
      <CharterFullInner />
    </Suspense>
  );
}
