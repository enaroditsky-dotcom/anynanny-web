"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";
import {
  isExplicitRecoveryCallback,
  readAuthCallbackParams,
  resetPasswordCallbackHref
} from "@/lib/auth/password-reset";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { AnyNannyLogo } from "@/components/brand/anynanny-logo";

type VerifyState = "checking" | "success" | "error";

function signupOtpType(callbackType: string): EmailOtpType {
  if (
    callbackType === "signup" ||
    callbackType === "email" ||
    callbackType === "email_change" ||
    callbackType === "invite"
  ) {
    return callbackType;
  }
  return "signup";
}

function EmailVerifiedContent() {
  const searchParams = useSearchParams();
  const errorCode = searchParams.get("error_code");
  const [verifyState, setVerifyState] = useState<VerifyState>(errorCode ? "error" : "checking");

  useEffect(() => {
    const params = readAuthCallbackParams();

    if (isExplicitRecoveryCallback(params)) {
      window.location.replace(resetPasswordCallbackHref());
      return;
    }

    if (errorCode && !params.hasCode && !params.hasTokenHash) {
      setVerifyState("error");
      return;
    }

    if (params.hasError && !params.hasCode && !params.hasTokenHash) {
      setVerifyState("error");
      return;
    }

    if (!params.hasCode && !params.hasTokenHash) {
      setVerifyState(errorCode ? "error" : "success");
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setVerifyState("error");
      return;
    }

    let cancelled = false;
    let settled = false;

    const finish = (state: VerifyState) => {
      if (cancelled || settled) return;
      settled = true;
      setVerifyState(state);
    };

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === "PASSWORD_RECOVERY") {
        window.location.replace(resetPasswordCallbackHref());
        return;
      }
      if ((event === "SIGNED_IN" || event === "USER_UPDATED") && session) {
        finish("success");
      }
    });

    void (async () => {
      if (params.tokenHash) {
        const { data, error } = await supabase.auth.verifyOtp({
          type: signupOtpType(params.callbackType),
          token_hash: params.tokenHash
        });
        if (cancelled) return;
        if (!error && data.session) {
          finish("success");
          return;
        }
      }

      if (params.code) {
        const { data, error } = await supabase.auth.exchangeCodeForSession(params.code);
        if (cancelled) return;
        if (!error && data.session) {
          finish("success");
          return;
        }
        const {
          data: { session }
        } = await supabase.auth.getSession();
        if (cancelled) return;
        finish(session ? "success" : "error");
        return;
      }

      const {
        data: { session }
      } = await supabase.auth.getSession();
      if (cancelled) return;
      finish(session ? "success" : "error");
    })();

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [errorCode]);

  const isError = verifyState === "error";
  const isChecking = verifyState === "checking";

  return (
    <main
      className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-start bg-[#FDFBF6] px-4 pb-6 pt-12 text-center"
      dir="rtl"
    >
      <div className="mb-6 flex items-center justify-center">
        <AnyNannyLogo variant="header" />
      </div>

      <div className="w-full max-w-sm space-y-4 rounded-3xl border border-slate-100 bg-white p-6 shadow-soft">
        {isChecking ? (
          <p className="text-sm text-slate-500">מאמתים את האימייל…</p>
        ) : isError ? (
          <>
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 shadow-sm ring-1 ring-amber-600/10">
              <svg
                className="h-7 w-7"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>

            <h1 className="text-lg font-bold text-[#001F3F]">
              הקישור פג תוקף או שגוי
            </h1>

            <p className="text-sm leading-relaxed text-slate-600">
              נראה שקישור האימות כבר נוצל או שעבר הזמן הקצוב שלו. אנא נסה
              להתחבר מחדש או לבקש מייל אימות חדש.
            </p>
          </>
        ) : (
          <>
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 shadow-sm ring-1 ring-emerald-600/10">
              <svg
                className="h-7 w-7"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>

            <h1 className="text-lg font-bold text-[#001F3F]">
              האימייל אומת בהצלחה!
            </h1>

            <p className="text-sm leading-relaxed text-slate-600">
              החשבון שלך הופעל בהצלחה. כעת ניתן לסגור חלון זה, לחזור
              לאפליקציה ולהתחבר מחדש.
            </p>

            <div className="pt-1">
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs text-slate-500">
                טיפ: לאחר ההתחברות מחדש, הכל יהיה מוכן לעבודה.
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function VerifiedPageFallback() {
  return (
    <main
      className="mx-auto flex min-h-screen w-full max-w-md items-center justify-center bg-[#FDFBF6] px-4 text-center"
      dir="rtl"
    >
      <p className="text-sm text-slate-500">טוען את תוצאת האימות…</p>
    </main>
  );
}

export default function EmailVerifiedPage() {
  return (
    <Suspense fallback={<VerifiedPageFallback />}>
      <EmailVerifiedContent />
    </Suspense>
  );
}
