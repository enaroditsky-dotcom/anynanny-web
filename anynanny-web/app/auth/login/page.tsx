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
// --- התיקון: אימפורט ישיר ---
import { createBrowserClient } from "@supabase/ssr";

// --- התיקון: הגדרה קבועה של הלקוח ---
const supabase = createBrowserClient(
  "https://dqycvddpdhxawdgdatfe.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxeWN2ZGRwZGh4YXdkZ2RhdGZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgyNDMzNTEsImV4cCI6MjA5MzgxOTM1MX0.1nIMudhzgs1j41tzA4VhtEQjdIhztFWMmDoFU1G69-I"
);

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

  // --- התיקון: שימוש בלקוח הישיר ---
  useEffect(() => {
    let cancelled = false;

    const redirectIfSignedIn = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (cancelled || !user) return;
      setBypassLogin(true);
      await navigateAfterAuth(supabase, user.id, nextPath, user.email ?? null);
    };

    void redirectIfSignedIn();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
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
        setMessage(formatLoginError(error.message));
        return;
      }
      
      setReturningUserFlag();
      saveLastUsedEmail(emailTrim);
      await navigateAfterAuth(supabase, data.user.id, nextPath, data.user.email);
    } catch (err: any) {
      setMessage("שגיאה בהתחברות. נסו שוב.");
    } finally {
      setBusy(false);
    }
  };

  // ... (השאר נשאר אותו דבר כמו בקוד המקורי שלך)
  return (
    <main className="mx-auto flex w-full min-w-0 max-w-full flex-col items-center gap-4 py-2" dir="rtl" suppressHydrationWarning>
      <section className="w-full min-w-0 max-w-md rounded-3xl bg-white p-6 shadow-soft" suppressHydrationWarning>
        <h1 className="text-center text-2xl font-bold text-navy-header">התחברות</h1>
        <form className="mt-6 space-y-3" onSubmit={(e) => { e.preventDefault(); void handleSubmit(); }} noValidate>
          <label className="block text-sm">אימייל
            <input type="email" className="mt-1 block w-full rounded-lg border p-2" value={email} onChange={(e) => setEmail(e.target.value)} disabled={busy} />
          </label>
          <label className="block text-sm">סיסמה
            <PasswordPeekField value={password} onChange={setPassword} disabled={busy} />
          </label>
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