"use client";

import type { ReactNode } from "react";
import { CurrentUserRatingBadge } from "@/components/dashboard/current-user-rating-badge";
import { buildDashboardGreetingLine } from "@/lib/user/use-dashboard-greeting-name";

type DashboardWelcomeHeaderProps = {
  fullName?: string | null;
  nameLoading?: boolean;
  /** Sitter dashboard: show personal nanny serial next to rating when RPC returns it. */
  showNannyId?: boolean;
  children?: ReactNode;
};

export function DashboardWelcomeHeader({
  fullName = null,
  nameLoading = false,
  showNannyId = false,
  children
}: DashboardWelcomeHeaderProps) {
  const greeting = buildDashboardGreetingLine(fullName, nameLoading);

  return (
    <header className="text-right" dir="rtl">
      <h1
        className={`text-xl font-bold leading-snug text-[#001F3F] sm:text-[1.35rem] ${nameLoading ? "animate-pulse" : ""}`}
      >
        {greeting}
      </h1>
      <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
        <CurrentUserRatingBadge showNannyId={showNannyId} />
      </div>
      {children}
    </header>
  );
}
