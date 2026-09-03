"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PasswordPeekField } from "@/components/auth/password-peek-field";
import { PageBackButton, PageBackRow } from "@/components/navigation/page-back-link";
import { navigateAfterAuth } from "@/lib/auth/redirect-after-sign-in";
import {
  readLastUsedEmail,
  saveLastUsedEmail,
  setReturningUserFlag,
  setUserRoleChoice
} from "@/lib/auth/returning-user";
import { forgotPasswordHref, forwardExplicitRecoveryCallback, readAuthCallbackParams, resetPasswordCallbackHref } from "@/lib/auth/password-reset";
import { hasPasswordRecoveryEvent } from "@/lib/auth/password-recovery-state";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { AnyNannyLogo } from "@/components/brand/anynanny-logo";

function formatLoginError(message: string): string {
  const m = message.trim();
  if (!m) return "התחברות נכשלה (שגיאה לא ידועה).";
  return `שגיאת התחברות: ${m}`;
}

function LoginInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const nextPath = searchParams.get("next");
  const emailFromQuery = searchParams.get("email");
  const roleFromQuery = searchParams.get("role");
  const trackFromQuery = (searchParams.get("track") || "").trim().toLowerCase();

  const [bypassLogin, setBypassLogin] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const supabase = getSupabaseBrowserClient();

  const loginHeadline = useMemo(() => {
    if (roleFromQuery === "parent") return "כניסת הורים";
    if (roleFromQuery === "sitter" && trackFromQuery === "expert") return "כניסת יועצת / דולה";
    if (roleFromQuery === "sitter") return "כניסת בייביסיטר";
    return "התחברות";
  }, [roleFromQuery, trackFromQuery]);

  useEffect(() => {
    const q = emailFromQuery?.trim();
    if (q) {
      setEmail(q);
    } else {
      const saved = readLastUsedEmail();
      if (saved) setEmail(saved);
    }
  }, [emailFromQuery]);

  useEffect(() => {
    if (roleFromQuery === "parent" || roleFromQuery === "sitter") {
      setUserRoleChoice(roleFromQuery);
    }
    try {
      if (trackFromQuery === "expert") {
        localStorage.setItem("anynanny_service_track", "expert");
      } else if (trackFromQuery === "babysitter") {
        localStorage.setItem("anynanny_service_track", "babysitter");
      } else if (roleFromQuery === "parent") {
        localStorage.setItem("anynanny_service_track", "parent");
      }
    } catch {
      /* ignore */
    }
  }, [roleFromQuery, trackFromQuery]);

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;

    const redirectIfSignedIn = async () => {
      if (forwardExplicitRecoveryCallback()) return;
      if (hasPasswordRecoveryEvent()) {
        window.location.replace(resetPasswordCallbackHref());
        return;
      }
      const callback = readAuthCallbackParams();
      if (callback.isRecoveryType) {
        return;
      }
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (cancelled || !user) return;
      setBypassLogin(true);
      await navigateAfterAuth(
        supabase,
        user.id,
        nextPath,
        user.email ?? null,
        roleFromQuery === "parent" || roleFromQuery === "sitter" ? roleFromQuery : null
      );
    };

    void redirectIfSignedIn();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === "PASSWORD_RECOVERY") {
        window.location.replace(resetPasswordCallbackHref());
        return;
      }
      if (event === "SIGNED_IN" && session?.user) {
        if (hasPasswordRecoveryEvent()) {
          window.location.replace(resetPasswordCallbackHref());
          return;
        }
        const callback = readAuthCallbackParams();
        if (callback.isRecoveryType) {
          return;
        }
        setBypassLogin(true);
        void navigateAfterAuth(
          supabase,
          session.user.id,
          nextPath,
          session.user.email ?? null,
          roleFromQuery === "parent" || roleFromQuery === "sitter" ? roleFromQuery : null
        );
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [nextPath, supabase, roleFromQuery, router]);

  if (bypassLogin) {
    return (
      <main className="mx-auto max-w-md py-10 text-center text-sm text-slate-600" dir="rtl">
        כבר מחוברים — מעבירים לדשבורד…
      </main>
    );
  }

  const handleSubmit = async () => {
    if (!supabase) { setMessage("שגיאת מערכת."); return; }
    const emailTrim = email.trim();
    if (!emailTrim) { setMessage("נא להזין כתובת אימייל."); return; }

    setBusy(true);
    setMessage("");
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: emailTrim,
        password
      });
      if (error) {
        setMessage(formatLoginError(error.message));
        return;
      }
      
      setReturningUserFlag();
      saveLastUsedEmail(emailTrim);
      await navigateAfterAuth(
        supabase,
        data.user.id,
        nextPath,
        data.user.email,
        roleFromQuery === "parent" || roleFromQuery === "sitter" ? roleFromQuery : null
      );
    } catch (err: any) {
      setMessage("שגיאה בהתחברות. נסו שוב.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto flex w-full min-w-0 max-w-full flex-col items-center gap-4 py-2" dir="rtl" suppressHydrationWarning>
      <div className="w-full max-w-md px-4 pt-4">
        <PageBackRow>
          <PageBackButton onClick={() => router.back()} />
        </PageBackRow>
      </div>

      <section className="w-full min-w-0 max-w-md rounded-3xl bg-white p-6 shadow-soft" suppressHydrationWarning>
        <div className="mb-4 flex justify-center">
          <AnyNannyLogo variant="header" />
        </div>
        <h1 className="text-center text-2xl font-bold text-navy-header">{loginHeadline}</h1>
        {roleFromQuery === "sitter" && trackFromQuery === "expert" ? (
          <p className="mt-1 text-center text-xs text-slate-500">הנקה · שינה · דולה</p>
        ) : null}
        <form className="mt-6 space-y-3" onSubmit={(e) => { e.preventDefault(); void handleSubmit(); }} noValidate>
          <label className="block text-sm">אימייל
            <input type="email" className="mt-1 block w-full rounded-lg border p-2" value={email} onChange={(e) => setEmail(e.target.value)} disabled={busy} />
          </label>
          <label className="block text-sm">סיסמה
            <PasswordPeekField value={password} onChange={setPassword} disabled={busy} />
          </label>
          <p className="pt-1 text-right">
            <Link
              href={forgotPasswordHref(
                roleFromQuery === "parent" || roleFromQuery === "sitter" ? roleFromQuery : null,
                trackFromQuery || null
              )}
              className="text-sm font-semibold text-navy-header underline"
            >
              שכחת סיסמה?
            </Link>
          </p>
          <button type="submit" disabled={busy} className="mt-6 w-full rounded-2xl bg-[#001F3F] py-3 text-white">התחברות</button>
        </form>
        {message && <p className="mt-4 p-3 text-center bg-rose-50 text-rose-950 text-sm">{message}</p>}
      </section>
    </main>
  );
}

export default function LoginPage() {
  return <Suspense fallback={<p>טוען...</p>}><LoginInner /></Suspense>;
}