"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
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

  const handleRegister = async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setMessage("Supabase לא מוגדר. יש לעדכן מפתחות סביבה.");
      return;
    }
    if (password !== confirmPassword) {
      setMessage("הסיסמאות אינן תואמות.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const trimmedName = fullName.trim();
      const { data, error } = await supabase.auth.signUp({
        email,
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
          email,
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
      redirectAfterSignIn(router, effective, nextPath);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-md space-y-4 py-2" dir="rtl">
      <section className="rounded-3xl bg-white p-6 shadow-soft">
        <h1 className="text-center text-2xl font-bold text-navy-header">הרשמה</h1>
        <p className="mt-1 text-center text-sm text-slate-600">צרו חשבון הורה או בייביסיטר.</p>

        <div className="mt-6 space-y-3">
          <label className="block text-sm text-navy-900">
            אימייל
            <input
              type="email"
              autoComplete="email"
              className="mt-1 block w-full rounded-lg border border-navy-header/20 p-2"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
            />
          </label>
          <label className="block text-sm text-navy-900">
            שם מלא
            <input
              type="text"
              autoComplete="name"
              className="mt-1 block w-full rounded-lg border border-navy-header/20 p-2"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="למשל: יעל כהן"
              disabled={busy}
            />
          </label>
          <label className="block text-sm text-navy-900">
            תפקיד
            <select
              className="mt-1 block w-full rounded-lg border border-navy-header/20 p-2"
              value={role}
              onChange={(e) => setRole(e.target.value as ProfileRole)}
              disabled={busy}
            >
              <option value="parent">הורה</option>
              <option value="sitter">בייביסיטר</option>
            </select>
          </label>
          <label className="block text-sm text-navy-900">
            סיסמה
            <input
              type="text"
              autoComplete="new-password"
              className="mt-1 block w-full rounded-lg border border-navy-header/20 p-2"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
            />
          </label>
          <label className="block text-sm text-navy-900">
            אימות סיסמה
            <div className="mt-1">
              <PasswordPeekField
                value={confirmPassword}
                onChange={setConfirmPassword}
                autoComplete="new-password"
                disabled={busy}
              />
            </div>
          </label>
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={() => void handleRegister()}
          className="mt-6 w-full rounded-2xl bg-[#001F3F] py-3 text-sm font-semibold text-white shadow-soft transition hover:brightness-105 active:brightness-95 disabled:opacity-60"
        >
          הרשמה
        </button>

        {message ? <p className="mt-4 text-center text-sm text-slate-700">{message}</p> : null}

        <p className="mt-6 text-center text-sm text-slate-600">
          כבר רשומים?{" "}
          <Link href={`/auth/login${nextQuery}`} className="font-semibold text-navy-header underline">
            התחברות
          </Link>
        </p>
      </section>

      <div className="flex justify-center gap-4 text-sm">
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
        <main className="mx-auto max-w-md py-10 text-center text-sm text-slate-600" dir="rtl">
          טוען...
        </main>
      }
    >
      <RegisterInner />
    </Suspense>
  );
}
