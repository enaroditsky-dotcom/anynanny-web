"use client";

import type { ReactNode } from "react";
import { SessionRoleBoundary } from "@/context/SessionContext";
import { ProductPortalGate } from "@/components/auth/product-portal-gate";
import { SitterBroadcastAlertHost } from "@/components/sitter/SitterBroadcastAlertHost";

export default function SitterLayout({ children }: { children: ReactNode }) {
  return (
    <SessionRoleBoundary role="sitter">
      <SitterBroadcastAlertHost>
        <ProductPortalGate portal="sitter">{children}</ProductPortalGate>
      </SitterBroadcastAlertHost>
    </SessionRoleBoundary>
  );
}
