"use client";

import type { ReactNode } from "react";
import { SessionRoleBoundary } from "@/context/SessionContext";
import { ProductPortalGate } from "@/components/auth/product-portal-gate";

export default function ParentLayout({ children }: { children: ReactNode }) {
  return (
    <SessionRoleBoundary role="parent">
      <ProductPortalGate portal="parent">{children}</ProductPortalGate>
    </SessionRoleBoundary>
  );
}
