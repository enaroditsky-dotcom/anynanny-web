"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** Fade when navigating between parent/sitter/session dashboard shells (dev-friendly role switching). */
export function RouteTransitionShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const animate =
    pathname.startsWith("/parent") || pathname.startsWith("/sitter") || pathname.startsWith("/session");

  if (!animate) {
    return <>{children}</>;
  }

  return (
    <div key={pathname} className="animate-fade-route min-w-0">
      {children}
    </div>
  );
}
