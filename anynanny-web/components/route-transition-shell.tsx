"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** Fade when navigating between parent/sitter/session dashboard shells (dev-friendly role switching). */
export function RouteTransitionShell({
  children,
  fill = false
}: {
  children: ReactNode;
  /** Preserve the flex height chain so fixed-viewport screens can fill the shell without scrolling. */
  fill?: boolean;
}) {
  const pathname = usePathname();
  const animate =
    pathname.startsWith("/parent") || pathname.startsWith("/sitter") || pathname.startsWith("/session");

  if (!animate) {
    return <>{children}</>;
  }

  return (
    <div className={`animate-fade-route min-w-0 ${fill ? "flex min-h-0 flex-1 flex-col" : ""}`}>
      {children}
    </div>
  );
}
