"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { PasswordPeekField } from "@/components/auth/password-peek-field";
import { navigateAfterAuth } from "@/lib/auth/redirect-after-sign-in";
import {
  clearUserRoleChoice,
  saveLastUsedEmail,
  setReturningUserFlag
} from "@/lib/auth/returning-user";
import { isPostgrestMissingColumnError } from "@/lib/supabase/postgrest-schema";
import { PROFILES_TABLE } from "@/lib/supabase/profiles";
import { friendlySupabaseSessionError } from "@/lib/session/supabase-errors";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/** Confirmation-email link target; add to Supabase Auth redirect allow list. */
function roleSelectionEmailRedirectTo(): string {
  const origin =
    (typeof process !== "undefined" && process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "")) ||
    "http://localhost:3000";
  return `${origin}/auth/role-selection`;
}

function RegisterInner() {
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next");

  const nextQuery = useMemo(() => {
    const params = new URLSearchParams();
    if (nextPath) params.set("next", nextPath);
    const s = params.toString();
    return s ? `?${s}` : "";
  }, [nextPath]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const passwordsMatch = password.trim() === confirmPassword.trim();
  const showPasswordMismatch =
    !passwordsMatch && (password.length > 0 || confirmPassword.length > 0);

  const handleSubmit = async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setMessage("Supabase לא מוגדר. יש לעדכן מפתחות סביבה.");
      return;
    }

    if (!email.trim() || !validateEmail(email)) {
      setMessage("יש להזין כתובת אימייל תקינה.");
      return;
    }
    if (password.length < 6) {
      setMessage("הסיסמה חייבת להכיל לפחות 6 תווים.");
      return;
    }
    if (!passwordsMatch) {
      setMessage("הסיסמאות אינן תואמות.");
      return;
    }

    setBusy(true);
    setMessage("");
    try {
      const emailTrim = email.trim();

      const { data, error } = await supabase.auth.signUp({
        email: emailTrim,
        password,
        options: {
          emailRedirectTo: roleSelectionEmailRedirectTo(),
          data: {}
        }
      });
      if (error) {
        setMessage(`הרשמה נכשלה: ${error.message}`);
        return;
      }

      setReturningUserFlag();

      if (data.user) {
        const withRoleSelected = {
          id: data.user.id,
          role: "parent" as const,
          full_name: null,
          balance: 0,
          role_selected: false
        };
        let { error: pErr } = await supabase.from(PROFILES_TABLE).upsert(withRoleSelected, { onConflict: "id" });
        if (pErr && isPostgrestMissingColumnError(pErr.message, "role_selected")) {
          ({ error: pErr } = await supabase
            .from(PROFILES_TABLE)
            .upsert(
              {
                id: withRoleSelected.id,
                role: withRoleSelected.role,
                full_name: withRoleSelected.full_name,
                balance: withRoleSelected.balance
              },
              { onConflict: "id" }
            ));
        }
        if (pErr) {
          console.warn("[auth/register] profiles upsert:", pErr.message);
        }
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

      const { error: refreshErr } = await supabase.auth.refreshSession();
      if (refreshErr) {
        setMessage(friendlySupabaseSessionError(refreshErr));
        return;
      }

      saveLastUsedEmail(emailTrim);
      clearUserRoleChoice();
      await navigateAfterAuth(supabase, activeUser.id, nextPath, activeUser.email);
    } finally {
      setBusy(false);
    }
  };

  const submitDisabled = busy || !passwordsMatch;

  return (
    <main className="mx-auto flex w-full min-w-0 max-w-full flex-col items-center gap-4 py-2" dir="rtl" suppressHydrationWarning>
      <section className="w-full min-w-0 max-w-md rounded-3xl bg-white p-6 shadow-soft" suppressHydrationWarning>
        <h1 className="text-center text-2xl font-bold text-navy-header">הרשמה</h1>
        <p className="mt-1 text-center text-sm text-slate-600">אימייל וסיסמה — לאחר מכן תבחרו הורה או בייביסיטר.</p>

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
                autoComplete="new-password"
                disabled={busy}
                className="min-w-0"
              />
            </div>
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
          </label>
          {showPasswordMismatch ? (
            <p className="text-sm font-medium text-red-600" role="alert">
              הסיסמאות אינן תואמות
            </p>
          ) : null}
          <button
            type="submit"
            disabled={submitDisabled}
            suppressHydrationWarning
            className="mt-6 w-full rounded-2xl bg-[#001F3F] py-3 text-sm font-semibold text-white shadow-soft transition hover:brightness-105 active:brightness-95 disabled:opacity-60"
          >
            {busy ? "נרשמים…" : "יצירת חשבון"}
          </button>
        </form>

        {message ? (
          <p className="mt-4 rounded-lg bg-rose-50 p-3 text-center text-sm text-rose-950">{message}</p>
        ) : null}

        <p className="mt-6 text-center text-sm text-slate-600">
          כבר רשומים?{" "}
          <Link href={`/auth/login${nextQuery}`} suppressHydrationWarning className="font-semibold text-navy-header underline">
            התחברות
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
