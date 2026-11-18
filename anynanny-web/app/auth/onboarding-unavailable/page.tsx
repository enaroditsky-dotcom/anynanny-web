"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { OnboardingUnavailablePanel } from "@/components/auth/onboarding-unavailable-panel";
import { isOnboardingUnavailablePath } from "@/lib/auth/onboarding-state";
import { resolvePostAuthPath } from "@/lib/auth/post-auth-destination";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { ProfileRole } from "@/lib/supabase/profiles";

function requestedRoleFromQuery(value: string | null): ProfileRole | null {
  return value === "parent" || value === "sitter" ? value : null;
}

function OnboardingUnavailableInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedRole = requestedRoleFromQuery(searchParams.get("role"));
  const [attempt, setAttempt] = useState(0);
  const [phase, setPhase] = useState<"loading" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    setPhase("loading");

    void (async () => {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        if (!cancelled) setPhase("error");
        return;
      }

      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (cancelled) return;

      if (!user) {
        const login = new URL("/auth/login", "http://local");
        const next = requestedRole
          ? `/auth/onboarding-unavailable?role=${requestedRole}`
          : "/auth/onboarding-unavailable";
        login.searchParams.set("next", next);
        router.replace(`${login.pathname}${login.search}`);
        return;
      }

      const dest = await resolvePostAuthPath(supabase, user.id, null, {
        userEmail: user.email,
        ...(requestedRole ? { requestedRole } : {})
      });
      if (cancelled) return;

      if (isOnboardingUnavailablePath(dest)) {
        setPhase("error");
        return;
      }

      window.location.assign(dest);
    })();

    return () => {
      cancelled = true;
    };
  }, [attempt, requestedRole, router]);

  return <OnboardingUnavailablePanel phase={phase} onRetry={() => setAttempt((value) => value + 1)} />;
}

export default function OnboardingUnavailablePage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex min-h-[70vh] w-full max-w-lg flex-col items-center justify-center px-4 py-10" dir="rtl">
          <p className="text-center text-sm text-slate-600">בודקים את החשבון…</p>
        </main>
      }
    >
      <OnboardingUnavailableInner />
    </Suspense>
  );
}
