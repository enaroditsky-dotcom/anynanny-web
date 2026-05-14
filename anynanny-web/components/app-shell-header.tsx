"use client";

/** Header reads auth only from `AuthProvider` — no separate getSession / auth fetch here. */

import Image from "next/image";
import Link from "next/link";
import { Bell } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { RoleToggle } from "@/components/role-toggle";
import { clearDeviceAuthHints } from "@/lib/auth/returning-user";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export function AppShellHeader() {
  const router = useRouter();
  const { signedIn, displayName, isLoading, user, currentRole } = useAuth();
  const [avatarBroken, setAvatarBroken] = useState(false);

  useEffect(() => {
    setAvatarBroken(false);
  }, [user?.id]);

  const handleSignOut = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (supabase) {
      await supabase.auth.signOut();
    }
    clearDeviceAuthHints();
    router.replace("/");
    router.refresh();
  }, [router]);

  const profileHref = currentRole === "sitter" ? "/sitter/personal" : "/parent/settings";

  const avatarUrl = useMemo(() => {
    const raw = user?.user_metadata?.avatar_url;
    return typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : null;
  }, [user?.user_metadata?.avatar_url]);

  const initial = useMemo(() => {
    const n = displayName?.trim() || user?.email?.trim() || "";
    const ch = n.charAt(0);
    return ch ? ch.toUpperCase() : "?";
  }, [displayName, user?.email]);

  return (
    <header className="w-full shrink-0 border-b border-navy-header/10 bg-white/80 backdrop-blur-md supports-[backdrop-filter]:bg-white/80">
      <div className="flex min-h-12 items-center gap-2 px-4 py-1.5" dir="rtl">
        <Link
          href={profileHref}
          className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#001F3F]/10 text-sm font-bold text-[#001F3F] ring-2 ring-navy-header/10 transition hover:ring-emerald-500/40"
          aria-label="פרופיל"
        >
          {avatarUrl && !avatarBroken ? (
            // eslint-disable-next-line @next/next/no-img-element -- user avatars from arbitrary OAuth URLs
            <img
              src={avatarUrl}
              alt=""
              className="h-full w-full object-cover"
              onError={() => setAvatarBroken(true)}
            />
          ) : (
            <span aria-hidden>{initial}</span>
          )}
        </Link>

        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-center gap-2 sm:justify-end">
          {isLoading ? (
            <div className="flex flex-wrap items-center gap-2">
              <div className="h-4 w-16 animate-pulse rounded bg-slate-100" aria-hidden />
              <div className="h-10 w-[10.5rem] animate-pulse rounded-full bg-slate-100" aria-hidden />
            </div>
          ) : (
            <>
              {signedIn && displayName ? (
                <span
                  className="max-w-[5.5rem] shrink truncate text-xs font-semibold text-navy-header sm:max-w-[9rem] sm:text-sm"
                  title={displayName}
                >
                  {displayName}
                </span>
              ) : null}
              {signedIn ? <RoleToggle /> : null}
              {signedIn && displayName ? (
                <span className="hidden h-6 w-px shrink-0 bg-navy-header/15 sm:block" aria-hidden />
              ) : null}

              <button
                type="button"
                suppressHydrationWarning
                className={`shrink-0 rounded-full bg-[#001F3F] px-2.5 py-1.5 text-[11px] font-semibold text-white transition hover:brightness-110 active:brightness-95 ${signedIn ? "ml-1 sm:ml-2" : ""}`}
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

        <div className="flex shrink-0 items-center gap-1.5">
          {signedIn ? (
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
          ) : (
            <button
              type="button"
              className="relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-navy-header transition hover:bg-slate-100"
              aria-label="התראות"
              onClick={() => router.push("/auth")}
            >
              <Bell className="h-5 w-5" strokeWidth={2} />
            </button>
          )}

          <Link
            href="/"
            className="relative block h-9 w-9 shrink-0 overflow-hidden rounded-full ring-1 ring-navy-header/15"
            aria-label="מסך הבית"
          >
            <Image src="/logo.png" alt="AnyNanny" fill className="object-cover object-center" priority sizes="36px" />
          </Link>
        </div>
      </div>
    </header>
  );
}
