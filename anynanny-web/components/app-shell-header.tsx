"use client";

import Image from "next/image";
import Link from "next/link";
import { Mail } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { clearDeviceAuthHints } from "@/lib/auth/returning-user";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { isProfileRole, PROFILES_TABLE } from "@/lib/supabase/profiles";

export function AppShellHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [profileEpoch, setProfileEpoch] = useState(0);
  const [signedIn, setSignedIn] = useState(false);
  const [displayName, setDisplayName] = useState<string | null>(null);

  const refreshProfile = useCallback(() => {
    setProfileEpoch((n) => n + 1);
  }, []);

  const handleSignOut = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (supabase) {
      await supabase.auth.signOut();
    }
    clearDeviceAuthHints();
    setSignedIn(false);
    setDisplayName(null);
    router.replace("/?manual=true");
  }, [router]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
        refreshProfile();
      }
      if (event === "SIGNED_OUT") {
        try {
          localStorage.removeItem("active_role");
          localStorage.removeItem("anynanny_payer_session_v1");
        } catch {
          /* ignore */
        }
        setSignedIn(false);
        setDisplayName(null);
      }
    });

    return () => subscription.unsubscribe();
  }, [refreshProfile]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        setSignedIn(false);
        setDisplayName(null);
        return;
      }

      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (cancelled) return;

      if (!user) {
        localStorage.removeItem("active_role");
        setSignedIn(false);
        setDisplayName(null);
        return;
      }

      setSignedIn(true);

      const metaRaw = user.user_metadata?.full_name;
      const metaName =
        typeof metaRaw === "string" && metaRaw.trim() ? metaRaw.trim() : null;
      setDisplayName(metaName);

      const metaRoleRaw = user.user_metadata?.role;
      const metaRole = typeof metaRoleRaw === "string" && isProfileRole(metaRoleRaw) ? metaRoleRaw : null;
      if (metaRole) {
        localStorage.setItem("active_role", metaRole);
      }

      const { data: profile } = await supabase
        .from(PROFILES_TABLE)
        .select("role, full_name")
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

      const profileName =
        typeof profile?.full_name === "string" && profile.full_name.trim() ? profile.full_name.trim() : null;
      setDisplayName(profileName ?? metaName);
    })();

    return () => {
      cancelled = true;
    };
  }, [pathname, profileEpoch]);

  return (
    <header className="w-full shrink-0 border-b border-navy-header/10 bg-white">
      <div className="flex h-12 items-center justify-between px-4">
        <div className="flex items-center gap-3">
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

          {signedIn && displayName ? (
            <span
              className="max-w-[5.5rem] truncate text-xs font-semibold text-navy-header sm:max-w-[9rem] sm:text-sm"
              title={displayName}
            >
              {displayName}
            </span>
          ) : null}

          <button
            type="button"
            suppressHydrationWarning
            className="shrink-0 rounded-full bg-[#001F3F] px-2.5 py-1.5 text-[11px] font-semibold text-white transition hover:brightness-110 active:brightness-95"
            onClick={() => {
              if (signedIn) void handleSignOut();
              else router.push("/auth");
            }}
          >
            {signedIn ? "התנתקות" : "כניסה"}
          </button>
        </div>

        <Link
          href="/?manual=true"
          className="relative block h-9 w-9 shrink-0 overflow-hidden rounded-full ring-1 ring-navy-header/15"
          aria-label="מסך הבית"
        >
          <Image src="/logo.png" alt="AnyNanny" fill className="object-cover object-center" priority sizes="36px" />
        </Link>
      </div>
    </header>
  );
}
