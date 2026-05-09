"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { PasswordPeekField } from "@/components/auth/password-peek-field";
import { redirectAfterSignIn } from "@/lib/auth/redirect-after-sign-in";
import { setReturningUserFlag } from "@/lib/auth/returning-user";
import { resolveRoleForUser } from "@/lib/auth/supabase-profile";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

function formatLoginError(message: string): string {
  const m = message.trim();
  if (!m) return "התחברות נכשלה (שגיאה לא ידועה).";
  return `שגיאת התחברות: ${m}`;
}

function LoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next");

  const nextQuery = useMemo(() => (nextPath ? `?next=${encodeURIComponent(nextPath)}` : ""), [nextPath]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const handleLogin = async () => {
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

      setReturningUserFlag();
      const effective = await resolveRoleForUser(supabase, data.user);
      redirectAfterSignIn(router, effective, nextPath);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-md space-y-4 py-2" dir="rtl">
      <section className="rounded-3xl bg-white p-6 shadow-soft">
        <h1 className="text-center text-2xl font-bold text-navy-header">התחברות</h1>
        <p className="mt-1 text-center text-sm text-slate-600">הזינו אימייל וסיסמה.</p>

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
            סיסמה
            <div className="mt-1">
              <PasswordPeekField
                value={password}
                onChange={setPassword}
                autoComplete="current-password"
                disabled={busy}
              />
            </div>
          </label>
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={() => void handleLogin()}
          className="mt-6 w-full rounded-2xl bg-[#001F3F] py-3 text-sm font-semibold text-white shadow-soft transition hover:brightness-105 active:brightness-95 disabled:opacity-60"
        >
          התחברות
        </button>

        {message ? (
          <p className="mt-4 rounded-lg bg-rose-50 p-3 text-center text-sm text-rose-950">{message}</p>
        ) : null}

        <p className="mt-6 text-center text-sm text-slate-600">
          אין חשבון?{" "}
          <Link href={`/auth/register${nextQuery}`} className="font-semibold text-navy-header underline">
            הרשמה
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
