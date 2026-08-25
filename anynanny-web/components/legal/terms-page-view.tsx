"use client";

import { useRouter } from "next/navigation";
import { LegalDocumentPage } from "@/components/legal/legal-document-page";
import { TermsOfServiceDocument } from "@/components/legal/terms-of-service-document";

export function TermsPageView() {
  const router = useRouter();

  const handleBack = () => {
    if (typeof window === "undefined") {
      router.push("/");
      return;
    }

    if (window.history.length > 1) {
      router.back();
      return;
    }

    try {
      const referrer = document.referrer;
      if (referrer) {
        const url = new URL(referrer);
        if (url.origin === window.location.origin) {
          router.push(`${url.pathname}${url.search}${url.hash}` || "/");
          return;
        }
      }
    } catch {
      // Ignore invalid referrer URLs.
    }

    router.push("/");
  };

  return (
    <LegalDocumentPage title="תנאי שימוש" onBack={handleBack}>
      <TermsOfServiceDocument />
    </LegalDocumentPage>
  );
}
