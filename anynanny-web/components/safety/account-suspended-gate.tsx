"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { DeleteAccountSection } from "@/components/account/delete-account-section";
import { LogoutButton } from "@/components/account/logout-button";
import { useAuth } from "@/components/auth-provider";
import { ANYNANNY_SUPPORT_EMAIL } from "@/lib/legal/contact";

function isSuspensionAllowedPath(pathname: string): boolean {
  if (pathname === "/" || pathname === "/terms" || pathname === "/privacy") return true;
  if (pathname.startsWith("/terms/") || pathname.startsWith("/privacy/")) return true;
  if (pathname.startsWith("/auth/") || pathname === "/login" || pathname === "/register") return true;
  if (pathname === "/parent/settings" || pathname.startsWith("/parent/settings/")) return true;
  if (pathname === "/sitter/settings" || pathname.startsWith("/sitter/settings/")) return true;
  if (pathname === "/session" || pathname.startsWith("/session/")) return true;
  if (pathname === "/sitter/session" || pathname.startsWith("/sitter/session/")) return true;
  if (pathname === "/parent/dashboard" || pathname.startsWith("/parent/dashboard/")) return true;
  if (pathname === "/sitter/dashboard" || pathname.startsWith("/sitter/dashboard/")) return true;
  if (pathname.startsWith("/parent/checkout")) return true;
  if (pathname.startsWith("/admin")) return true;
  return false;
}

function SuspensionNotice({ compact }: { compact?: boolean }) {
  return (
    <section
      className={`rounded-3xl border border-amber-200 bg-amber-50 p-5 text-right ${compact ? "" : "mx-auto max-w-md"}`}
      dir="rtl"
    >
      <h1 className="text-lg font-extrabold text-[#001F3F]">החשבון מושעה</h1>
      <p className="mt-2 text-sm leading-relaxed text-slate-700">
        לא ניתן להשתמש בשוק (חיפוש, הזמנות חדשות, צ׳אט חדש ושידור) עד להסרת ההשעיה.
      </p>
      <p className="mt-2 text-sm text-slate-700">
        לפניות:{" "}
        <a className="font-bold text-[#001F3F] underline" href={`mailto:${ANYNANNY_SUPPORT_EMAIL}`}>
          {ANYNANNY_SUPPORT_EMAIL}
        </a>
      </p>
      <div className="mt-4 space-y-3">
        <LogoutButton />
      </div>
      <DeleteAccountSection />
    </section>
  );
}

export function AccountSuspendedGate({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "/";
  const { isLoading, signedIn, suspendedAt } = useAuth();

  if (isLoading || !signedIn || !suspendedAt) {
    return <>{children}</>;
  }

  if (isSuspensionAllowedPath(pathname)) {
    return (
      <>
        <div className="px-4 pt-3">
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-right text-xs font-semibold text-amber-900">
            החשבון מושעה. ניתן לפנות ל-{ANYNANNY_SUPPORT_EMAIL} או למחוק את החשבון בהגדרות.
          </p>
        </div>
        {children}
      </>
    );
  }

  return (
    <main className="min-h-dvh bg-[#FDFBF6] px-4 py-8">
      <SuspensionNotice />
    </main>
  );
}
