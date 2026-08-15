"use client";

import type { ReactNode } from "react";
import { ProductPortalGate } from "@/components/auth/product-portal-gate";

export default function SessionLayout({ children }: { children: ReactNode }) {
  return <ProductPortalGate portal="sitter">{children}</ProductPortalGate>;
}
