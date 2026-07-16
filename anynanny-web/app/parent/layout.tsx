"use client";
import type { ReactNode } from "react";
import { SessionRoleBoundary } from "@/context/SessionContext";

export default function ParentLayout({ children }: { children: ReactNode }) {
  return (
    <SessionRoleBoundary role="parent">
       {children}
    </SessionRoleBoundary>
  );
}