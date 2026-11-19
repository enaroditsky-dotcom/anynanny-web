"use client";

import type { ReactNode } from "react";
import { User } from "lucide-react";
import { ProfileImage } from "@/components/profile/profile-image";

type DashboardProfileHeroProps = {
  title: string;
  titleClassName?: string;
  avatarUrl?: string | null;
  avatarName?: string | null;
  badges: ReactNode;
  children?: ReactNode;
  tour?: string;
};

/** Shared parent/sitter dashboard profile card. Badge column is physical left; avatar is physical right. */
export function DashboardProfileHero({
  title,
  titleClassName,
  avatarUrl = null,
  avatarName = null,
  badges,
  children,
  tour
}: DashboardProfileHeroProps) {
  return (
    <div
      data-tour={tour}
      className="w-full min-w-0 space-y-2 rounded-xl border border-slate-100 bg-slate-50/70 p-3"
    >
      <h1 className={titleClassName ?? "text-right text-base font-bold leading-snug text-slate-900"}>
        {title}
      </h1>
      <div className="flex items-center justify-between gap-3" dir="ltr">
        <div className="flex min-w-0 flex-col items-start gap-2">{badges}</div>
        <div className="shrink-0 rounded-[1.15rem] border border-[#E4D3B4] bg-[#FBF7EF] p-1.5 shadow-[0_14px_28px_-16px_rgba(0,31,63,0.55),inset_0_1px_0_rgba(255,255,255,0.92)]">
          <ProfileImage
            src={avatarUrl}
            name={avatarName}
            className="h-[6.75rem] w-[6.75rem] bg-white text-slate-400 shadow-[inset_0_0_0_1px_rgba(0,31,63,0.08)]"
            fallback={<User className="h-8 w-8" />}
          />
        </div>
      </div>
      {children}
    </div>
  );
}
