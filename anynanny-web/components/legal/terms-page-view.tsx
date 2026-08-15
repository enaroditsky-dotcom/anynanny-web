"use client";

import { LegalDocumentPage } from "@/components/legal/legal-document-page";
import { TermsOfServiceDocument } from "@/components/legal/terms-of-service-document";

export function TermsPageView() {
  return (
    <LegalDocumentPage title="תנאי שימוש">
      <TermsOfServiceDocument />
    </LegalDocumentPage>
  );
}
