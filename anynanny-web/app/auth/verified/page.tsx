"use client";

import React, { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  EMAIL_VERIFIED_BODY_LOGIN,
  EMAIL_VERIFIED_LOGIN_CTA,
  EMAIL_VERIFIED_TITLE,
  EMAIL_VERIFY_EXPIRED_TITLE,
  emailVerifiedLoginHref,
  resolveSignupEmailVerification,
  type SignupVerifyView
} from "@/lib/auth/email-verification";
import {
  isExplicitRecoveryCallback,
  readAuthCallbackParams,
  resetPasswordCallbackHref
} from "@/lib/auth/password-reset";
import { navigateAfterAuth } from "@/lib/auth/redirect-after-sign-in";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { AnyNannyLogo } from "@/components/brand/anynanny-logo";

type VerifyState = "checking" | SignupVerifyView;

function EmailVerifiedContent() {
  const searchParams = useSearchParams();
  const [verifyState, setVerifyState] = useState<VerifyState>("checking");

  useEffect(() => {
    const params = readAuthCallbackParams();

    if (isExplicitRecoveryCallback(params)) {
      window.location.replace(resetPasswordCallbackHref());
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setVerifyState(
        params.hasCode || params.hasTokenHash ? "success_login" : "expired"
      );
      return;
    }

    let cancelled = false;
    let settled = false;

    const finish = (state: SignupVerifyView) => {
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
        finish("success_session");
      }
    });

    void (async () => {
      const result = await resolveSignupEmailVerification({
        params,
        getSession: async () => {
          const { data } = await supabase.auth.getSession();
          return data;
        },
        verifyOtp: (args) => supabase.auth.verifyOtp(args),
        exchangeCodeForSession: (code) => supabase.auth.exchangeCodeForSession(code)
      });
      if (cancelled) return;
      finish(result.view);

      if (result.view === "success_session") {
        const {
          data: { session }
        } = await supabase.auth.getSession();
        const userId = session?.user?.id;
        if (userId) {
          await navigateAfterAuth(supabase, userId, null, session.user.email);
        }
      }
    })();

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [searchParams]);

  const isError = verifyState === "expired";
  const isChecking = verifyState === "checking";
  const needsLogin = verifyState === "success_login";

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

            <h1 className="text-lg font-bold text-[#001F3F]">{EMAIL_VERIFY_EXPIRED_TITLE}</h1>

            <p className="text-sm leading-relaxed text-slate-600">
              נראה שקישור האימות כבר נוצל או שעבר הזמן הקצוב שלו. אנא נסה
              להתחבר מחדש או לבקש מייל אימות חדש.
            </p>

            <Link
              href={emailVerifiedLoginHref()}
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#001F3F] px-5 py-2.5 text-sm font-bold text-white"
            >
              {EMAIL_VERIFIED_LOGIN_CTA}
            </Link>
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
              {needsLogin ? EMAIL_VERIFIED_TITLE : `${EMAIL_VERIFIED_TITLE}!`}
            </h1>

            <p className="text-sm leading-relaxed text-slate-600">
              {needsLogin
                ? EMAIL_VERIFIED_BODY_LOGIN
                : "החשבון שלך הופעל בהצלחה. כעת ניתן לסגור חלון זה, לחזור לאפליקציה ולהתחבר מחדש."}
            </p>

            <Link
              href={emailVerifiedLoginHref()}
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#001F3F] px-5 py-2.5 text-sm font-bold text-white"
            >
              {EMAIL_VERIFIED_LOGIN_CTA}
            </Link>

            {needsLogin ? null : (
              <div className="pt-1">
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs text-slate-500">
                  טיפ: לאחר ההתחברות מחדש, הכל יהיה מוכן לעבודה.
                </div>
              </div>
            )}
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
