"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AgeGateStep } from "@/components/auth/age-gate-step";
import {
  LEGAL_ACCEPTANCE_REQUIRED_MESSAGE,
  TermsAcceptanceCheckbox
} from "@/components/auth/terms-acceptance-checkbox";
import { PageBackButton, PageBackRow } from "@/components/navigation/page-back-link";
import { ACCOUNT_TYPE_ENTRY_HREF } from "@/lib/auth/age-eligibility";
import { SITTER_DASHBOARD_PATH, SITTER_ONBOARDING_PATH } from "@/lib/auth/post-auth-destination";
import {
  loadProductProfileOwnership,
  markSecondRoleInProgress,
  PARENT_DASHBOARD_PATH,
  PARENT_ONBOARDING_PATH,
  roleMismatchHref
} from "@/lib/auth/product-profiles";
import { createLegalAcceptanceRecord, persistLegalAcceptanceIfUnset } from "@/lib/legal/acceptance";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { isProfileRole, type ProfileRole } from "@/lib/supabase/profiles";

const ROLE_LABELS: Record<ProfileRole, string> = {
  parent: "הורה",
  sitter: "בייביסיטר"
};

function SecondRoleInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const roleRaw = searchParams.get("role");
  const role: ProfileRole | null = isProfileRole(roleRaw) ? roleRaw : null;

  const [sessionState, setSessionState] = useState<"loading" | "ready" | "redirecting">("loading");
  const [ageGatePassed, setAgeGatePassed] = useState(false);
  const [acceptedLegal, setAcceptedLegal] = useState(false);
  const [legalError, setLegalError] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const backHref = useMemo(() => (role ? roleMismatchHref(role) : ACCOUNT_TYPE_ENTRY_HREF), [role]);

  useEffect(() => {
    setAgeGatePassed(false);
    setAcceptedLegal(false);
    setLegalError(null);
    setErrorMsg(null);
  }, [role]);

  useEffect(() => {
    if (!role) {
      router.replace(ACCOUNT_TYPE_ENTRY_HREF);
      return;
    }

    let cancelled = false;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      router.replace(`/login?next=${encodeURIComponent(`/auth/second-role?role=${role}`)}`);
      return;
    }

    void (async () => {
      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (cancelled) return;

      if (!user) {
        router.replace(`/login?role=${role}&next=${encodeURIComponent(`/auth/second-role?role=${role}`)}`);
        return;
      }

      const ownership = await loadProductProfileOwnership(supabase, user.id);
      if (cancelled) return;

      if (role === "sitter" && ownership?.hasSitter) {
        setSessionState("redirecting");
        router.replace(ownership.sitterOnboardingComplete ? SITTER_DASHBOARD_PATH : SITTER_ONBOARDING_PATH);
        return;
      }

      if (role === "parent" && ownership?.hasParent) {
        setSessionState("redirecting");
        router.replace(ownership.parentOnboardingComplete ? PARENT_DASHBOARD_PATH : PARENT_ONBOARDING_PATH);
        return;
      }

      if (!ownership?.hasParent && !ownership?.hasSitter) {
        router.replace("/auth/role-selection");
        return;
      }

      setSessionState("ready");
    })();

    return () => {
      cancelled = true;
    };
  }, [role, router]);

  const handleContinue = async () => {
    if (!role) return;
    if (!ageGatePassed) {
      setErrorMsg("יש לענות על שאלת הגיל כדי להמשיך.");
      return;
    }
    if (!acceptedLegal) {
      setLegalError(LEGAL_ACCEPTANCE_REQUIRED_MESSAGE);
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setErrorMsg("שגיאת מערכת.");
      return;
    }

    setBusy(true);
    setErrorMsg(null);
    setLegalError(null);

    try {
      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace(`/login?role=${role}&next=${encodeURIComponent(`/auth/second-role?role=${role}`)}`);
        return;
      }

      const persist = await persistLegalAcceptanceIfUnset(supabase, user.id, createLegalAcceptanceRecord());
      if (persist.error) {
        console.warn("[second-role] legal acceptance:", persist.error);
      }

      markSecondRoleInProgress(user.id, role);
      router.replace(role === "sitter" ? SITTER_ONBOARDING_PATH : PARENT_ONBOARDING_PATH);
    } catch {
      setErrorMsg("לא ניתן להמשיך בהרשמה. נסו שוב.");
    } finally {
      setBusy(false);
    }
  };

  if (!role || sessionState !== "ready") {
    return (
      <main className="mx-auto flex min-h-[70vh] w-full max-w-lg flex-col items-center justify-center px-4 py-10" dir="rtl">
        <p className="text-center text-sm text-slate-600">טוענים…</p>
      </main>
    );
  }

  if (!ageGatePassed) {
    return (
      <main className="mx-auto max-w-md p-6 sm:p-8" dir="rtl">
        <PageBackRow className="mb-4">
          <PageBackButton onClick={() => router.replace(backHref)} />
        </PageBackRow>
        <AgeGateStep
          role={role}
          onEligible={() => setAgeGatePassed(true)}
          onDeclineExit={() => router.replace(backHref)}
        />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md p-6 sm:p-8" dir="rtl">
      <PageBackRow className="mb-4">
        <PageBackButton onClick={() => router.replace(backHref)} />
      </PageBackRow>

      <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm sm:p-6">
        <header className="mb-6 text-right">
          <h1 className="text-2xl font-bold text-navy-header">הרשמה כ{ROLE_LABELS[role]}</h1>
          <p className="mt-1 text-sm text-slate-600">
            החשבון הקיים יישאר מחובר. זהו פרופיל מוצר נוסף באותו אימייל, לא הרשמה חדשה.
          </p>
        </header>

        {errorMsg ? (
          <p className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{errorMsg}</p>
        ) : null}

        <TermsAcceptanceCheckbox
          id="second-role-legal-acceptance"
          checked={acceptedLegal}
          disabled={busy}
          error={legalError}
          onChange={(checked) => {
            setAcceptedLegal(checked);
            if (checked) setLegalError(null);
          }}
        />

        <button
          type="button"
          disabled={busy}
          onClick={() => void handleContinue()}
          className="mt-6 w-full cursor-pointer rounded-xl bg-navy-header py-4 font-bold text-white transition-colors hover:bg-blue-900 disabled:opacity-50"
        >
          {busy ? "ממשיכים..." : "אישור והמשך"}
        </button>
      </div>
    </main>
  );
}

export default function SecondRolePage() {
  return (
    <Suspense fallback={<div className="p-10 text-center">טוען...</div>}>
      <SecondRoleInner />
    </Suspense>
  );
}
