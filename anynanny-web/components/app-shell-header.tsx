"use client";

import Image from "next/image";
import Link from "next/link";
import { Mail, Settings } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { isProfileRole, PROFILES_TABLE } from "@/lib/supabase/profiles";

export function AppShellHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [hasMounted, setHasMounted] = useState(false);
  const [profileEpoch, setProfileEpoch] = useState(0);
  const [profileLoading, setProfileLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  const refreshProfile = useCallback(() => {
    setProfileEpoch((n) => n + 1);
  }, []);

  const handleSignOut = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (supabase) {
      await supabase.auth.signOut();
    }
    localStorage.removeItem("active_role");
    localStorage.removeItem("anynanny_payer_session_v1");
    setSignedIn(false);
    router.replace("/auth");
  }, [router]);

  useEffect(() => {
    if (!hasMounted) return;

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
        refreshProfile();
      }
      if (event === "SIGNED_OUT") {
        setSignedIn(false);
        setProfileLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [hasMounted, refreshProfile]);

  useEffect(() => {
    if (!hasMounted) return;

    let cancelled = false;

    void (async () => {
      setProfileLoading(true);
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        if (!cancelled) {
          setSignedIn(false);
          setProfileLoading(false);
        }
        return;
      }

      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (cancelled) return;

      if (!user) {
        localStorage.removeItem("active_role");
        setSignedIn(false);
        setProfileLoading(false);
        return;
      }

      setSignedIn(true);

      const metaRoleRaw = user.user_metadata?.role;
      const metaRole = typeof metaRoleRaw === "string" && isProfileRole(metaRoleRaw) ? metaRoleRaw : null;
      if (metaRole) {
        localStorage.setItem("active_role", metaRole);
      }
      setProfileLoading(false);

      const { data: profile } = await supabase
        .from(PROFILES_TABLE)
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      if (cancelled) return;

      const r =
        profile?.role && isProfileRole(profile.role)
          ? profile.role
          : typeof user.user_metadata?.role === "string" && isProfileRole(user.user_metadata.role)
            ? user.user_metadata.role
            : null;

      if (isProfileRole(r)) {
        localStorage.setItem("active_role", r);
      } else if (!metaRole) {
        localStorage.removeItem("active_role");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hasMounted, pathname, profileEpoch]);

  const showChrome = hasMounted && !profileLoading;

  return (
    <header className="w-full shrink-0 border-b border-navy-header/10 bg-white">
      <div className="flex w-full items-center justify-between gap-4 px-4 py-3">
        <div className="flex shrink-0 items-center gap-4">
          {showChrome ? (
            <>
              <button
                type="button"
                suppressHydrationWarning
                className="relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-navy-header shadow-sm transition hover:bg-brand-cream"
                aria-label="הודעות"
              >
                <Mail className="h-5 w-5" />
                <span
                  className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-white"
                  aria-hidden
                />
              </button>
              <button
                type="button"
                suppressHydrationWarning
                className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full px-2 text-navy-header transition hover:bg-slate-100"
                aria-label={signedIn ? "התנתקות" : "כניסה"}
                onClick={() => {
                  if (signedIn) void handleSignOut();
                  else router.push("/auth");
                }}
              >
                <Settings className="h-5 w-5 shrink-0" />
                <span className="max-w-[5rem] truncate text-[11px] font-semibold leading-tight">
                  {signedIn ? "התנתקות" : "כניסה"}
                </span>
              </button>
            </>
          ) : (
            <>
              <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-slate-100" aria-hidden />
              <div className="h-10 w-[4.75rem] shrink-0 animate-pulse rounded-full bg-slate-100" aria-hidden />
            </>
          )}
        </div>

        <Link
          href="/?manual=true"
          className="flex min-w-0 max-w-[58%] items-center gap-2 rounded-full bg-[#F5EEDC] px-2.5 py-1.5 text-navy-header shadow-sm transition hover:brightness-95"
          aria-label="AnyNanny — מסך הבית"
        >
          <span className="relative h-7 w-7 shrink-0 overflow-hidden rounded-full ring-1 ring-navy-header/15">
            <Image src="/logo.png" alt="AnyNanny" fill className="object-cover object-center" priority sizes="28px" />
          </span>
          <span className="truncate text-lg font-bold">AnyNanny</span>
        </Link>
      </div>
    </header>
  );
}
