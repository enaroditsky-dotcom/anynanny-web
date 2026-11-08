"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogoutButton } from "@/components/account/logout-button";
import { SitterPageShell } from "@/components/sitter/sitter-page-shell";
import { SitterPersonalArea } from "@/components/sitter/sitter-personal-area";
import { loadProductProfileOwnership } from "@/lib/auth/product-profiles";
import { AUTH_SERVICE_UNAVAILABLE_MESSAGE } from "@/lib/auth/auth-retry";
import { AuthRetryStatus, useOnlineRetryNonce } from "@/lib/auth/use-online-retry-nonce";
import { protectedScreenGate, resolveValidAuthUser } from "@/lib/auth/valid-session";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export default function SitterProfilePage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
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
        router.replace("/auth/login?next=/sitter/profile");
        return;
      }
      const user = gate.user;

      const ownership = await loadProductProfileOwnership(supabase, user.id);

      if (cancelled) return;

      if (!ownership?.hasSitter) {
        router.replace("/auth/role-mismatch?requested=sitter");
        return;
      }

      setUserId(user.id);
      setAuthReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [authRetry.nonce, authRetry.noteSettled, authRetry.noteUnavailable, router]);

  return (
    <SitterPageShell
      title="אזור אישי"
      subtitle="כל פרטי השאלון והפרופיל המקצועי — ניתן לערוך ולשמור בכל עת."
    >
      {serviceMissing ? (
        <p className="py-8 text-center text-sm text-slate-600">{AUTH_SERVICE_UNAVAILABLE_MESSAGE}</p>
      ) : authReady ? (
        <SitterPersonalArea userId={userId} />
      ) : (
        <div className="py-8">
          <AuthRetryStatus exhausted={authRetry.exhausted} onRetry={authRetry.retryNow} pending="טוען…" />
        </div>
      )}
      {authReady ? (
        <div className="mt-4 shrink-0 border-t border-slate-100 pt-4">
          <LogoutButton />
        </div>
      ) : null}
    </SitterPageShell>
  );
}
