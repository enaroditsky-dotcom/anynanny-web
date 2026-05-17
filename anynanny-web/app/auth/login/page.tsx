"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { PasswordPeekField } from "@/components/auth/password-peek-field";
import { navigateAfterAuth } from "@/lib/auth/redirect-after-sign-in";
import {
  readLastUsedEmail,
  saveLastUsedEmail,
  setReturningUserFlag,
  setUserRoleChoice
} from "@/lib/auth/returning-user";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

function formatLoginError(message: string): string {
  const m = message.trim();
  if (!m) return "התחברות נכשלה (שגיאה לא ידועה).";
  return `שגיאת התחברות: ${m}`;
}

function LoginInner() {
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next");
  const emailFromQuery = searchParams.get("email");
  const roleFromQuery = searchParams.get("role");

  /** When true, user is already signed in — hide form and leave login immediately. */
  const [bypassLogin, setBypassLogin] = useState(false);

  const nextQuery = useMemo(() => {
    const params = new URLSearchParams();
    if (nextPath) params.set("next", nextPath);
    if (roleFromQuery === "parent" || roleFromQuery === "sitter") params.set("role", roleFromQuery);
    const s = params.toString();
    return s ? `?${s}` : "";
  }, [nextPath, roleFromQuery]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

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
  }, [roleFromQuery]);

  /** Already signed in — redirect before showing the login form (stops login loops). */
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    let cancelled = false;

    const redirectIfSignedIn = async () => {
      const {
        data: { session }
      } = await supabase.auth.getSession();
      const user = session?.user;
      if (cancelled || !user) return;
      setBypassLogin(true);
      await navigateAfterAuth(supabase, user.id, nextPath, user.email ?? null);
    };

    void redirectIfSignedIn();

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === "SIGNED_IN" && session?.user) {
        setBypassLogin(true);
        void navigateAfterAuth(supabase, session.user.id, nextPath, session.user.email ?? null);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [nextPath]);

  if (bypassLogin) {
    return (
      <main className="mx-auto max-w-md py-10 text-center text-sm text-slate-600" dir="rtl">
        כבר מחוברים — מעבירים לדשבורד…
      </main>
    );
  }

  const handleSubmit = async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setMessage("Supabase לא מוגדר. יש לעדכן מפתחות סביבה.");
      return;
    }
    const emailTrim = email.trim();
    if (!emailTrim) {
      setMessage("נא להזין כתובת אימייל.");
      return;
    }

    setBusy(true);
    setMessage("");
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: emailTrim,
        password
      });
      if (error) {
        console.log("[auth/login] signInWithPassword error:", error);
        setMessage(formatLoginError(error.message));
        return;
      }
      if (!data.session?.user || !data.user) {
        setMessage("לא נוצרה סשן לאחר ההתחברות. נסו שוב או בדקו הגדרות Supabase.");
        return;
      }

      const {
        data: { session: verifySession }
      } = await supabase.auth.getSession();
      if (!verifySession) {
        setMessage("הסשן לא נשמר בדפדפן. נקו קוקיות / נסו חלון גלישה פרטית.");
        return;
      }

      await supabase.auth.refreshSession();

      setReturningUserFlag();
      saveLastUsedEmail(emailTrim);
      await navigateAfterAuth(supabase, data.user.id, nextPath, data.user.email);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto flex w-full min-w-0 max-w-full flex-col items-center gap-4 py-2" dir="rtl" suppressHydrationWarning>
      <section className="w-full min-w-0 max-w-md rounded-3xl bg-white p-6 shadow-soft" suppressHydrationWarning>
        <h1 className="text-center text-2xl font-bold text-navy-header">התחברות</h1>
        <p className="mt-1 text-center text-sm text-slate-600">הזינו אימייל וסיסמה.</p>

        <form
          className="mt-6 space-y-3"
          suppressHydrationWarning
          onSubmit={(e) => {
            e.preventDefault();
            void handleSubmit();
          }}
          noValidate
        >
          <label className="block min-w-0 text-sm text-navy-900">
            אימייל
            <input
              type="email"
              autoComplete="email"
              suppressHydrationWarning
              className="mt-1 block min-h-11 min-w-0 w-full rounded-lg border border-navy-header/20 p-2"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
            />
          </label>
          <label className="block min-w-0 text-sm text-navy-900">
            סיסמה
            <div className="mt-1 min-w-0">
              <PasswordPeekField
                value={password}
                onChange={setPassword}
                autoComplete="current-password"
                disabled={busy}
                className="min-w-0"
              />
            </div>
          </label>

          <button
            type="submit"
            disabled={busy}
            suppressHydrationWarning
            className="mt-6 w-full rounded-2xl bg-[#001F3F] py-3 text-sm font-semibold text-white shadow-soft transition hover:brightness-105 active:brightness-95 disabled:opacity-60"
          >
            התחברות
          </button>
        </form>

        {message ? (
          <p className="mt-4 rounded-lg bg-rose-50 p-3 text-center text-sm text-rose-950">{message}</p>
        ) : null}

        <p className="mt-6 text-center text-sm text-slate-600">
          אין חשבון?{" "}
          <Link href={`/auth/register${nextQuery}`} suppressHydrationWarning className="font-semibold text-navy-header underline">
            הרשמה
          </Link>
        </p>
      </section>

      <div className="flex w-full min-w-0 justify-center gap-4 px-1 text-sm">
        <Link href={`/auth${nextQuery}`} suppressHydrationWarning className="font-semibold text-navy-header underline">
          חזרה
        </Link>
        <Link href="/?manual=true" suppressHydrationWarning className="text-slate-600 underline">
          מסך הבית
        </Link>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-md py-10 text-center text-sm text-slate-600" dir="rtl">
          טוען...
        </main>
      }
    >
      <LoginInner />
    </Suspense>
  );
}
