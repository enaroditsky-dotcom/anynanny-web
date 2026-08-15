"use client";

import { LegalDocumentPage } from "@/components/legal/legal-document-page";
import { PrivacyPolicyDocument } from "@/components/legal/privacy-policy-document";

export function PrivacyPageView() {
  return (
    <LegalDocumentPage title="מדיניות פרטיות">
      <PrivacyPolicyDocument />
    </LegalDocumentPage>
  );
}
