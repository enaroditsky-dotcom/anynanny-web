"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import {
  AUTH_LOGIN_WITH_ROLE_SELECTION_NEXT,
  isNannyOnboardingBypassEmail,
  isSitterTestBypassEmail,
  resolvePostAuthPath,
  sanitizeNextParam
} from "@/lib/auth/post-auth-destination";
import { setUserRoleChoice } from "@/lib/auth/returning-user";
import { ensureProfile } from "@/lib/auth/supabase-profile";
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
      await new Promise((r) => setTimeout(r, 200));
      for (let attempt = 0; attempt < 5; attempt++) {
        if (cancelled) return;
        await supabase.auth.refreshSession();
        const {
          data: { user }
        } = await supabase.auth.getUser();
        if (user) {
          if (isNannyOnboardingBypassEmail(user.email)) {
            window.location.assign("/sitter/dashboard");
            return;
          }
          if (isSitterTestBypassEmail(user.email)) {
            window.location.assign("/sitter/dashboard");
            return;
          }

          let profileRole: string | null = null;
          try {
            const profileRes = await supabase.from(PROFILES_TABLE).select("role").eq("id", user.id).maybeSingle();
            if (profileRes.error) {
              router.replace(AUTH_LOGIN_WITH_ROLE_SELECTION_NEXT);
              return;
            }
            const raw = profileRes.data as unknown;
            if (raw && typeof raw === "object" && "role" in raw) {
              const r = (raw as { role: unknown }).role;
              profileRole = typeof r === "string" ? r : r === null ? null : null;
            }
          } catch {
            router.replace(AUTH_LOGIN_WITH_ROLE_SELECTION_NEXT);
            return;
          }

          if (profileRole === "sitter") {
            window.location.assign("/sitter/dashboard");
            return;
          }

          let dest: string;
          try {
            dest = await resolvePostAuthPath(supabase, user.id, nextParam, { userEmail: user.email });
          } catch {
            router.replace(AUTH_LOGIN_WITH_ROLE_SELECTION_NEXT);
            return;
          }
          const destBase = dest.split("?")[0];
          if (destBase === "/auth/role-selection" && isSitterTestBypassEmail(user.email)) {
            window.location.assign("/sitter/dashboard");
            return;
          }
          if (destBase !== "/auth/role-selection") {
            window.location.assign(dest);
            return;
          }
          if (!cancelled) setSessionGate("authed");
          return;
        }
        await new Promise((r) => setTimeout(r, 180 + attempt * 120));
      }
      if (!cancelled) {
        setSessionGate("anon");
        router.replace(AUTH_LOGIN_WITH_ROLE_SELECTION_NEXT);
      }
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

        const { error: profErr } = await ensureProfile(supabase, { id: user.id, role });
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

        if (role === "parent") {
          window.location.assign("/parent/onboarding");
        } else {
          window.location.assign("/sitter/dashboard");
        }
      } finally {
        setBusy(null);
      }
    },
    [router]
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

  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-lg flex-col items-center justify-center gap-6 px-4 py-10" dir="rtl">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-navy-header">מי אתם?</h1>
        <p className="mt-2 text-sm text-slate-600">בחרו פעם אחת. בייביסיטרים מועברים מיד לדשבורד; עריכת פרופיל מקצועי מהדשבורד (אופציונלי).</p>
      </div>

      <div className="grid w-full max-w-md gap-4">
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void choose("parent")}
          className="rounded-2xl border-2 border-navy-header/15 bg-white px-6 py-8 text-lg font-semibold text-navy-header shadow-soft transition hover:border-emerald-500/40 hover:bg-[#FDFBF6] disabled:opacity-50"
        >
          {busy === "parent" ? "שומרים…" : "אני הורה"}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void choose("sitter")}
          className="rounded-2xl border-2 border-emerald-600/30 bg-emerald-50/80 px-6 py-8 text-lg font-semibold text-emerald-950 shadow-soft transition hover:bg-emerald-100 disabled:opacity-50"
        >
          {busy === "sitter" ? "שומרים…" : "אני בייביסיטר"}
        </button>
      </div>

      {message ? <p className="max-w-md text-center text-sm text-rose-700">{message}</p> : null}

      <p className="text-sm text-slate-500">
        <Link href="/auth/login" className="underline">
          חזרה להתחברות
        </Link>
      </p>
    </main>
  );
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
