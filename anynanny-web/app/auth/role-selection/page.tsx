"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { RoleSelectionScreen } from "@/components/auth/role-selection-screen";
import {
  AUTH_LOGIN_WITH_ROLE_SELECTION_NEXT,
  isNannyOnboardingBypassEmail,
  isSitterTestBypassEmail,
  resolvePostAuthPath,
  sanitizeNextParam,
  userNeedsRoleSelection
} from "@/lib/auth/post-auth-destination";
import { setUserRoleChoice } from "@/lib/auth/returning-user";
import { ensureProfile } from "@/lib/auth/supabase-profile";
import { resolveNamePartsFromAuthUser } from "@/lib/user/greeting-display-name";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { isPostgrestMissingColumnError } from "@/lib/supabase/postgrest-schema";
import { ensureSitterProfileRowForUser } from "@/lib/sitter/sitter-profile";
import { PROFILES_TABLE, type ProfileRole } from "@/lib/supabase/profiles";

type SessionGate = "checking" | "authed" | "anon";

function RoleSelectionInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextParam = sanitizeNextParam(searchParams.get("next"));

  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<ProfileRole | null>(null);
  const [sessionGate, setSessionGate] = useState<SessionGate>("checking");

  useEffect(() => {
    let cancelled = false;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setSessionGate("anon");
      return;
    }

    void (async () => {
      const {
        data: { user }
      } = await supabase.auth.getUser();

      if (cancelled) return;

      if (!user) {
        setSessionGate("anon");
        router.replace(AUTH_LOGIN_WITH_ROLE_SELECTION_NEXT);
        return;
      }

      if (isNannyOnboardingBypassEmail(user.email) || isSitterTestBypassEmail(user.email)) {
        const dest = await resolvePostAuthPath(supabase, user.id, nextParam, { userEmail: user.email });
        if (!cancelled) window.location.assign(dest);
        return;
      }

      const stillNeedsRole = await userNeedsRoleSelection(supabase, user.id, { userEmail: user.email });
      if (cancelled) return;

      if (!stillNeedsRole) {
        const dest = await resolvePostAuthPath(supabase, user.id, nextParam, { userEmail: user.email });
        if (!cancelled) window.location.assign(dest);
        return;
      }

      setSessionGate("authed");
    })();

    return () => {
      cancelled = true;
    };
  }, [router, nextParam]);

  const choose = useCallback(
    async (role: ProfileRole) => {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        setMessage("Supabase לא מוגדר.");
        return;
      }
      setBusy(role);
      setMessage("");
      try {
        const {
          data: { user }
        } = await supabase.auth.getUser();
        if (!user) {
          router.replace(AUTH_LOGIN_WITH_ROLE_SELECTION_NEXT);
          return;
        }

        const nameParts = resolveNamePartsFromAuthUser(user);
        const { error: profErr } = await ensureProfile(supabase, {
          id: user.id,
          role,
          ...nameParts
        });
        if (profErr) {
          setMessage(profErr);
          return;
        }

        const { error: uErr } = await supabase.auth.updateUser({ data: { role } });
        if (uErr) {
          setMessage(uErr.message);
          return;
        }

        const now = new Date().toISOString();
        let { error: selErr } = await supabase
          .from(PROFILES_TABLE)
          .update({ role, role_selected: true, updated_at: now })
          .eq("id", user.id);
        if (selErr && isPostgrestMissingColumnError(selErr.message, "role_selected")) {
          ({ error: selErr } = await supabase.from(PROFILES_TABLE).update({ role, updated_at: now }).eq("id", user.id));
        }
        if (selErr) {
          setMessage(selErr.message);
          return;
        }

        if (role === "sitter") {
          const { error: sitterRowErr } = await ensureSitterProfileRowForUser(supabase, user.id);
          if (sitterRowErr) {
            setMessage(sitterRowErr);
            return;
          }
        }

        await supabase.auth.refreshSession();
        setUserRoleChoice(role);

        const dest = await resolvePostAuthPath(supabase, user.id, nextParam, { userEmail: user.email });
        window.location.assign(dest);
      } finally {
        setBusy(null);
      }
    },
    [router, nextParam]
  );

  if (sessionGate === "checking") {
    return (
      <main className="mx-auto flex min-h-[70vh] w-full max-w-lg flex-col items-center justify-center px-4 py-10" dir="rtl">
        <p className="text-center text-sm text-slate-600">טוענים…</p>
      </main>
    );
  }

  if (sessionGate === "anon") {
    return (
      <main className="mx-auto flex min-h-[70vh] w-full max-w-lg flex-col items-center justify-center px-4 py-10" dir="rtl">
        <p className="text-center text-sm text-slate-600">מעבירים להתחברות…</p>
      </main>
    );
  }

  return <RoleSelectionScreen busy={busy} message={message} onChoose={(role) => void choose(role)} />;
}

export default function RoleSelectionPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex min-h-[70vh] w-full max-w-lg flex-col items-center justify-center px-4 py-10" dir="rtl">
          <p className="text-center text-sm text-slate-600">טוענים…</p>
        </main>
      }
    >
      <RoleSelectionInner />
    </Suspense>
  );
}
