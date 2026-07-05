"use client";

import type { User } from "@supabase/supabase-js";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { isNannyOnboardingBypassEmail, isSitterTestBypassEmail, sanitizeNextParam } from "@/lib/auth/post-auth-destination";
import { clearDeviceAuthHints, readLastUsedEmail, readReturningUserFlag } from "@/lib/auth/returning-user";
import { SITTER_PROFILES_TABLE, SITTER_PROFILES_USER_COLUMN } from "@/lib/sitter/sitter-profile";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { PROFILES_TABLE } from "@/lib/supabase/profiles";

type BrowserSupabase = NonNullable<ReturnType<typeof getSupabaseBrowserClient>>;

/** Hard navigation away from `/auth` so middleware + React state do not fight (full document load). */
async function tryHardRedirectSitterFromAuth(supabase: BrowserSupabase, user: User): Promise<boolean> {
  /** +nanny: only legal destination for this test identity (see post-auth-destination). */
  if (isNannyOnboardingBypassEmail(user.email)) {
    window.location.href = "/sitter/dashboard";
    return true;
  }
  if (isSitterTestBypassEmail(user.email)) {
    window.location.href = "/sitter/dashboard";
    return true;
  }
  const fk = SITTER_PROFILES_USER_COLUMN;
  const { data: sitterRow, error: sitterErr } = await supabase
    .from(SITTER_PROFILES_TABLE)
    .select(fk)
    .eq(fk, user.id)
    .maybeSingle();
  if (
    !sitterErr &&
    sitterRow != null &&
    typeof sitterRow === "object" &&
    fk in sitterRow
  ) {
    window.location.href = "/sitter/dashboard";
    return true;
  }
  const { data: profileRow, error: profileErr } = await supabase
    .from(PROFILES_TABLE)
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profileErr) return false;
  const raw = profileRow as unknown;
  const pr = raw && typeof raw === "object" && "role" in raw ? (raw as { role: unknown }).role : undefined;
  const dbRole = typeof pr === "string" ? pr : null;
  if (dbRole === "sitter") {
    window.location.href = "/sitter/dashboard";
    return true;
  }
  return false;
}

function AuthLandingInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = sanitizeNextParam(searchParams.get("next"));
  const authError = searchParams.get("error");

  const nextQuery = useMemo(() => (nextPath ? `?next=${encodeURIComponent(nextPath)}` : ""), [nextPath]);

  const loginHref = useMemo(() => {
    const base = `/auth/login${nextQuery}`;
    const last = readLastUsedEmail();
    if (!last) return base;
    const sep = base.includes("?") ? "&" : "?";
    return `${base}${sep}email=${encodeURIComponent(last)}`;
  }, [nextQuery]);

  const [mounted, setMounted] = useState(false);
  const [returning, setReturning] = useState(false);
  const noProfile = authError === "no_profile";

  useEffect(() => {
    setReturning(readReturningUserFlag());
    setMounted(true);
  }, []);

  /** Logged-in sitters: full page load so middleware + cookies settle (same smooth path as parents). */
  useEffect(() => {
    if (!mounted || noProfile) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    let cancelled = false;
    void (async () => {
      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (cancelled || !user) return;
      try {
        const redirected = await tryHardRedirectSitterFromAuth(supabase, user);
        if (redirected) return;
      } catch {
        /* stay on /auth */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mounted, noProfile]);

  useEffect(() => {
    if (!noProfile) return;
    let cancelled = false;
    void (async () => {
      await new Promise((r) => setTimeout(r, 280));
      if (cancelled) return;
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        router.replace("/auth/role-selection");
        return;
      }
      await supabase.auth.refreshSession();
      if (cancelled) return;
      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (cancelled) return;
      if (user) {
        try {
          const redirected = await tryHardRedirectSitterFromAuth(supabase, user);
          if (redirected) return;
        } catch {
          router.replace("/auth/role-selection");
          return;
        }
        router.replace("/auth/role-selection");
      } else {
        router.replace("/auth/login?next=/auth/role-selection");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [noProfile, router]);

  const handleSwitchUser = async () => {
    const supabase = getSupabaseBrowserClient();
    if (supabase) {
      await supabase.auth.signOut();
    }
    clearDeviceAuthHints();
    router.replace("/");
    router.refresh();
  };

  if (!mounted || noProfile) {
    return (
      <main className="mx-auto flex min-w-0 max-w-full justify-center py-10 text-center text-sm text-slate-600" dir="rtl">
        טוען...
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full min-w-0 max-w-full flex-col items-center gap-4 py-2" dir="rtl">
      {returning ? (
        <section className="w-full min-w-0 max-w-md rounded-3xl bg-white px-6 py-10 text-center shadow-soft">
          <div className="mx-auto flex h-32 w-32 items-center justify-center">
            <div className="relative h-full w-full overflow-hidden rounded-full ring-2 ring-navy-header/10">
              <Image src="/logo_clean.png" alt="" fill className="object-contain p-1" sizes="128px" priority />
            </div>
          </div>
          <h2 className="mt-8 text-2xl font-bold text-navy-header">ברוכים השבים</h2>
          <p className="mt-2 text-sm text-slate-600">שמחים לראות אתכם שוב ב־AnyNanny</p>

          <Link
            href={loginHref}
            suppressHydrationWarning
            className="mt-10 block w-full rounded-2xl bg-[#001F3F] py-3.5 text-center text-base font-semibold text-white shadow-soft transition hover:brightness-105 active:brightness-95"
          >
            התחברות
          </Link>

          <button
            type="button"
            suppressHydrationWarning
            onClick={() => void handleSwitchUser()}
            className="mt-8 w-full border-0 bg-transparent text-center text-sm font-semibold text-slate-600 underline underline-offset-2 transition hover:text-navy-header"
          >
            זה לא אני / החלף משתמש
          </button>
        </section>
      ) : (
        <section className="w-full min-w-0 max-w-md rounded-3xl bg-white p-6 shadow-soft">
          <h1 className="text-center text-2xl font-bold text-navy-header">התחברות / הרשמה</h1>
          <p className="mt-2 text-center text-sm text-slate-600">
            בחרו התחברות או הרשמה כדי להמשיך.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href={`/auth/login${nextQuery}`}
              suppressHydrationWarning
              className="flex flex-1 items-center justify-center rounded-2xl bg-[#001F3F] px-4 py-3.5 text-center text-sm font-semibold text-white shadow-soft transition hover:brightness-105 active:brightness-95"
            >
              התחברות
            </Link>
            <Link
              href={`/auth/sign-up${nextQuery}`}
              suppressHydrationWarning
              className="flex flex-1 items-center justify-center rounded-2xl border border-navy-header/25 bg-white px-4 py-3.5 text-center text-sm font-semibold text-navy-header transition hover:bg-slate-50"
            >
              הרשמה
            </Link>
          </div>
        </section>
      )}

      <Link
        href="/?manual=true"
        suppressHydrationWarning
        className="inline-flex w-full min-w-0 max-w-md justify-center px-1 text-sm font-semibold text-navy-header underline"
      >
        חזרה למסך הבית
      </Link>
    </main>
  );
}

export default function AuthPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex min-w-0 max-w-full justify-center py-10 text-center text-sm text-slate-600" dir="rtl">
          טוען...
        </main>
      }
    >
      <AuthLandingInner />
    </Suspense>
  );
}
