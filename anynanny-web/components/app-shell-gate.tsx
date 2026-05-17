"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AppShellHeader } from "@/components/app-shell-header";
import { BottomNavigation } from "@/components/bottom-navigation";
import { RouteTransitionShell } from "@/components/route-transition-shell";

const CHROMELESS_PREFIXES = ["/auth/role-selection", "/auth/login", "/auth/register"];

export function isChromelessAuthPath(pathname: string): boolean {
  return CHROMELESS_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function AppShellGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const chromeless = isChromelessAuthPath(pathname);

  if (chromeless) {
    return (
      <div className="mx-auto flex min-h-dvh w-full min-w-0 max-w-md flex-col overflow-hidden bg-[#FDFBF6] md:my-4 md:min-h-[calc(100dvh-2rem)] md:rounded-[2rem]">
        <div className="relative min-h-0 min-w-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-0 w-full min-w-0 max-w-md flex-col overflow-hidden bg-white shadow-soft md:my-4 md:min-h-[calc(100dvh-2rem)] md:rounded-[2rem]">
      <AppShellHeader />
      <div className="relative min-h-0 min-w-0 flex-1 overflow-y-auto px-4 pb-28 pt-4">
        <RouteTransitionShell>{children}</RouteTransitionShell>
      </div>
      <BottomNavigation />
    </div>
  );
}
