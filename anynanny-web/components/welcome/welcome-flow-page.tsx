"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { WelcomeVideoPlayer } from "@/components/welcome/welcome-video-player";
import { hasAcceptedCurrentCharter } from "@/lib/charter/acceptance";
import {
  nextPathAfterCharterAcceptance,
  nextPathAfterWelcome,
  parseWelcomeMode,
  resolveFlowRole,
  welcomeHref
} from "@/lib/charter/routing";
import { isCharterType } from "@/lib/charter/versions";
import { loadProductProfileOwnership } from "@/lib/auth/product-profiles";
import type { ProfileRole } from "@/lib/supabase/profiles";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { hasPlayedWelcomeVideo, markWelcomeVideoPlayed } from "@/lib/welcome/session";

function WelcomeFlowInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mode = parseWelcomeMode(searchParams.get("mode"));
  const queryRole = searchParams.get("role");
  const [role, setRole] = useState<ProfileRole | null>(isCharterType(queryRole) ? queryRole : null);
  const [ready, setReady] = useState(false);

  const replayReturnPath = useMemo(() => {
    if (role === "sitter") return "/sitter/settings";
    return "/parent/settings";
  }, [role]);

  const continueToCharter = useCallback(
    (userId: string, nextRole: ProfileRole) => {
      markWelcomeVideoPlayed(userId);
      router.replace(nextPathAfterWelcome(nextRole));
    },
    [router]
  );

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        router.replace("/auth/login");
        return;
      }

      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (!user) {
        const login = new URL("/auth/login", "http://local");
        login.searchParams.set("next", welcomeHref(isCharterType(queryRole) ? queryRole : "parent", mode));
        if (isCharterType(queryRole)) login.searchParams.set("role", queryRole);
        router.replace(`${login.pathname}${login.search}`);
        return;
      }

      const ownership = await loadProductProfileOwnership(supabase, user.id);
      const nextRole = resolveFlowRole(queryRole, ownership?.role ?? null);
      if (!nextRole) {
        router.replace("/auth/role-selection");
        return;
      }

      if (mode === "replay") {
        if (!cancelled) {
          setRole(nextRole);
          setReady(true);
        }
        return;
      }

      const onboardingComplete =
        nextRole === "parent"
          ? Boolean(ownership?.parentOnboardingComplete)
          : Boolean(ownership?.sitterOnboardingComplete);

      if (onboardingComplete) {
        router.replace(nextRole === "parent" ? "/parent/dashboard" : "/sitter/dashboard");
        return;
      }

      const accepted = await hasAcceptedCurrentCharter(supabase, user.id, nextRole);
      if (accepted) {
        router.replace(nextPathAfterCharterAcceptance(nextRole));
        return;
      }

      if (hasPlayedWelcomeVideo(user.id)) {
        router.replace(nextPathAfterWelcome(nextRole));
        return;
      }

      if (!cancelled) {
        setRole(nextRole);
        setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mode, queryRole, router]);

  const handleMandatoryComplete = useCallback(() => {
    void (async () => {
      const supabase = getSupabaseBrowserClient();
      if (!supabase || !role) {
        if (role) router.replace(nextPathAfterWelcome(role));
        return;
      }
      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace(nextPathAfterWelcome(role));
        return;
      }
      continueToCharter(user.id, role);
    })();
  }, [continueToCharter, role, router]);

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
        <header className="mb-4 text-right">
          <p className="text-xs font-semibold text-[#B8860B]">AnyNanny</p>
          <h1 className="mt-1 text-2xl font-bold text-navy-header">ברוכים הבאים ל-AnyNanny</h1>
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
