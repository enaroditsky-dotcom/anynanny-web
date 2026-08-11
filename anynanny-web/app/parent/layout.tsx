"use client";
import type { ReactNode } from "react";
import { ParentActiveNowDock } from "@/components/parent/parent-active-now-dock";
import { SessionRoleBoundary } from "@/context/SessionContext";

export default function ParentLayout({ children }: { children: ReactNode }) {
  return (
    <SessionRoleBoundary role="parent">
      {children}
      <ParentActiveNowDock />
    </SessionRoleBoundary>
  );
}
