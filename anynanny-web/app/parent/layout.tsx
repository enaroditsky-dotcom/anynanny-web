"use client";

import type { ReactNode } from "react";
import { SessionRoleBoundary } from "@/context/SessionContext";
import { ProductPortalGate } from "@/components/auth/product-portal-gate";
import { ParentTourProvider } from "@/components/product-tour/parent-tour-provider";

export default function ParentLayout({ children }: { children: ReactNode }) {
  return (
    <SessionRoleBoundary role="parent">
      <ParentTourProvider>
        <ProductPortalGate portal="parent">{children}</ProductPortalGate>
      </ParentTourProvider>
    </SessionRoleBoundary>
  );
}
