import type { ReactNode } from "react";
import { marketingDocumentMetadata } from "@/lib/marketing/marketing-document";

export function generateMetadata() {
  return marketingDocumentMetadata();
}

export default function JobsMarketingLayout({ children }: { children: ReactNode }) {
  return children;
}
