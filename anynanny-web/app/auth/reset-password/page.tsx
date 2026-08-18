"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { AuthCardShell } from "@/components/auth/auth-card-shell";
import { PasswordPeekField } from "@/components/auth/password-peek-field";
import {
  clearPasswordRecoveryEvent,
  hasPasswordRecoveryEvent,
  markPasswordRecoveryEvent
} from "@/lib/auth/password-recovery-state";
import {
  validateNewPassword,
  validatePasswordConfirmation
} from "@/lib/auth/password-policy";
import {
  FORGOT_PASSWORD_PATH,
  GENERIC_NETWORK_MESSAGE,
  INVALID_RECOVERY_LINK_MESSAGE,
  LOGIN_PATH,
  PASSWORD_UPDATED_MESSAGE,
  hasRecoveryUrlMarker,
  isLikelyNetworkError,
  readAuthCallbackParams,
  userFacingUpdatePasswordError
} from "@/lib/auth/password-reset";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type RecoveryState = "checking" | "valid" | "invalid";

function ResetPasswordInner() {
  const [recoveryState, setRecoveryState] = useState<RecoveryState>("checking");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"ok" | "error">("error");
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setRecoveryState("invalid");
      return;
    }

    const urlParams = readAuthCallbackParams();
    if (urlParams.hasError && !urlParams.hasCode && !urlParams.isRecoveryType && !urlParams.hasTokenHash) {
      setRecoveryState("invalid");
      return;
    }

    let cancelled = false;
    let settled = false;

    const finish = (state: RecoveryState) => {
      if (cancelled || settled) return;
      settled = true;
      setRecoveryState(state);
    };

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === "PASSWORD_RECOVERY" && session) {
        markPasswordRecoveryEvent();
        finish("valid");
      }
    });

    void (async () => {
      if (urlParams.tokenHash && (urlParams.isRecoveryType || !urlParams.hasCode)) {
        const { data, error } = await supabase.auth.verifyOtp({
          type: "recovery",
          token_hash: urlParams.tokenHash
        });
        if (cancelled) return;
        if (!error && data.session) {
          markPasswordRecoveryEvent();
          finish("valid");
          return;
        }
      }

      if (urlParams.code) {
        const { data, error } = await supabase.auth.exchangeCodeForSession(urlParams.code);
        if (cancelled) return;
        if (!error && data.session) {
          markPasswordRecoveryEvent();
          finish("valid");
          return;
        }
        const {
          data: { session }
        } = await supabase.auth.getSession();
        if (cancelled) return;
        if (session) {
          markPasswordRecoveryEvent();
          finish("valid");
          return;
        }
      }

      if (hasPasswordRecoveryEvent()) {
        const {
          data: { session }
        } = await supabase.auth.getSession();
        if (cancelled) return;
        if (session) {
          finish("valid");
          return;
        }
      }

      const waitMs =
        hasRecoveryUrlMarker(urlParams) || hasPasswordRecoveryEvent() ? 2500 : 600;
      await new Promise((resolve) => window.setTimeout(resolve, waitMs));
      if (cancelled || settled) return;

      if (hasPasswordRecoveryEvent()) {
        const {
          data: { session }
        } = await supabase.auth.getSession();
        finish(session ? "valid" : "invalid");
        return;
      }

      if (hasRecoveryUrlMarker(urlParams)) {
        const {
          data: { session }
        } = await supabase.auth.getSession();
        finish(session ? "valid" : "invalid");
        return;
      }

      finish("invalid");
    })();

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async () => {
    if (recoveryState !== "valid") {
      setMessageTone("error");
      setMessage(INVALID_RECOVERY_LINK_MESSAGE);
      return;
    }

    const passwordError = validateNewPassword(password);
    if (passwordError) {
      setMessageTone("error");
      setMessage(passwordError);
      return;
    }
    const confirmError = validatePasswordConfirmation(password, confirmPassword);
    if (confirmError) {
      setMessageTone("error");
      setMessage(confirmError);
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
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        const mapped = userFacingUpdatePasswordError(error);
        setMessageTone("error");
        setMessage(mapped);
        if (mapped === INVALID_RECOVERY_LINK_MESSAGE) {
          setRecoveryState("invalid");
        }
        return;
      }

      setSuccess(true);
      setMessageTone("ok");
      setMessage(PASSWORD_UPDATED_MESSAGE);
      try {
        await supabase.auth.signOut();
      } catch (signOutError) {
        if (process.env.NODE_ENV === "development") {
          console.warn("[password-reset] signOut after update:", signOutError);
        }
      }
      clearPasswordRecoveryEvent();
      window.setTimeout(() => {
        window.location.replace(LOGIN_PATH);
      }, 1600);
    } catch (err) {
      setMessageTone("error");
      setMessage(isLikelyNetworkError(err) ? GENERIC_NETWORK_MESSAGE : "לא הצלחנו לעדכן את הסיסמה. נסו שוב מאוחר יותר.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCardShell
      title="יצירת סיסמה חדשה"
      description={recoveryState === "valid" && !success ? "בחרו סיסמה חדשה לחשבון שלכם." : undefined}
    >
      {recoveryState === "checking" ? (
        <p className="mt-6 text-center text-base text-slate-600">מאמתים קישור…</p>
      ) : null}

      {recoveryState === "invalid" ? (
        <div className="mt-6 space-y-4 text-center">
          <p role="status" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-950">
            {INVALID_RECOVERY_LINK_MESSAGE}
          </p>
          <Link
            href={FORGOT_PASSWORD_PATH}
            className="inline-flex w-full items-center justify-center rounded-2xl bg-[#001F3F] py-3 text-sm font-semibold text-white shadow-soft transition hover:brightness-105"
          >
            שלח קישור חדש
          </Link>
          <p>
            <Link href={LOGIN_PATH} className="text-sm font-semibold text-navy-header underline">
              חזרה להתחברות
            </Link>
          </p>
        </div>
      ) : null}

      {recoveryState === "valid" && !success ? (
        <form
          className="mt-6 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void handleSubmit();
          }}
          noValidate
        >
          <label htmlFor="reset-new-password" className="block min-w-0 text-sm text-navy-900">
            סיסמה חדשה
            <div className="mt-1 min-w-0">
              <PasswordPeekField
                id="reset-new-password"
                value={password}
                onChange={setPassword}
                autoComplete="new-password"
                disabled={busy}
              />
            </div>
          </label>
          <label htmlFor="reset-confirm-password" className="block min-w-0 text-sm text-navy-900">
            אימות סיסמה חדשה
            <div className="mt-1 min-w-0">
              <PasswordPeekField
                id="reset-confirm-password"
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
            {busy ? "מעדכנים…" : "עדכן סיסמה"}
          </button>
        </form>
      ) : null}

      {success ? (
        <p role="status" className="mt-6 rounded-lg bg-emerald-50 p-3 text-center text-sm text-emerald-900">
          {PASSWORD_UPDATED_MESSAGE}
        </p>
      ) : null}

      {message && !success ? (
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
