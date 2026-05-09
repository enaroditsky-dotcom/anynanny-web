"use client";

import Image from "next/image";
import Link from "next/link";
import { Home, Mail, Settings } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { isProfileRole, PROFILES_TABLE, type ProfileRole } from "@/lib/supabase/profiles";

function UserSectionSkeleton() {
  return (
    <div className="flex items-center gap-2">
      <div className="h-8 w-16 animate-pulse rounded-full bg-slate-100" aria-hidden />
      <div className="h-8 min-w-[7rem] animate-pulse rounded-full bg-slate-100" aria-hidden />
    </div>
  );
}

export function AppShellHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [hasMounted, setHasMounted] = useState(false);
  const [profileEpoch, setProfileEpoch] = useState(0);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileRole, setProfileRole] = useState<ProfileRole | null>(null);
  const [fullName, setFullName] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);

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
    setProfileRole(null);
    setFullName(null);
    setBalance(null);
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
        setProfileRole(null);
        setFullName(null);
        setBalance(null);
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
        const saved = localStorage.getItem("active_role");
        if (!cancelled) {
          if (saved === "parent" || saved === "sitter") {
            setProfileRole(saved);
          } else {
            setProfileRole(null);
          }
          setFullName(null);
          setBalance(null);
          setProfileLoading(false);
        }
        return;
      }

      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (cancelled) return;

      const metaNameRaw = user?.user_metadata?.full_name;
      const metaName =
        typeof metaNameRaw === "string" && metaNameRaw.trim() ? metaNameRaw.trim() : null;

      if (!user) {
        setProfileRole(null);
        setFullName(null);
        setBalance(null);
        setProfileLoading(false);
        return;
      }

      const metaRoleRaw = user.user_metadata?.role;
      const metaRole = typeof metaRoleRaw === "string" && isProfileRole(metaRoleRaw) ? metaRoleRaw : null;
      if (metaRole) {
        setProfileRole(metaRole);
        localStorage.setItem("active_role", metaRole);
      }
      setFullName(metaName);
      setProfileLoading(false);

      const { data: profile } = await supabase
        .from(PROFILES_TABLE)
        .select("role, full_name, balance")
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
        setProfileRole(r);
        localStorage.setItem("active_role", r);
      } else if (!metaRole) {
        setProfileRole(null);
      }

      const nameFromProfile =
        typeof profile?.full_name === "string" && profile.full_name.trim() ? profile.full_name.trim() : null;
      setFullName(nameFromProfile ?? metaName);

      const bal =
        profile?.balance !== null && profile?.balance !== undefined && typeof profile.balance === "number"
          ? profile.balance
          : null;
      setBalance(bal);
    })();

    return () => {
      cancelled = true;
    };
  }, [hasMounted, pathname, profileEpoch]);

  const roleLabel = profileRole === "parent" ? "הורה" : profileRole === "sitter" ? "בייביסיטר" : "אורח";

  const showUserChrome = hasMounted && !profileLoading;

  return (
    <header className="w-full border-b border-navy-header/10 bg-white">
      <div className="flex w-full items-center justify-between px-4 py-3">
        <div className="flex items-center gap-1">
          <button
            type="button"
            suppressHydrationWarning
            className="relative ml-1 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white text-navy-header shadow-sm transition hover:bg-brand-cream"
            aria-label="Messages"
          >
            <Mail className="h-5 w-5" />
            <span className="absolute right-2 top-1.5 h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-white" aria-hidden />
          </button>
          {showUserChrome ? (
            <button
              type="button"
              suppressHydrationWarning
              className="inline-flex h-10 max-w-[9rem] items-center gap-1 rounded-full px-2 text-navy-header transition hover:bg-slate-100"
              aria-label={profileRole ? "התנתקות" : "התחברות"}
              onClick={() => {
                if (profileRole) void handleSignOut();
                else router.push("/auth");
              }}
            >
              <Settings className="h-5 w-5 shrink-0" />
              <span className="text-[11px] font-semibold leading-tight">
                {profileRole ? "התנתקות" : "כניסה"}
              </span>
            </button>
          ) : (
            <div className="h-10 w-[5.5rem] animate-pulse rounded-full bg-slate-100" aria-hidden />
          )}
        </div>

        <div className="inline-flex items-center gap-2">
          {showUserChrome ? (
            <div className="flex max-w-[11rem] flex-col items-end gap-0.5 rounded-full bg-slate-100 px-3 py-1.5 text-[11px] font-semibold text-navy-header">
              {profileRole === "parent" ? (
                <Link href="/parent/dashboard" className="underline-offset-2 hover:underline">
                  {roleLabel} · לוח בקרה
                </Link>
              ) : profileRole === "sitter" ? (
                <Link href="/session" className="underline-offset-2 hover:underline">
                  {roleLabel} · משמרת
                </Link>
              ) : (
                <Link href="/auth" className="underline-offset-2 hover:underline">
                  התחברות
                </Link>
              )}
              {profileRole && (fullName || balance !== null) ? (
                <span className="max-w-full truncate text-[10px] font-normal text-slate-600">
                  {[fullName?.trim() || null, balance !== null ? `₪${Number(balance).toFixed(2)}` : null].filter(Boolean).join(" · ")}
                </span>
              ) : null}
            </div>
          ) : (
            <UserSectionSkeleton />
          )}

          <Link
            href="/?manual=true"
            className="mr-1 inline-flex items-center gap-1 rounded-full bg-[#F5EEDC] px-2.5 py-1.5 text-navy-header shadow-sm transition hover:brightness-95"
            aria-label="Home"
          >
            <Home className="h-4 w-4" />
            <span className="relative h-7 w-7 overflow-hidden rounded-full ring-1 ring-navy-header/15">
              <Image src="/logo.png" alt="AnyNanny" fill className="object-cover object-center" priority />
            </span>
            <span className="text-lg font-bold">AnyNanny</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
