"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { WelcomeVideoPlayer } from "@/components/welcome/welcome-video-player";
import { loadProductProfileOwnership } from "@/lib/auth/product-profiles";
import {
  nextPathAfterWelcome,
  parseWelcomeMode,
  personalAreaPathForRole,
  resolveFlowRole,
  sanitizeSignupNext,
  welcomeHref
} from "@/lib/charter/routing";
import { isCharterType } from "@/lib/charter/versions";
import type { ProfileRole } from "@/lib/supabase/profiles";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { hasPlayedSignupWelcome, markSignupWelcomePlayed } from "@/lib/welcome/session";
import { AnyNannyLogo } from "@/components/brand/anynanny-logo";

function WelcomeFlowInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mode = parseWelcomeMode(searchParams.get("mode"));
  const queryRole = searchParams.get("role");
  const nextParam = searchParams.get("next");
  const fromParam = searchParams.get("from");
  const [role, setRole] = useState<ProfileRole | null>(isCharterType(queryRole) ? queryRole : null);
  const [ready, setReady] = useState(false);

  const replayReturnPath = useMemo(() => {
    if (fromParam && fromParam.startsWith("/") && !fromParam.startsWith("//")) {
      return fromParam;
    }
    return personalAreaPathForRole(role ?? "parent");
  }, [fromParam, role]);

  const signupDestination = useMemo(() => {
    const resolved = resolveFlowRole(queryRole, null);
    if (!resolved) return "/register";
    return nextPathAfterWelcome(resolved, nextParam);
  }, [nextParam, queryRole]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const nextRole = resolveFlowRole(queryRole, null);

      if (mode === "replay") {
        const supabase = getSupabaseBrowserClient();
        if (!supabase) {
          router.replace("/auth/login");
          return;
        }
        const {
          data: { user }
        } = await supabase.auth.getUser();
        if (!user) {
          const replayRole = nextRole ?? "parent";
          const login = new URL("/auth/login", "http://local");
          login.searchParams.set("next", welcomeHref(replayRole, "replay"));
          login.searchParams.set("role", replayRole);
          router.replace(`${login.pathname}${login.search}`);
          return;
        }
        const replayRole = nextRole ?? "parent";
        if (!cancelled) {
          setRole(replayRole);
          setReady(true);
        }
        return;
      }

      if (!nextRole) {
        router.replace("/");
        return;
      }

      if (hasPlayedSignupWelcome(nextRole)) {
        router.replace(nextPathAfterWelcome(nextRole, nextParam));
        return;
      }

      const supabase = getSupabaseBrowserClient();
      if (supabase && !sanitizeSignupNext(nextParam)) {
        const {
          data: { user }
        } = await supabase.auth.getUser();
        if (user) {
          const ownership = await loadProductProfileOwnership(supabase, user.id);
          const onboardingComplete =
            nextRole === "parent"
              ? Boolean(ownership?.parentOnboardingComplete)
              : Boolean(ownership?.sitterOnboardingComplete);
          if (onboardingComplete) {
            router.replace(nextRole === "parent" ? "/parent/dashboard" : "/sitter/dashboard");
            return;
          }
        }
      }

      if (!cancelled) {
        setRole(nextRole);
        setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mode, nextParam, queryRole, router]);

  const handleMandatoryComplete = useCallback(() => {
    if (!role) {
      router.replace(signupDestination);
      return;
    }
    markSignupWelcomePlayed(role);
    router.replace(nextPathAfterWelcome(role, nextParam));
  }, [nextParam, role, router, signupDestination]);

  if (!ready || !role) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md items-center justify-center bg-[#FDFBF6] px-4" dir="rtl">
        <p className="text-sm text-slate-600">טוענים…</p>
      </main>
    );
  }

  return (
    <main
      className="mx-auto flex min-h-dvh w-full min-w-0 max-w-md flex-col bg-[#FDFBF6] px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))]"
      dir="rtl"
    >
      <section className="rounded-3xl border border-[#001F3F]/10 bg-white p-5 shadow-soft">
        <header className="mb-4 text-center">
          <div className="mb-3 flex justify-center">
            <AnyNannyLogo variant="header" decorative />
          </div>
          <h1 className="text-2xl font-bold text-navy-header">ברוכים הבאים ל-AnyNanny</h1>
          {mode === "mandatory" ? (
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              סרטון קצר לפני שמתחילים.
            </p>
          ) : (
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              ניתן לצפות שוב בסרטון ההיכרות בכל עת.
            </p>
          )}
        </header>

        <WelcomeVideoPlayer mode={mode} onMandatoryComplete={handleMandatoryComplete} />

        {mode === "replay" ? (
          <button
            type="button"
            onClick={() => router.push(replayReturnPath)}
            className="mt-5 min-h-12 w-full rounded-xl border border-navy-header/15 bg-white text-base font-bold text-navy-header"
          >
            חזרה לאזור האישי
          </button>
        ) : null}
      </section>
    </main>
  );
}

export function WelcomeFlowPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex min-h-dvh w-full max-w-md items-center justify-center bg-[#FDFBF6]" dir="rtl">
          <p className="text-sm text-slate-600">טוענים…</p>
        </main>
      }
    >
      <WelcomeFlowInner />
    </Suspense>
  );
}
