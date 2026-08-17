"use client";

import type { ReactNode } from "react";
import { CurrentUserRatingBadge } from "@/components/dashboard/current-user-rating-badge";
import { IdentityVerifiedBadgeLive } from "@/components/identity/verified-user-badge";
import { useAuth } from "@/components/auth-provider";
import { buildDashboardGreetingLine } from "@/lib/user/use-dashboard-greeting-name";

type DashboardWelcomeHeaderProps = {
  fullName?: string | null;
  nameLoading?: boolean;
  /** Sitter dashboard: show personal nanny serial next to rating when RPC returns it. */
  showNannyId?: boolean;
  /** Parent dashboard: pass the real parent display ID to align above the rating badge. */
  parentPublicId?: string | null;
  children?: ReactNode;
};

export function DashboardWelcomeHeader({
  fullName = null,
  nameLoading = false,
  showNannyId = false,
  parentPublicId = null,
  children
}: DashboardWelcomeHeaderProps) {
  const greeting = buildDashboardGreetingLine(fullName, nameLoading);
  const { user } = useAuth();

  return (
    <header className="text-right px-4" dir="rtl">
      <h1
        className={`text-xl font-bold leading-snug text-[#001F3F] ${nameLoading ? "animate-pulse" : ""}`}
      >
        {greeting}
      </h1>
      
      {/* 👑 קונטיינר אנכי משותף (מותאם לנני בלבד או לפי הצורך) */}
      <div className="mt-2 flex flex-col items-start gap-1.5">
        <IdentityVerifiedBadgeLive userId={user?.id} />
        <CurrentUserRatingBadge showNannyId={showNannyId} />
      </div>

      {children}
    </header>
  );
}