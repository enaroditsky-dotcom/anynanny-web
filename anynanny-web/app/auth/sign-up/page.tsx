'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { User, Baby } from 'lucide-react';
import { AgeGateStep } from '@/components/auth/age-gate-step';
import {
  LEGAL_ACCEPTANCE_REQUIRED_MESSAGE,
  TermsAcceptanceCheckbox
} from '@/components/auth/terms-acceptance-checkbox';
import { ACCOUNT_TYPE_ENTRY_HREF } from '@/lib/auth/age-eligibility';
import { resolvePostAuthPath } from '@/lib/auth/post-auth-destination';
import { upsertProfileOnSignup } from '@/lib/auth/supabase-profile';
import { saveSignupNamesToDevice } from '@/lib/auth/signup-names';
import { createLegalAcceptanceRecord } from '@/lib/legal/acceptance';
import { isProfileRole } from '@/lib/supabase/profiles';
import { ensureSitterProfileRowForUser } from '@/lib/sitter/sitter-profile';
import { RequiredFieldMark } from '@/components/ui/required-field-mark';

export default function SignUpPage() {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();

  const [role, setRole] = useState<'parent' | 'sitter' | null>(null);
  const [ageGatePassed, setAgeGatePassed] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [acceptedLegal, setAcceptedLegal] = useState(false);
  const [legalError, setLegalError] = useState<string | null>(null);

  const brandColor = '#008080';
  const darkColor = '#0B243B';

  useEffect(() => {
    const checkUser = async () => {
      if (!supabase) return;
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const dest = await resolvePostAuthPath(supabase, session.user.id, null, {
          userEmail: session.user.email,
        });
        router.replace(dest);
      }
    };
    checkUser();
  }, [supabase, router]);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!supabase) {
      setErrorMsg('לקוח ה-Database אינו זמין.');
      return;
    }

    if (!role) {
      setErrorMsg('אנא בחר/י תפקיד (הורה או בייביסיטר) כדי להמשיך.');
      return;
    }
    if (!ageGatePassed) {
      setErrorMsg('יש לענות על שאלת הגיל כדי להמשיך.');
      return;
    }
    if (!firstName.trim() || !lastName.trim()) {
      setErrorMsg('אנא מלא/י שם פרטי ושם משפחה.');
      return;
    }
    if (!acceptedLegal) {
      setLegalError(LEGAL_ACCEPTANCE_REQUIRED_MESSAGE);
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setLegalError(null);

    const trimmedFirst = firstName.trim();
    const trimmedLast = lastName.trim();
    const legalAcceptance = createLegalAcceptanceRecord();
    saveSignupNamesToDevice({ first_name: trimmedFirst, last_name: trimmedLast });

    try {
      const { data, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          data: {
            role,
            first_name: trimmedFirst,
            last_name: trimmedLast,
          },
        },
      });

      if (authError) throw authError;

      if (data.user && isProfileRole(role)) {
        const profileResult = await upsertProfileOnSignup(supabase, {
          id: data.user.id,
          role,
          first_name: trimmedFirst,
          last_name: trimmedLast,
          legalAcceptance,
        });
        if (profileResult.error) {
          console.warn('[sign-up] profile upsert:', profileResult.error);
        }

        if (role === 'sitter') {
          const ensure = await ensureSitterProfileRowForUser(supabase, data.user.id, {
            first_name: trimmedFirst,
            last_name: trimmedLast,
          });
          if (ensure.error) {
            console.warn('[sign-up] ensure sitter profile:', ensure.error);
          }
        }
      }

      alert('נרשמת בהצלחה! אם נדרש אישור אימייל, אנא אשר/י אותו כדי להמשיך.');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'חלה שגיאה בתהליך הרישום.';
      setErrorMsg(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col items-center justify-center p-4 font-sans dir-rtl" dir="rtl">
      <div className="w-full max-w-sm bg-white border border-stone-100 rounded-3xl p-8 shadow-sm">
        <div className="flex flex-col items-center mb-8">
          <img
            src="/anynanny-clean-transparent.png.jpg"
            alt="Logo"
            className="w-28 h-28 rounded-full object-cover border border-stone-100 shadow-sm mb-6"
          />
          <h1 className="text-4xl font-black tracking-tight">
            <span style={{ color: darkColor }}>Any</span>
            <span style={{ color: brandColor }}>Nanny</span>
          </h1>
        </div>

        {!(role && !ageGatePassed) ? (
          <div className="text-center space-y-1 mb-8">
            <h2 className="text-2xl font-bold text-stone-900">יצירת חשבון</h2>
            <p className="text-sm text-stone-500">הצטרפו לקהילת AnyNanny</p>
          </div>
        ) : null}

        {errorMsg && (
          <div className="p-3 mb-6 bg-red-50 text-red-700 text-xs rounded-lg text-center font-medium">
            {errorMsg}
          </div>
        )}

        {!role ? (
          <div>
            <p className="mb-2 text-right text-sm font-semibold text-stone-700">
              תפקיד <RequiredFieldMark />
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  setRole("sitter");
                  setAgeGatePassed(false);
                  setAcceptedLegal(false);
                  setLegalError(null);
                  setErrorMsg(null);
                }}
                className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-stone-100 p-4 transition-all"
              >
                <Baby size={32} style={{ color: "#78716c" }} />
                <span className="text-sm font-bold" style={{ color: "#78716c" }}>בייביסיטר</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setRole("parent");
                  setAgeGatePassed(false);
                  setAcceptedLegal(false);
                  setLegalError(null);
                  setErrorMsg(null);
                }}
                className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-stone-100 p-4 transition-all"
              >
                <User size={32} style={{ color: "#78716c" }} />
                <span className="text-sm font-bold" style={{ color: "#78716c" }}>הורה</span>
              </button>
            </div>
          </div>
        ) : !ageGatePassed ? (
          <AgeGateStep
            role={role}
            variant="plain"
            onEligible={() => setAgeGatePassed(true)}
            onDeclineExit={() => router.replace(ACCOUNT_TYPE_ENTRY_HREF)}
            onBack={() => {
              setRole(null);
              setAgeGatePassed(false);
            }}
          />
        ) : (
        <form onSubmit={handleSignUp} className="space-y-4">
          <p className="rounded-xl bg-stone-50 px-3 py-2 text-center text-sm font-semibold text-stone-700">
            הרשמה כ{role === "parent" ? "הורה" : "נני"}
          </p>

          <div className="grid grid-cols-2 gap-3">
            <input
              type="text"
              required
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="w-full p-4 border border-stone-200 rounded-xl outline-none focus:border-[2px]"
              style={{ outlineColor: brandColor }}
              placeholder="שם פרטי"
              autoComplete="given-name"
            />
            <input
              type="text"
              required
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="w-full p-4 border border-stone-200 rounded-xl outline-none focus:border-[2px]"
              style={{ outlineColor: brandColor }}
              placeholder="שם משפחה"
              autoComplete="family-name"
            />
          </div>

          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full p-4 border border-stone-200 rounded-xl outline-none focus:border-[2px]"
            style={{ outlineColor: brandColor }}
            placeholder="אימייל"
            autoComplete="email"
          />
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full p-4 border border-stone-200 rounded-xl outline-none focus:border-[2px]"
            style={{ outlineColor: brandColor }}
            placeholder="סיסמה"
            autoComplete="new-password"
          />
          <TermsAcceptanceCheckbox
            id="sign-up-legal-acceptance"
            checked={acceptedLegal}
            disabled={loading}
            error={legalError}
            onChange={(checked) => {
              setAcceptedLegal(checked);
              if (checked) setLegalError(null);
            }}
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 text-white font-bold rounded-xl transition-colors text-lg"
            style={{ backgroundColor: brandColor }}
          >
            {loading ? 'מייצר חשבון...' : 'יצירת חשבון'}
          </button>
        </form>
        )}
      </div>
    </div>
  );
}