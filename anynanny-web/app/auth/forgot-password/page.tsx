"use client";

import Link from "next/link";
import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AuthCardShell } from "@/components/auth/auth-card-shell";
import {
  GENERIC_NETWORK_MESSAGE,
  RESET_EMAIL_SENT_MESSAGE,
  getPasswordResetRedirectTo,
  isLikelyNetworkError,
  loginHref,
  parseAuthRoleParam,
  userFacingResetEmailError,
  validateResetEmail
} from "@/lib/auth/password-reset";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

function ForgotPasswordInner() {
  const searchParams = useSearchParams();
  const role = parseAuthRoleParam(searchParams.get("role"));
  const track = (searchParams.get("track") || "").trim();
  const backHref = useMemo(() => loginHref(role, track || null), [role, track]);

  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"ok" | "error">("error");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async () => {
    const validation = validateResetEmail(email);
    if (validation) {
      setMessageTone("error");
      setMessage(validation);
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setMessageTone("error");
      setMessage("משהו השתבש. נסו שוב מאוחר יותר.");
      return;
    }

    setBusy(true);
    setMessage("");
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: getPasswordResetRedirectTo()
      });
      const mapped = userFacingResetEmailError(error);
      if (mapped) {
        setMessageTone("error");
        setMessage(mapped);
        return;
      }
      setMessageTone("ok");
      setMessage(RESET_EMAIL_SENT_MESSAGE);
    } catch (err) {
      setMessageTone("error");
      setMessage(isLikelyNetworkError(err) ? GENERIC_NETWORK_MESSAGE : "משהו השתבש. נסו שוב מאוחר יותר.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCardShell
      title="איפוס סיסמה"
      description="הזן את כתובת האימייל שלך ונשלח אליך קישור ליצירת סיסמה חדשה."
    >
      <form
        className="mt-6 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void handleSubmit();
        }}
        noValidate
      >
        <label htmlFor="forgot-password-email" className="block text-sm text-navy-900">
          אימייל
          <input
            id="forgot-password-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            className="mt-1 block w-full rounded-lg border border-navy-header/20 p-2"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={busy}
            required
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="mt-4 w-full rounded-2xl bg-[#001F3F] py-3 text-sm font-semibold text-white shadow-soft transition hover:brightness-105 active:brightness-95 disabled:opacity-60"
        >
          {busy ? "שולחים…" : "שלח קישור לאיפוס סיסמה"}
        </button>
      </form>

      <p className="mt-4 text-center">
        <Link href={backHref} className="text-sm font-semibold text-navy-header underline">
          חזרה להתחברות
        </Link>
      </p>

      {message ? (
        <p
          role="status"
          aria-live="polite"
          className={`mt-4 rounded-lg p-3 text-center text-sm ${
            messageTone === "ok" ? "bg-emerald-50 text-emerald-900" : "bg-rose-50 text-rose-950"
          }`}
        >
          {message}
        </p>
      ) : null}
    </AuthCardShell>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-md py-10 text-center text-sm text-slate-600" dir="rtl">
          טוען…
        </main>
      }
    >
      <ForgotPasswordInner />
    </Suspense>
  );
}
