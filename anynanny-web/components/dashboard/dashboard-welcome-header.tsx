"use client";

import type { ReactNode } from "react";
import { CurrentUserRatingBadge } from "@/components/dashboard/current-user-rating-badge";
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

  return (
    <header className="text-right px-4" dir="rtl">
      <h1
        className={`text-xl font-bold leading-snug text-[#001F3F] sm:text-[1.35rem] ${nameLoading ? "animate-pulse" : ""}`}
      >
        {greeting}
      </h1>
      
      {/* 👑 קונטיינר אנכי משותף להורה ולנני שמסדר את המזהים תמיד בדיוק מעל הדירוג */}
      <div className="mt-2 flex flex-col items-start gap-1.5">
        
        {/* 🆔 הצגת מזהה הורה במידה וקיים */}
        {parentPublicId && (
          <span className="inline-flex items-center gap-1 bg-purple-50 text-purple-700 text-xs font-semibold px-2.5 py-1 rounded-lg border border-purple-100 shadow-sm animate-in fade-in duration-200">
            <span className="text-[10px] bg-purple-200 text-purple-800 px-1 rounded uppercase font-bold">ID</span>
            מזהה: {parentPublicId}
          </span>
        )}

        {/* ⭐️ תג הדירוג (ואם זו נני, המזהה שלה יתלבש כאן או בתוך ה-Badge בהתאם להגדרות ה-RatingBadge שלך) */}
        <CurrentUserRatingBadge showNannyId={showNannyId} />
      </div>

      {children}
    </header>
  );
}