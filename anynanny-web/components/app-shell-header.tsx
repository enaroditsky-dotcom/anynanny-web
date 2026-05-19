"use client";

/** Header reads auth only from `AuthProvider` — session UI is gated until after mount to avoid hydration mismatch. */

import Link from "next/link";
import { Bell, Home, Settings } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { RoleToggle } from "@/components/role-toggle";
import { clearDeviceAuthHints } from "@/lib/auth/returning-user";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export function AppShellHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const { signedIn, displayName, isLoading, currentRole } = useAuth();
  const [mounted, setMounted] = useState(false);

  const isHomePage = pathname === "/";

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleSignOut = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (supabase) {
      await supabase.auth.signOut();
    }
    clearDeviceAuthHints();
    router.replace("/");
    router.refresh();
  }, [router]);

  const settingsHref = currentRole === "sitter" ? "/sitter/personal" : "/parent/settings";

  /** After mount + auth settled — avoids server HTML vs client session mismatch. */
  const showSessionUi = mounted && !isLoading;
  const showProfileAvatar = showSessionUi && signedIn && !isHomePage;

  return (
    <header className="w-full shrink-0 border-b border-navy-header/10 bg-white/80 backdrop-blur-md supports-[backdrop-filter]:bg-white/80">
      <div className="flex min-h-12 items-center gap-2 px-4 py-1.5" dir="rtl">
        {showProfileAvatar ? (
          <Link
            href={settingsHref}
            className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition hover:bg-slate-100"
            aria-label="הגדרות חשבון"
          >
            <Settings className="h-5 w-5 text-gray-600 hover:text-gray-900" aria-hidden />
          </Link>
        ) : (
          <span className="h-10 w-10 shrink-0" aria-hidden />
        )}

        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-center gap-2 sm:justify-end">
          {!showSessionUi ? (
            <div className="h-4 w-20 animate-pulse rounded bg-slate-100" aria-hidden />
          ) : signedIn ? (
            <>
              {displayName ? (
                <span
                  className="max-w-[5.5rem] shrink truncate text-xs font-semibold text-navy-header sm:max-w-[9rem] sm:text-sm"
                  title={displayName}
                >
                  {displayName}
                </span>
              ) : null}
              <RoleToggle />
              <button
                type="button"
                suppressHydrationWarning
                className="shrink-0 rounded-full bg-[#001F3F] px-2.5 py-1.5 text-[11px] font-semibold text-white transition hover:brightness-110 active:brightness-95"
                onClick={() => void handleSignOut()}
              >
                התנתקות
              </button>
            </>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {showSessionUi && signedIn ? (
            <Link
              href={currentRole === "sitter" ? "/sitter/messages" : "/parent/messages"}
              className="relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-navy-header transition hover:bg-slate-100"
              aria-label="התראות והודעות"
            >
              <Bell className="h-5 w-5" strokeWidth={2} />
              <span
                className="absolute right-0.5 top-0.5 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white"
                aria-hidden
              />
            </Link>
          ) : null}

          {!showSessionUi ? (
            <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-slate-100" aria-hidden />
          ) : (
            <Link
              href="/"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-navy-header ring-1 ring-navy-header/15 transition hover:bg-slate-100"
              aria-label="דף הבית"
            >
              <Home className="h-5 w-5" strokeWidth={2} aria-hidden />
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
