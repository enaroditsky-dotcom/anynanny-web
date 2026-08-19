"use client";

import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { AgeGateStep } from "@/components/auth/age-gate-step";
import {
  LEGAL_ACCEPTANCE_REQUIRED_MESSAGE,
  TermsAcceptanceCheckbox
} from "@/components/auth/terms-acceptance-checkbox";
import { ACCOUNT_TYPE_ENTRY_HREF } from "@/lib/auth/age-eligibility";
import {
  PageBackButton,
  PageBackRow,
  HOME_BACK_BUTTON_CLASS
} from "@/components/navigation/page-back-link";
import { ExpertRegistrationFields } from "@/components/sitter/expert-registration-fields";
import { upsertProfileOnSignup } from "@/lib/auth/supabase-profile";
import { createLegalAcceptanceRecord } from "@/lib/legal/acceptance";
import {
  emptyExpertProfileDraft,
  expertDraftToProfilePatch,
  validateExpertProfileDraft,
  type ExpertProfileDraft
} from "@/lib/sitter/expert-profile";
import { saveSignupNamesToDevice } from "@/lib/auth/signup-names";
import {
  ensureSitterProfileRowForUser,
  SITTER_PROFILES_TABLE,
  SITTER_PROFILES_USER_COLUMN
} from "@/lib/sitter/sitter-profile";
import type { ProfileRole } from "@/lib/supabase/profiles";

const SUPABASE_URL = "https://dqycvddpdhxawdgdatfe.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxeWN2ZGRwZGh4YXdkZ2RhdGZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgyNDMzNTEsImV4cCI6MjA5MzgxOTM1MX0.1nIMudhzgs1j41tzA4VhtEQjdIhztFWMmDoFU1G69-I";

const supabase = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const ROLE_LABELS: Record<ProfileRole, string> = {
  parent: "הורה",
  sitter: "נני"
};

async function persistExpertSitterProfile(
  userId: string,
  draft: ExpertProfileDraft,
  names: { first_name: string; last_name: string }
): Promise<void> {
  const expertPatch = expertDraftToProfilePatch(draft);

  const ensure = await ensureSitterProfileRowForUser(supabase, userId, {
    first_name: names.first_name,
    last_name: names.last_name,
    service_types: Array.isArray(expertPatch.service_types)
      ? (expertPatch.service_types as string[])
      : undefined
  });

  if (ensure.error) {
    console.warn("[register] ensure sitter profile:", ensure.error);
    return;
  }

  const patch = {
    ...expertPatch,
    first_name: names.first_name,
    last_name: names.last_name,
    updated_at: new Date().toISOString()
  };

  const { error } = await supabase
    .from(SITTER_PROFILES_TABLE)
    .update(patch)
    .eq(SITTER_PROFILES_USER_COLUMN, userId);

  if (error) {
    console.warn("[register] expert profile patch:", error.message);
  }
}

