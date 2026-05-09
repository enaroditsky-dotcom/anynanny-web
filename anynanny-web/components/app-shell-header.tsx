"use client";

/** Header reads auth only from `AuthProvider` — no separate getSession / auth fetch here. */

import Image from "next/image";
import Link from "next/link";
import { Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { useAuth } from "@/components/auth-provider";
import { clearDeviceAuthHints } from "@/lib/auth/returning-user";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export function AppShellHeader() {
  const router = useRouter();
  const { signedIn, displayName, isLoading } = useAuth();

  const handleSignOut = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (supabase) {
      await supabase.auth.signOut();
    }
    clearDeviceAuthHints();
    router.replace("/");
    router.refresh();
  }, [router]);

  return (
    <header className="w-full shrink-0 border-b border-navy-header/10 bg-white/80 backdrop-blur-md supports-[backdrop-filter]:bg-white/80">
      <div className="flex h-12 items-center justify-between px-4">
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
          <button
            type="button"
            suppressHydrationWarning
            className="relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-navy-header transition hover:bg-slate-100"
            aria-label="הודעות"
          >
            <Mail className="h-5 w-5" strokeWidth={2} />
            <span
              className="absolute right-0.5 top-0.5 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white"
              aria-hidden
            />
          </button>

          {isLoading ? (
            <div className="flex items-center gap-2">
              <div className="h-4 w-16 animate-pulse rounded bg-slate-100" aria-hidden />
              <div className="h-8 w-[4.5rem] animate-pulse rounded-full bg-slate-100" aria-hidden />
            </div>
          ) : (
            <>
              {signedIn && displayName ? (
                <>
                  <span
                    className="max-w-[5.5rem] shrink truncate text-xs font-semibold text-navy-header sm:max-w-[9rem] sm:text-sm"
                    title={displayName}
                  >
                    {displayName}
                  </span>
                  <span className="hidden h-6 w-px shrink-0 bg-navy-header/15 sm:block" aria-hidden />
                </>
              ) : null}

              <button
                type="button"
                suppressHydrationWarning
                className={`shrink-0 rounded-full bg-[#001F3F] px-2.5 py-1.5 text-[11px] font-semibold text-white transition hover:brightness-110 active:brightness-95 ${signedIn && displayName ? "ml-1 sm:ml-2" : ""}`}
                onClick={() => {
                  if (signedIn) void handleSignOut();
                  else router.push("/auth");
                }}
              >
                {signedIn ? "התנתקות" : "כניסה"}
              </button>
            </>
          )}
        </div>

        <Link
          href="/"
          className="relative block h-9 w-9 shrink-0 overflow-hidden rounded-full ring-1 ring-navy-header/15"
          aria-label="מסך הבית"
        >
          <Image src="/logo.png" alt="AnyNanny" fill className="object-cover object-center" priority sizes="36px" />
        </Link>
      </div>
    </header>
  );
}
