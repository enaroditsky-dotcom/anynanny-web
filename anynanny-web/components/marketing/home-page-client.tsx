"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  getParentOnboardingGateRedirect,
  getSitterOnboardingGateRedirect
} from "@/lib/auth/post-auth-destination";
import { loadProductProfileOwnership, roleMismatchHref } from "@/lib/auth/product-profiles";
import { welcomeSignupHref } from "@/lib/charter/routing";
import { setUserRoleChoice } from "@/lib/auth/returning-user";
import { hasPasswordRecoveryEvent } from "@/lib/auth/password-recovery-state";
import {
  forwardExplicitRecoveryCallback,
  readAuthCallbackParams
} from "@/lib/auth/password-reset";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { MarketingHome } from "@/components/marketing/marketing-home";
import type { MarketingPath } from "@/components/marketing/marketing-header";

type LandingPath = MarketingPath;

function HomeInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isManual = searchParams.get("manual") === "true";
  const [registrationOpen, setRegistrationOpen] = useState(false);
  const hasRecoveryCallback = searchParams.get("type")?.toLowerCase() === "recovery";

  useEffect(() => {
    const hash = window.location.hash;
    const search = window.location.search;
    const callback = readAuthCallbackParams(search, hash);

    if (forwardExplicitRecoveryCallback()) return;

    if (hasPasswordRecoveryEvent()) {
      window.location.replace(`/auth/reset-password${search}${hash}`);
      return;
    }

    if (callback.isRecoveryType) {
      window.location.replace(`/auth/reset-password${search}${hash}`);
      return;
    }

    if (hash.includes("error") || search.includes("error")) {
      const queryString = search
        ? search
        : `?${hash.replace("#", "")}`;

      router.replace(`/auth/verified${queryString}`);
      return;
    }

    if (isManual) return;

    try {
      const activeRole = localStorage.getItem("active_role");

      if (activeRole === "parent" || activeRole === "sitter") {
        void (async () => {
          const supabase = getSupabaseBrowserClient();
          if (!supabase) return;
          const {
            data: { user }
          } = await supabase.auth.getUser();
          if (!user) return;
          const ownership = await loadProductProfileOwnership(supabase, user.id);
          if (activeRole === "parent") {
            if (!ownership?.hasParent) {
              router.replace(roleMismatchHref("parent"));
              return;
            }
            const dest = await getParentOnboardingGateRedirect(supabase, user.id, "/parent/dashboard");
            router.replace(dest ?? "/parent/dashboard");
            return;
          }
          if (!ownership?.hasSitter) {
            router.replace(roleMismatchHref("sitter"));
            return;
          }
          const dest = await getSitterOnboardingGateRedirect(supabase, user.id, "/sitter/dashboard");
          router.replace(dest ?? "/sitter/dashboard");
        })();
      }
    } catch {
      /* ignore */
    }
  }, [isManual, router, searchParams]);

  const navigateWithPath = (
    action: "login" | "register",
    path: LandingPath
  ) => {
    const profileRole = path === "parent" ? "parent" : "sitter";

    setUserRoleChoice(profileRole);

    try {
      localStorage.setItem(
        "anynanny_service_track",
        path === "sitter" ? "babysitter" : "parent"
      );
    } catch {
      /* ignore */
    }

    const qs = new URLSearchParams({
      role: profileRole,
      track: "babysitter"
    });

    if (action === "register") {
      setRegistrationOpen(true);
      router.push(welcomeSignupHref(profileRole, `/register?${qs.toString()}`));
      return;
    }

    router.push(`/login?${qs.toString()}`);
  };

  if (hasRecoveryCallback) {
    return (
      <main
        className="flex min-h-[100dvh] items-center justify-center bg-[#FDFBF6] px-4"
        dir="rtl"
      >
        <p className="text-center text-base text-slate-600">מעבירים לאיפוס סיסמה…</p>
      </main>
    );
  }

  return <MarketingHome onNavigate={navigateWithPath} />;
}

export function HomePageClient() {
  return (
    <Suspense
      fallback={
        <main
          className="flex min-h-[100dvh] items-center justify-center bg-[#FDFBF6]"
          dir="rtl"
        >
          <p className="text-sm text-slate-500">טוען...</p>
        </main>
      }
    >
      <HomeInner />
    </Suspense>
  );
}
