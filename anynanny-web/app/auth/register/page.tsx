"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { PasswordPeekField } from "@/components/auth/password-peek-field";
import { redirectAfterSignIn } from "@/lib/auth/redirect-after-sign-in";
import { setReturningUserFlag } from "@/lib/auth/returning-user";
import { ensureProfile, resolveRoleForUser } from "@/lib/auth/supabase-profile";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { ProfileRole } from "@/lib/supabase/profiles";

function RegisterInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next");

  const nextQuery = useMemo(() => (nextPath ? `?next=${encodeURIComponent(nextPath)}` : ""), [nextPath]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<ProfileRole>("parent");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [signupDone, setSignupDone] = useState<{ effective: ProfileRole } | null>(null);

  /** Compare trimmed copies so accidental spaces don’t block a real match. Submit still uses the raw password fields. */
  const passwordsMatch = password.trim() === confirmPassword.trim();
  const showPasswordMismatch =
    !passwordsMatch && (password.length > 0 || confirmPassword.length > 0);
  const submitDisabled = busy || !passwordsMatch;

  useEffect(() => {
    if (!signupDone) return;
    const id = window.setTimeout(() => {
      redirectAfterSignIn(router, signupDone.effective, nextPath);
    }, 1800);
    return () => clearTimeout(id);
  }, [signupDone, router, nextPath]);

  const handleSubmit = async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setMessage("Supabase לא מוגדר. יש לעדכן מפתחות סביבה.");
      return;
    }
    if (password.trim() !== confirmPassword.trim()) {
      setMessage("הסיסמאות אינן תואמות.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const trimmedName = fullName.trim();
      const emailTrim = email.trim();

      const { data, error } = await supabase.auth.signUp({
        email: emailTrim,
        password,
        options: { data: { role, full_name: trimmedName } }
      });
      if (error) {
        setMessage(`הרשמה נכשלה: ${error.message}`);
        return;
      }

      setReturningUserFlag();

      if (data.user) {
        await ensureProfile(supabase, {
          id: data.user.id,
          role,
          full_name: trimmedName || null
        });
      }

      const {
        data: { session: existingSession }
      } = await supabase.auth.getSession();
      let activeUser = existingSession?.user ?? null;

      if (!activeUser) {
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email: emailTrim,
          password
        });
        if (signInError) {
          console.error("[auth/register] signIn after signup:", signInError);
          setMessage(
            `נרשמת בהצלחה, אך ההתחברות האוטומטית נכשלה: ${signInError.message}. ייתכן שנדרש אימות במייל לפני כניסה.`
          );
          return;
        }
        activeUser = signInData.user ?? null;
      }

      if (!activeUser) {
        setMessage("נרשמת בהצלחה. אם נדרש אימות במייל — יש להשלים ואז להתחבר.");
        return;
      }

      const effective = await resolveRoleForUser(supabase, activeUser, role, trimmedName || null);
      setSignupDone({ effective });
    } finally {
      setBusy(false);
    }
  };

  if (signupDone) {
    return (
      <main className="mx-auto flex w-full min-w-0 max-w-full flex-col items-center gap-4 py-2" dir="rtl">
        <section className="w-full min-w-0 max-w-md rounded-3xl bg-white p-8 text-center shadow-soft">
          <p className="text-2xl font-bold text-navy-header">נרשמתם בהצלחה!</p>
          <p className="mt-3 text-sm text-slate-600">מעבירים אתכם לעמוד הבית תוך רגע…</p>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full min-w-0 max-w-full flex-col items-center gap-4 py-2" dir="rtl">
      <section className="w-full min-w-0 max-w-md rounded-3xl bg-white p-6 shadow-soft">
        <h1 className="text-center text-2xl font-bold text-navy-header">הרשמה</h1>
        <p className="mt-1 text-center text-sm text-slate-600">צרו חשבון הורה או בייביסיטר.</p>

        <form
          className="mt-6 space-y-3"
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
              className="mt-1 block min-h-11 min-w-0 w-full rounded-lg border border-navy-header/20 p-2"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
            />
          </label>
          <label className="block min-w-0 text-sm text-navy-900">
            שם מלא
            <input
              type="text"
              autoComplete="name"
              className="mt-1 block min-h-11 min-w-0 w-full rounded-lg border border-navy-header/20 p-2"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="למשל: יעל כהן"
              disabled={busy}
            />
          </label>
          <label className="block min-w-0 text-sm text-navy-900">
            תפקיד
            <select
              className="mt-1 block min-h-11 min-w-0 w-full rounded-lg border border-navy-header/20 p-2"
              value={role}
              onChange={(e) => setRole(e.target.value as ProfileRole)}
              disabled={busy}
            >
              <option value="parent">הורה</option>
              <option value="sitter">בייביסיטר</option>
            </select>
          </label>
          <label className="block min-w-0 text-sm text-navy-900">
            סיסמה
            <input
              type="text"
              autoComplete="new-password"
              className="mt-1 block min-h-11 min-w-0 w-full rounded-lg border border-navy-header/20 p-2"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
            />
          </label>
          <label className="block min-w-0 text-sm text-navy-900">
            אימות סיסמה
            <div className="mt-1 min-w-0">
              <PasswordPeekField
                value={confirmPassword}
                onChange={setConfirmPassword}
                autoComplete="new-password"
                disabled={busy}
                className="min-w-0"
              />
            </div>
            {showPasswordMismatch ? (
              <p className="mt-2 text-sm font-medium text-red-600" role="alert">
                הסיסמאות אינן תואמות
              </p>
            ) : null}
          </label>

          <button
            type="submit"
            disabled={submitDisabled}
            className="mt-6 w-full rounded-2xl bg-[#001F3F] py-3 text-sm font-semibold text-white shadow-soft transition hover:brightness-105 active:brightness-95 disabled:opacity-60"
          >
            הרשמה
          </button>
        </form>

        {message ? (
          <p className="mt-4 rounded-lg bg-rose-50 p-3 text-center text-sm text-rose-950">{message}</p>
        ) : null}

        <p className="mt-6 text-center text-sm text-slate-600">
          כבר רשומים?{" "}
          <Link href={`/auth/login${nextQuery}`} className="font-semibold text-navy-header underline">
            התחברות
          </Link>
        </p>
      </section>

      <div className="flex w-full min-w-0 justify-center gap-4 px-1 text-sm">
        <Link href={`/auth${nextQuery}`} className="font-semibold text-navy-header underline">
          חזרה
        </Link>
        <Link href="/?manual=true" className="text-slate-600 underline">
          מסך הבית
        </Link>
      </div>
    </main>
  );
}

export default function RegisterPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex min-w-0 max-w-full justify-center py-10 text-center text-sm text-slate-600" dir="rtl">
          טוען...
        </main>
      }
    >
      <RegisterInner />
    </Suspense>
  );
}
