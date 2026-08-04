"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PasswordPeekField } from "@/components/auth/password-peek-field";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

function ResetPasswordInner() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setChecking(false);
      setMessage("Supabase לא מוגדר.");
      return;
    }

    let cancelled = false;

    void (async () => {
      const {
        data: { session }
      } = await supabase.auth.getSession();
      if (cancelled) return;
      if (session) {
        setReady(true);
        setChecking(false);
      }
    })();

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && session)) {
        setReady(true);
        setChecking(false);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setMessage("Supabase לא מוגדר.");
      return;
    }
    if (password.length < 6) {
      setMessage("הסיסמה חייבת להכיל לפחות 6 תווים.");
      return;
    }
    if (password !== confirmPassword) {
      setMessage("הסיסמאות אינן תואמות.");
      return;
    }

    setBusy(true);
    setMessage("");
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setSuccess(true);
    window.setTimeout(() => {
      router.replace("/auth/login");
    }, 1800);
  };

  return (
    <main
      className="mx-auto flex h-full min-h-0 w-full max-w-md flex-col items-center justify-center gap-4 overflow-hidden px-1 py-2"
      dir="rtl"
    >
      <section className="w-full min-w-0 rounded-3xl border border-[#001F3F]/10 bg-white p-6 shadow-soft">
        <h1 className="text-center text-2xl font-bold text-navy-header">איפוס סיסמה</h1>
        <p className="mt-1 text-center text-sm text-slate-600">בחרו סיסמה חדשה לחשבון שלכם.</p>

        {checking ? (
          <p className="mt-6 text-center text-sm text-slate-600">מאמתים קישור…</p>
        ) : null}

        {!checking && !ready ? (
          <div className="mt-6 space-y-3 text-center">
            <p className="text-sm text-rose-800">הקישור אינו תקף או שפג תוקפו.</p>
            <Link href="/auth/login" className="text-sm font-semibold text-navy-header underline">
              חזרה להתחברות
            </Link>
          </div>
        ) : null}

        {ready && !success ? (
          <form
            className="mt-6 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void handleSubmit();
            }}
            noValidate
          >
            <label className="block min-w-0 text-sm text-navy-900">
              סיסמה חדשה
              <div className="mt-1 min-w-0">
                <PasswordPeekField
                  value={password}
                  onChange={setPassword}
                  autoComplete="new-password"
                  disabled={busy}
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
                />
              </div>
            </label>
            <button
              type="submit"
              disabled={busy}
              className="mt-4 w-full rounded-2xl bg-[#001F3F] py-3 text-sm font-semibold text-white shadow-soft transition hover:brightness-105 active:brightness-95 disabled:opacity-60"
            >
              {busy ? "שומרים…" : "שמירת סיסמה חדשה"}
            </button>
          </form>
        ) : null}

        {success ? (
          <p className="mt-6 rounded-lg bg-emerald-50 p-3 text-center text-sm text-emerald-900">
            הסיסמה עודכנה בהצלחה. מעבירים להתחברות…
          </p>
        ) : null}

        {message ? (
          <p className="mt-4 rounded-lg bg-rose-50 p-3 text-center text-sm text-rose-950">{message}</p>
        ) : null}
      </section>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-md py-10 text-center text-sm text-slate-600" dir="rtl">
          טוען…
        </main>
      }
    >
      <ResetPasswordInner />
    </Suspense>
  );
}
