"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageBackButton, PageBackRow } from "@/components/navigation/page-back-link";
import { SITTER_DASHBOARD_PATH, SITTER_ONBOARDING_PATH } from "@/lib/auth/post-auth-destination";
import {
  loadProductProfileOwnership,
  PARENT_DASHBOARD_PATH,
  PARENT_ONBOARDING_PATH,
  secondRoleHref
} from "@/lib/auth/product-profiles";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { isProfileRole, type ProfileRole } from "@/lib/supabase/profiles";

const COPY: Record<
  ProfileRole,
  {
    title: string;
    body: string;
    primary: string;
    secondary: string;
    secondaryHref: string;
    registerRole: ProfileRole;
  }
> = {
  sitter: {
    title: "החשבון שלך רשום כהורה",
    body: "אם ברצונך להשתמש ב-AnyNanny גם כבייביסיטר, יש להשלים הרשמה כבייביסיטר.",
    primary: "הרשמה כבייביסיטר",
    secondary: "חזרה לכניסת הורה",
    secondaryHref: "/login?role=parent",
    registerRole: "sitter"
  },
  parent: {
    title: "החשבון שלך רשום כבייביסיטר",
    body: "אם ברצונך להשתמש ב-AnyNanny גם כהורה, יש להשלים הרשמה כהורה.",
    primary: "הרשמה כהורה",
    secondary: "חזרה לכניסת בייביסיטר",
    secondaryHref: "/login?role=sitter",
    registerRole: "parent"
  }
};

function RoleMismatchInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedRaw = searchParams.get("requested");
  const requested: ProfileRole | null = isProfileRole(requestedRaw) ? requestedRaw : null;
  const copy = requested ? COPY[requested] : null;

  const [status, setStatus] = useState<"loading" | "ready" | "redirecting">("loading");

  useEffect(() => {
    if (!requested) {
      router.replace("/?manual=true");
      return;
    }

    let cancelled = false;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setStatus("ready");
      return;
    }

    void (async () => {
      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!user) {
        setStatus("ready");
        return;
      }

      const ownership = await loadProductProfileOwnership(supabase, user.id);
      if (cancelled) return;

      if (requested === "sitter" && ownership?.hasSitter) {
        setStatus("redirecting");
        router.replace(ownership.sitterOnboardingComplete ? SITTER_DASHBOARD_PATH : SITTER_ONBOARDING_PATH);
        return;
      }

      if (requested === "parent" && ownership?.hasParent) {
        setStatus("redirecting");
        router.replace(ownership.parentOnboardingComplete ? PARENT_DASHBOARD_PATH : PARENT_ONBOARDING_PATH);
        return;
      }

      if (!ownership?.hasParent && !ownership?.hasSitter) {
        setStatus("redirecting");
        router.replace("/auth/role-selection");
        return;
      }

      setStatus("ready");
    })();

    return () => {
      cancelled = true;
    };
  }, [requested, router]);

  if (!copy || status === "loading" || status === "redirecting") {
    return (
      <main className="mx-auto flex min-h-[70vh] w-full max-w-lg flex-col items-center justify-center px-4 py-10" dir="rtl">
        <p className="text-center text-sm text-slate-600">טוענים…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full min-w-0 max-w-md flex-col items-center gap-4 py-8" dir="rtl">
      <div className="w-full px-4">
        <PageBackRow>
          <PageBackButton onClick={() => router.replace(copy.secondaryHref)} />
        </PageBackRow>
      </div>

      <section className="w-full rounded-3xl bg-white p-6 shadow-soft">
        <h1 className="text-center text-2xl font-bold text-navy-header">{copy.title}</h1>
        <p className="mt-3 text-center text-sm leading-relaxed text-slate-600">{copy.body}</p>

        <button
          type="button"
          onClick={() => router.push(secondRoleHref(copy.registerRole))}
          className="mt-6 w-full rounded-2xl bg-[#001F3F] py-3 font-bold text-white"
        >
          {copy.primary}
        </button>

        <button
          type="button"
          onClick={() => router.push(copy.secondaryHref)}
          className="mt-3 w-full rounded-2xl border-2 border-navy-header/15 bg-[#FDFBF6] py-3 font-bold text-navy-header"
        >
          {copy.secondary}
        </button>
      </section>
    </main>
  );
}

export default function RoleMismatchPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex min-h-[70vh] w-full max-w-lg flex-col items-center justify-center px-4 py-10" dir="rtl">
          <p className="text-center text-sm text-slate-600">טוענים…</p>
        </main>
      }
    >
      <RoleMismatchInner />
    </Suspense>
  );
}
