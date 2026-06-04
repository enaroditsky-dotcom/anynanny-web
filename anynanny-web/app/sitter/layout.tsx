"use client";

import type { ReactNode } from "react";
import { SessionRoleBoundary } from "@/context/SessionContext";

export default function SitterLayout({ children }: { children: ReactNode }) {
  return <SessionRoleBoundary role="sitter">{children}</SessionRoleBoundary>;
}