function RegisterInner() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const role = useMemo((): ProfileRole | null => {
    const value = searchParams.get("role");
    return value === "parent" || value === "sitter" ? value : null;
  }, [searchParams]);

  const track = useMemo(() => {
    const value = (searchParams.get("track") || "").trim().toLowerCase();

    if (value === "expert") return "expert" as const;
    if (value === "babysitter") return "babysitter" as const;

    return null;
  }, [searchParams]);

  const isExpert = role === "sitter" && track === "expert";

  const roleHeadline = useMemo(() => {
    if (role === "parent") return "הורה";
    if (isExpert) return "יועצת / דולה";
    if (role === "sitter") return "בייביסיטר";

    return null;
  }, [role, isExpert]);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [expertDraft, setExpertDraft] = useState<ExpertProfileDraft>(
    () => emptyExpertProfileDraft()
  );
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [ageGatePassed, setAgeGatePassed] = useState(false);
  const [acceptedLegal, setAcceptedLegal] = useState(false);
  const [legalError, setLegalError] = useState<string | null>(null);

  useEffect(() => {
    setAgeGatePassed(false);
    setAcceptedLegal(false);
    setLegalError(null);
  }, [role]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!role) {
      setErrorMsg(
        "לא נבחר תפקיד. חזרו לדף הבית ובחרו הורה, בייביסיטר או יועצת/דולה."
      );
      return;
    }

    if (!ageGatePassed) {
      setErrorMsg("יש לענות על שאלת הגיל כדי להמשיך.");
      return;
    }

    if (!firstName.trim() || !lastName.trim() || !email.trim() || !password) {
      setErrorMsg("נא למלא את כל השדות.");
      return;
    }

    if (isExpert) {
      const expertError = validateExpertProfileDraft(expertDraft);

      if (expertError) {
        setErrorMsg(expertError);
        return;
      }
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
    const expertPatch = isExpert
      ? expertDraftToProfilePatch(expertDraft)
      : null;

    saveSignupNamesToDevice({
      first_name: trimmedFirst,
      last_name: trimmedLast
    });

    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/verified`,
          data: {
            role,
            first_name: trimmedFirst,
            last_name: trimmedLast,
            service_track: isExpert
              ? "expert"
              : role === "sitter"
                ? "babysitter"
                : "parent",
            ...(expertPatch
              ? {
                  service_types: expertPatch.service_types,
                  service_locations: expertPatch.service_locations,
                  pricing_model: expertPatch.pricing_model,
                  hourly_rate_nis: expertPatch.hourly_rate_nis,
                  package_price_nis: expertPatch.package_price_nis,
                  bio: expertPatch.bio,
                  certifications: expertPatch.certifications
                }
              : {})
          }
        }
      });

      if (error) throw error;

      if (data.user) {
        const profileResult = await upsertProfileOnSignup(supabase, {
          id: data.user.id,
          role,
          first_name: trimmedFirst,
          last_name: trimmedLast,
          legalAcceptance
        });

        if (profileResult.error) {
          console.warn("[register] profile upsert:", profileResult.error);
        }

        if (role === "sitter") {
          if (isExpert) {
            await persistExpertSitterProfile(data.user.id, expertDraft, {
              first_name: trimmedFirst,
              last_name: trimmedLast
            });

            try {
              localStorage.setItem("anynanny_service_track", "expert");
            } catch {
              /* ignore */
            }
          } else {
            const ensure = await ensureSitterProfileRowForUser(
              supabase,
              data.user.id,
              {
                first_name: trimmedFirst,
                last_name: trimmedLast,
                service_types: ["babysitter"]
              }
            );

            if (ensure.error) {
              console.warn("[register] ensure sitter profile:", ensure.error);
            }

            try {
              localStorage.setItem("anynanny_service_track", "babysitter");
            } catch {
              /* ignore */
            }
          }
        }
      }

      alert("ההרשמה הצליחה! נא לאשר את האימייל שנשלח אליך.");

      router.push(
        isExpert
          ? "/login?role=sitter&track=expert"
          : "/"
      );
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "לא ניתן להשלים את ההרשמה";

      console.error("שגיאת הרשמה:", err);
      setErrorMsg(message);
    } finally {
      setLoading(false);
    }
  };

  if (!role) {
    return (
      <main className="mx-auto max-w-md p-8" dir="rtl">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-right shadow-sm">
          <h1 className="text-xl font-bold text-navy-header">
            לא נבחר תפקיד
          </h1>

          <p className="mt-2 text-sm text-slate-600">
            יש לבחור הורה, בייביסיטר או יועצת/דולה בדף הבית לפני ההרשמה.
          </p>

          <Link
            href="/"
            className={HOME_BACK_BUTTON_CLASS}
          >
            חזרה לדף הבית
          </Link>
        </div>
      </main>
    );
  }

  if (!ageGatePassed) {
    return (
      <main className="mx-auto max-w-md p-6 sm:p-8" dir="rtl">
        <PageBackRow className="mb-4">
          <PageBackButton onClick={() => router.replace(ACCOUNT_TYPE_ENTRY_HREF)} />
        </PageBackRow>
        <AgeGateStep
          role={role}
          onEligible={() => setAgeGatePassed(true)}
          onDeclineExit={() => router.replace(ACCOUNT_TYPE_ENTRY_HREF)}
        />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md p-6 sm:p-8" dir="rtl">
      <PageBackRow className="mb-4">
        <PageBackButton onClick={() => router.replace(ACCOUNT_TYPE_ENTRY_HREF)} />
      </PageBackRow>

      <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm sm:p-6">
        <header className="mb-6 text-right">
          <h1 className="text-2xl font-bold text-navy-header">
            יצירת חשבון
          </h1>

          <p className="mt-1 text-sm text-slate-600">
            הרשמה כ{roleHeadline ?? ROLE_LABELS[role]}
            {isExpert ? " · הנקה / שינה / דולה" : null}
          </p>
        </header>

        {errorMsg ? (
          <p className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {errorMsg}
          </p>
        ) : null}

        <form
          onSubmit={handleRegister}
          className="space-y-4"
        >
          <div className="grid grid-cols-2 gap-3">
            <input
              type="text"
              required
              placeholder="שם פרטי"
              className="w-full rounded-xl border border-slate-200 p-3 outline-none focus:border-navy-header"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              autoComplete="given-name"
            />

            <input
              type="text"
              required
              placeholder="שם משפחה"
              className="w-full rounded-xl border border-slate-200 p-3 outline-none focus:border-navy-header"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              autoComplete="family-name"
            />
          </div>

          <input
            type="email"
            required
            placeholder="אימייל"
            className="w-full rounded-xl border border-slate-200 p-3 outline-none focus:border-navy-header"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />

          <input
            type="password"
            required
            placeholder="סיסמה"
            className="w-full rounded-xl border border-slate-200 p-3 outline-none focus:border-navy-header"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />

          {isExpert ? (
            <div className="rounded-2xl border border-dashed border-emerald-200 bg-gradient-to-b from-emerald-50/60 to-rose-50/40 p-4">
              <p className="mb-3 text-sm font-bold text-navy-header">
                פרטי השירות המקצועי
              </p>

              <ExpertRegistrationFields
                value={expertDraft}
                onChange={setExpertDraft}
              />
            </div>
          ) : null}

          <TermsAcceptanceCheckbox
            id="register-legal-acceptance"
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
            className="w-full cursor-pointer rounded-xl bg-navy-header py-4 font-bold text-white transition-colors hover:bg-blue-900 disabled:opacity-50"
          >
            {loading ? "מבצע הרשמה..." : "אישור והמשך"}
          </button>
        </form>
      </div>
    </main>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center">טוען...</div>}>
      <RegisterInner />
    </Suspense>
  );
}