"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { redirectAfterSignIn } from "@/lib/auth/redirect-after-sign-in";
import { clearDeviceAuthHints, readLastUsedEmail, readReturningUserFlag } from "@/lib/auth/returning-user";
import { useAuth } from "@/components/auth-provider";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

function AuthLandingInner() {
  const router = useRouter();
  const pathname = usePathname();
  const { isLoading: authLoading, signedIn, effectiveRole } = useAuth();
  const redirectOnceRef = useRef(false);
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next");
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

  useEffect(() => {
    if (!signedIn) redirectOnceRef.current = false;
  }, [signedIn]);

  useEffect(() => {
    setReturning(readReturningUserFlag());
    setMounted(true);
  }, []);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => {
      console.log("[auth] getSession", {
        pathname,
        sessionUserId: data.session?.user?.id ?? null,
        hasSession: !!data.session
      });
    });
  }, [pathname, signedIn, authLoading]);

  useEffect(() => {
    if (!pathname.startsWith("/auth")) return;
    if (authLoading) return;
    if (!signedIn || !effectiveRole) return;
    if (redirectOnceRef.current) return;
    redirectOnceRef.current = true;
    redirectAfterSignIn(router, effectiveRole, nextPath);
  }, [pathname, authLoading, signedIn, effectiveRole, router, nextPath]);

  const handleSwitchUser = async () => {
    const supabase = getSupabaseBrowserClient();
    if (supabase) {
      await supabase.auth.signOut();
    }
    clearDeviceAuthHints();
    router.replace("/");
    router.refresh();
  };

  if (authLoading || !mounted) {
    return (
      <main className="mx-auto flex min-w-0 max-w-full justify-center py-10 text-center text-sm text-slate-600" dir="rtl">
        טוען...
      </main>
    );
  }

  if (signedIn && effectiveRole) {
    return (
      <main className="mx-auto flex min-w-0 max-w-full justify-center py-16 text-center text-sm text-slate-600" dir="rtl">
        מפנים לדשבורד…
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full min-w-0 max-w-full flex-col items-center gap-4 py-2" dir="rtl">
      {authError === "no_profile" ? (
        <p className="w-full min-w-0 max-w-md rounded-xl bg-amber-50 p-3 text-center text-sm text-amber-900 shadow-soft">
          חסר פרופיל למשתמש. נסו להתחבר שוב לאחר הרשמה, או פנו לתמיכה.
        </p>
      ) : null}

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
              href={`/auth/register${nextQuery}`}
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
