"use client";

import type { ReactNode } from "react";
import { SessionRoleBoundary } from "@/context/SessionContext";
import { ProductPortalGate } from "@/components/auth/product-portal-gate";

export default function SitterLayout({ children }: { children: ReactNode }) {
  return (
    <SessionRoleBoundary role="sitter">
      <ProductPortalGate portal="sitter">{children}</ProductPortalGate>
    </SessionRoleBoundary>
  );
}
