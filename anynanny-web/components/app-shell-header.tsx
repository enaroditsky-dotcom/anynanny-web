"use client";

import Image from "next/image";
import Link from "next/link";
import { Home, Mail, Settings } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { isProfileRole, PROFILES_TABLE, type ProfileRole } from "@/lib/supabase/profiles";

export function AppShellHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [profileRole, setProfileRole] = useState<ProfileRole | null>(null);

  const handleSignOut = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (supabase) {
      await supabase.auth.signOut();
    }
    localStorage.removeItem("active_role");
    localStorage.removeItem("anynanny_payer_session_v1");
    setProfileRole(null);
    router.replace("/auth");
  }, [router]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      const saved = localStorage.getItem("active_role");
      if (saved === "parent" || saved === "sitter") setProfileRole(saved);
      return;
    }

    void (async () => {
      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (!user) {
        setProfileRole(null);
        return;
      }
      const { data: profile } = await supabase.from(PROFILES_TABLE).select("role").eq("id", user.id).maybeSingle();
      const r = profile?.role && isProfileRole(profile.role) ? profile.role : user.user_metadata?.role;
      if (isProfileRole(r)) {
        setProfileRole(r);
        localStorage.setItem("active_role", r);
      }
    })();
  }, [pathname]);

  const roleLabel = profileRole === "parent" ? "הורה" : profileRole === "sitter" ? "בייביסיטר" : "אורח";

  return (
    <header className="w-full border-b border-navy-header/10 bg-white">
      <div className="flex w-full items-center justify-between px-4 py-3">
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="relative ml-1 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white text-navy-header shadow-sm transition hover:bg-brand-cream"
            aria-label="Messages"
          >
            <Mail className="h-5 w-5" />
            <span className="absolute right-2 top-1.5 h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-white" aria-hidden />
          </button>
          <button
            type="button"
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
        </div>

        <div className="inline-flex items-center gap-2">
          <div className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-navy-header">
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
          </div>

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
