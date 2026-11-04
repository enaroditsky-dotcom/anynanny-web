"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { AUTH_SERVICE_UNAVAILABLE_MESSAGE } from "@/lib/auth/auth-retry";
import { AuthRetryStatus, useOnlineRetryNonce } from "@/lib/auth/use-online-retry-nonce";
import { protectedScreenGate, resolveValidAuthUser } from "@/lib/auth/valid-session";
import { CharterAcceptanceScreen } from "@/components/charter/charter-acceptance-screen";
import { CharterFullDocument } from "@/components/charter/charter-full-document";
import { hasAcceptedCurrentCharter } from "@/lib/charter/acceptance";
import { nextPathAfterCharterAcceptance, parseCharterMode, resolveFlowRole } from "@/lib/charter/routing";
import { isCharterType } from "@/lib/charter/versions";
import { loadProductProfileOwnership } from "@/lib/auth/product-profiles";
import type { ProfileRole } from "@/lib/supabase/profiles";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

function CharterFlowInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mode = parseCharterMode(searchParams.get("mode"));
  const queryRole = searchParams.get("role");
  const [role, setRole] = useState<ProfileRole | null>(isCharterType(queryRole) ? queryRole : null);
  const [ready, setReady] = useState(false);
  const [serviceMissing, setServiceMissing] = useState(false);
  const authRetry = useOnlineRetryNonce();

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        if (!cancelled) setServiceMissing(true);
        return;
      }
      if (!cancelled) setServiceMissing(false);

      const gate = protectedScreenGate(await resolveValidAuthUser(supabase));
      if (cancelled) return;
      if (gate.status === "unavailable") {
        authRetry.noteUnavailable();
        return;
      }
      authRetry.noteSettled();
      if (gate.status === "signed_out") {
        router.replace(`/auth/login?next=/charter${queryRole ? `&role=${queryRole}` : ""}`);
        return;
      }
      const user = gate.user;

      const ownership = await loadProductProfileOwnership(supabase, user.id);
      const nextRole = resolveFlowRole(queryRole, ownership?.role ?? null);
      if (!nextRole) {
        router.replace("/auth/role-selection");
        return;
      }

      if (mode === "readonly") {
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

      if (!cancelled) {
        setRole(nextRole);
        setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authRetry.nonce, authRetry.noteSettled, authRetry.noteUnavailable, mode, queryRole, router]);

  if (serviceMissing) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md items-center justify-center bg-[#FDFBF6] px-4" dir="rtl">
        <p className="text-center text-sm text-slate-600">{AUTH_SERVICE_UNAVAILABLE_MESSAGE}</p>
      </main>
    );
  }

  if (!ready || !role) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md items-center justify-center bg-[#FDFBF6]" dir="rtl">
        <AuthRetryStatus exhausted={authRetry.exhausted} onRetry={authRetry.retryNow} pending="טוענים…" />
      </main>
    );
  }

  if (mode === "readonly") {
    const backHref = role === "sitter" ? "/sitter/settings" : "/parent/settings";
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-[#FDFBF6] px-4 py-6" dir="rtl">
        <button
          type="button"
          onClick={() => router.push(backHref)}
          className="mb-4 min-h-11 self-start text-sm font-semibold text-navy-header"
        >
          חזרה
        </button>
        <CharterFullDocument type={role} />
      </main>
    );
  }

  return <CharterAcceptanceScreen role={role} />;
}

export function CharterFlowPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex min-h-dvh w-full max-w-md items-center justify-center bg-[#FDFBF6]" dir="rtl">
          <p className="text-sm text-slate-600">טוענים…</p>
        </main>
      }
    >
      <CharterFlowInner />
    </Suspense>
  );
}
