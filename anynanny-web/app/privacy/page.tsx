import type { Metadata } from "next";
import { PrivacyPageView } from "@/components/legal/privacy-page-view";
import { privacyPolicyMetadataDescription } from "@/lib/legal/privacy-release";

export const metadata: Metadata = {
  title: "מדיניות פרטיות | AnyNanny",
  description: privacyPolicyMetadataDescription(),
  alternates: {
    canonical: "https://www.anynanny.org/privacy"
  }
};

export default function PrivacyPage() {
  return <PrivacyPageView />;
}
