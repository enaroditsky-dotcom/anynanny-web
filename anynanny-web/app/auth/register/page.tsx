"use client";

import { Eye, Loader2 } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { PasswordPeekField } from "@/components/auth/password-peek-field";
import { redirectAfterSignIn } from "@/lib/auth/redirect-after-sign-in";
import {
  clearUserRoleChoice,
  readUserRoleChoice,
  saveLastUsedEmail,
  setReturningUserFlag,
  setUserRoleChoice
} from "@/lib/auth/returning-user";
import { ensureProfile, resolveRoleForUser } from "@/lib/auth/supabase-profile";
import {
  isSitterProfileComplete,
  SITTER_PROFILES_TABLE,
  type SitterProfileRow
} from "@/lib/sitter/sitter-profile";
import { friendlySupabaseSessionError } from "@/lib/session/supabase-errors";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { ProfileRole } from "@/lib/supabase/profiles";

const inputClass =
  "mt-1 block min-h-11 min-w-0 w-full rounded-lg border border-navy-header/20 p-2 text-right text-sm";

function PrivacyMark() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-900">
      <Eye className="h-3 w-3 shrink-0" aria-hidden />
      פרטיות
    </span>
  );
}

function ToggleSwitch({
  checked,
  onChange,
  label
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <div className="flex flex-row-reverse items-center justify-between gap-3 rounded-xl border border-navy-header/12 bg-[#FDFBF6]/90 px-3 py-2">
      <span className="text-right text-xs font-medium text-navy-header">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${checked ? "bg-emerald-600" : "bg-slate-300"}`}
      >
        <span
          className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${checked ? "end-0.5" : "start-0.5"}`}
        />
      </button>
    </div>
  );
}

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/** Confirmation-email link target; add this URL (or NEXT_PUBLIC_SITE_URL origin) to Supabase Auth redirect allow list. */
function roleSelectionEmailRedirectTo(): string {
  const origin =
    (typeof process !== "undefined" && process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "")) ||
    "http://localhost:3000";
  return `${origin}/auth/role-selection`;
}

function RegisterInner() {
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next");
  const roleFromQuery = searchParams.get("role");

  const nextQuery = useMemo(() => {
    const params = new URLSearchParams();
    if (nextPath) params.set("next", nextPath);
    if (roleFromQuery === "parent" || roleFromQuery === "sitter") params.set("role", roleFromQuery);
    const s = params.toString();
    return s ? `?${s}` : "";
  }, [nextPath, roleFromQuery]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<ProfileRole>("parent");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const [sitterStep, setSitterStep] = useState(1);
  const [show_full_name, setShowFullName] = useState(false);
  const [birth_date, setBirthDate] = useState("");
  const [show_age, setShowAge] = useState(true);
  const [languages, setLanguages] = useState("");
  const [years_experience, setYearsExperience] = useState("");
  const [bio, setBio] = useState("");
  const [hourly_rate_nis, setHourlyRateNis] = useState("");
  const [id_number, setIdNumber] = useState("");
  const [address_full, setAddressFull] = useState("");
  const [military_service, setMilitaryService] = useState("");
  const [referee_phone_1, setRefereePhone1] = useState("");
  const [referee_phone_2, setRefereePhone2] = useState("");
  const [legal_no_criminal_declaration, setLegalNoCriminalDeclaration] = useState(false);

  const passwordsMatch = password.trim() === confirmPassword.trim();
  const showPasswordMismatch =
    !passwordsMatch && (password.length > 0 || confirmPassword.length > 0);

  const draftPayload = useMemo(
    (): Partial<SitterProfileRow> => ({
      full_name: fullName.trim() || null,
      show_full_name,
      birth_date: birth_date || null,
      show_age,
      languages: languages.trim() || null,
      years_experience: years_experience.trim() !== "" ? Number(years_experience) : null,
      bio: bio.trim() || null,
      hourly_rate_nis: hourly_rate_nis.trim() !== "" ? Number(hourly_rate_nis) : null,
      id_number: id_number.trim() || null,
      address_full: address_full.trim() || null,
      military_service: military_service.trim() || null,
      referee_phone_1: referee_phone_1.trim() || null,
      referee_phone_2: referee_phone_2.trim() || null,
      legal_no_criminal_declaration
    }),
    [
      fullName,
      show_full_name,
      birth_date,
      show_age,
      languages,
      years_experience,
      bio,
      hourly_rate_nis,
      id_number,
      address_full,
      military_service,
      referee_phone_1,
      referee_phone_2,
      legal_no_criminal_declaration
    ]
  );

  useEffect(() => {
    if (roleFromQuery === "parent" || roleFromQuery === "sitter") {
      setRole(roleFromQuery);
      setUserRoleChoice(roleFromQuery);
      return;
    }
    const choice = readUserRoleChoice();
    if (choice) setRole(choice);
  }, [roleFromQuery]);

  useEffect(() => {
    setSitterStep(1);
  }, [role]);

  const validateSitterStep = (s: number): string | null => {
    if (s === 1) {
      if (!fullName.trim()) return "יש למלא שם מלא.";
      if (!birth_date) return "יש לבחור תאריך לידה.";
      if (!languages.trim()) return "יש למלא שפות.";
      if (years_experience.trim() === "" || Number(years_experience) < 0) return "יש למלא שנות ניסיון.";
      if (!bio.trim()) return "יש למלא ביוגרפיה.";
      if (hourly_rate_nis.trim() === "" || Number(hourly_rate_nis) <= 0) return "יש להזין תעריף שעתי חוקי.";
      return null;
    }
    if (s === 2) {
      if (!id_number.trim()) return "יש למלא תעודת זהות.";
      if (!address_full.trim()) return "יש למלא כתובת מלאה.";
      if (!referee_phone_1.trim()) return "יש למלא טלפון ממליץ/ה ראשון.";
      if (!referee_phone_2.trim()) return "יש למלא טלפון ממליץ/ה שני.";
      return null;
    }
    return null;
  };

  const nextSitterStep = () => {
    const err = validateSitterStep(sitterStep);
    if (err) {
      setMessage(err);
      return;
    }
    setMessage("");
    setSitterStep((v) => Math.min(3, v + 1));
  };

  const handleSubmit = async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setMessage("Supabase לא מוגדר. יש לעדכן מפתחות סביבה.");
      return;
    }

    if (role === "sitter") {
      if (sitterStep < 3) {
        setMessage("יש להשלים את כל השלבים לפני יצירת החשבון.");
        return;
      }
      if (!isSitterProfileComplete({ ...draftPayload, id: "" } as SitterProfileRow)) {
        setMessage("חסרים שדות חובה בפרופיל המקצועי.");
        return;
      }
      if (!legal_no_criminal_declaration) {
        setMessage("יש לאשר את ההצהרה המשפטית.");
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
      if (password.trim() !== confirmPassword.trim()) {
        setMessage("הסיסמאות אינן תואמות.");
        return;
      }
    } else {
      if (password.trim() !== confirmPassword.trim()) {
        setMessage("הסיסמאות אינן תואמות.");
        return;
      }
    }

    setBusy(true);
    setMessage("");
    try {
      const trimmedName = fullName.trim();
      const emailTrim = email.trim();

      const { data, error } = await supabase.auth.signUp({
        email: emailTrim,
        password,
        options: {
          emailRedirectTo: roleSelectionEmailRedirectTo(),
          data: { role, full_name: trimmedName || undefined }
        }
      });
      if (error) {
        setMessage(`הרשמה נכשלה: ${error.message}`);
        return;
      }

      setReturningUserFlag();

      if (data.user) {
        await ensureProfile(supabase, {
          id: data.user.id,
          role,
          full_name: trimmedName || null
        });
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

      const effective = await resolveRoleForUser(supabase, activeUser, role, trimmedName || null);

      if (role === "sitter") {
        const merged: Partial<SitterProfileRow> = {
          ...draftPayload,
          citizenship_israeli: null,
          birth_country: null,
          aliyah_year: null,
          preferred_ages: null,
          has_car: false,
          homework_help: false,
          light_cooking: false
        };
        const complete = isSitterProfileComplete({ ...merged, id: activeUser.id } as SitterProfileRow);
        const row: Record<string, unknown> = {
          id: activeUser.id,
          ...merged,
          is_public: complete,
          onboarding_completed_at: complete ? new Date().toISOString() : null,
          updated_at: new Date().toISOString()
        };

        const { error: profileErr } = await supabase.from(SITTER_PROFILES_TABLE).upsert(row, { onConflict: "id" });
        if (profileErr) {
          setMessage(profileErr.message || friendlySupabaseSessionError(new Error("profile save")));
          return;
        }
      }

      saveLastUsedEmail(emailTrim);
      clearUserRoleChoice();
      redirectAfterSignIn(effective, nextPath);
    } finally {
      setBusy(false);
    }
  };

  const parentSubmitDisabled = busy || !passwordsMatch;
  const sitterSubmitDisabled = busy || !passwordsMatch;

  return (
    <main className="mx-auto flex w-full min-w-0 max-w-full flex-col items-center gap-4 py-2" dir="rtl" suppressHydrationWarning>
      <section className="w-full min-w-0 max-w-md rounded-3xl bg-white p-6 shadow-soft" suppressHydrationWarning>
        <h1 className="text-center text-2xl font-bold text-navy-header">הרשמה</h1>
        <p className="mt-1 text-center text-sm text-slate-600">
          {role === "sitter"
            ? "פרופיל מקצועי אחד — חשבון נוצר בסיום עם אימייל וסיסמה."
            : "צרו חשבון הורה או בייביסיטר."}
        </p>

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
            תפקיד
            <select
              suppressHydrationWarning
              className="mt-1 block min-h-11 min-w-0 w-full rounded-lg border border-navy-header/20 p-2"
              value={role}
              onChange={(e) => setRole(e.target.value as ProfileRole)}
              disabled={busy}
            >
              <option value="parent">הורה</option>
              <option value="sitter">בייביסיטר</option>
            </select>
          </label>

          {role === "parent" ? (
            <>
              <label className="block min-w-0 text-sm text-navy-900">
                אימייל
                <input
                  type="email"
                  autoComplete="email"
                  suppressHydrationWarning
                  className={inputClass}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={busy}
                />
              </label>
              <label className="block min-w-0 text-sm text-navy-900">
                שם מלא
                <input
                  type="text"
                  autoComplete="name"
                  suppressHydrationWarning
                  className={inputClass}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="למשל: יעל כהן"
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
                disabled={parentSubmitDisabled}
                suppressHydrationWarning
                className="mt-6 w-full rounded-2xl bg-[#001F3F] py-3 text-sm font-semibold text-white shadow-soft transition hover:brightness-105 active:brightness-95 disabled:opacity-60"
              >
                {busy ? "נרשמים…" : "יצירת חשבון"}
              </button>
            </>
          ) : (
            <>
              <div className="flex justify-between text-xs font-medium text-slate-500">
                <span>
                  שלב {sitterStep} מתוך 3
                  {sitterStep === 1 ? " — מה שהורים רואים" : sitterStep === 2 ? " — למנהלים" : " — חשבון"}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-gradient-to-l from-[#001F3F] to-emerald-600 transition-all duration-300"
                  style={{ width: `${(sitterStep / 3) * 100}%` }}
                />
              </div>

              {sitterStep === 1 ? (
                <div className="space-y-3 pt-1">
                  <label className="block text-sm text-navy-900">
                    שם מלא <span className="text-rose-600">*</span>
                    <input className={inputClass} value={fullName} onChange={(e) => setFullName(e.target.value)} disabled={busy} />
                  </label>
                  <div className="space-y-2">
                    <div className="flex flex-row-reverse justify-end">
                      <PrivacyMark />
                    </div>
                    <ToggleSwitch checked={show_full_name} onChange={setShowFullName} label="הצג שם מלא להורים" />
                    <ToggleSwitch checked={show_age} onChange={setShowAge} label="הצג גיל להורים" />
                  </div>
                  <label className="block text-sm text-navy-900">
                    תאריך לידה <span className="text-rose-600">*</span>
                    <input
                      className={inputClass}
                      type="date"
                      value={birth_date}
                      onChange={(e) => setBirthDate(e.target.value)}
                      disabled={busy}
                    />
                  </label>
                  <label className="block text-sm text-navy-900">
                    שפות <span className="text-rose-600">*</span>
                    <input className={inputClass} value={languages} onChange={(e) => setLanguages(e.target.value)} disabled={busy} />
                  </label>
                  <label className="block text-sm text-navy-900">
                    שנות ניסיון <span className="text-rose-600">*</span>
                    <input
                      className={inputClass}
                      inputMode="numeric"
                      value={years_experience}
                      onChange={(e) => setYearsExperience(e.target.value.replace(/\D/g, "").slice(0, 2))}
                      disabled={busy}
                    />
                  </label>
                  <label className="block text-sm text-navy-900">
                    ביוגרפיה <span className="text-rose-600">*</span>
                    <textarea
                      className={`${inputClass} min-h-[5rem]`}
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      disabled={busy}
                    />
                  </label>
                  <label className="block text-sm text-navy-900">
                    תעריף שעתי (₪) <span className="text-rose-600">*</span>
                    <input
                      className={inputClass}
                      inputMode="decimal"
                      dir="ltr"
                      value={hourly_rate_nis}
                      onChange={(e) => setHourlyRateNis(e.target.value.replace(/[^\d.]/g, "").slice(0, 8))}
                      disabled={busy}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={nextSitterStep}
                    disabled={busy}
                    className="mt-2 w-full rounded-2xl bg-[#001F3F] py-3 text-sm font-semibold text-white shadow-soft transition hover:brightness-105 disabled:opacity-60"
                  >
                    המשך
                  </button>
                </div>
              ) : null}

              {sitterStep === 2 ? (
                <div className="space-y-3 pt-1">
                  <p className="text-xs text-slate-600">שדות אלו למנהלים בלבד ולא יוצגו להורים.</p>
                  <label className="block text-sm text-navy-900">
                    תעודת זהות <span className="text-rose-600">*</span>
                    <input className={inputClass} dir="ltr" value={id_number} onChange={(e) => setIdNumber(e.target.value)} disabled={busy} />
                  </label>
                  <label className="block text-sm text-navy-900">
                    כתובת מלאה <span className="text-rose-600">*</span>
                    <textarea className={`${inputClass} min-h-[4rem]`} value={address_full} onChange={(e) => setAddressFull(e.target.value)} disabled={busy} />
                  </label>
                  <label className="block text-sm text-navy-900">
                    שירות צבאי / לאומי
                    <textarea className={`${inputClass} min-h-[3rem]`} value={military_service} onChange={(e) => setMilitaryService(e.target.value)} disabled={busy} />
                  </label>
                  <label className="block text-sm text-navy-900">
                    טלפון ממליץ/ה 1 <span className="text-rose-600">*</span>
                    <input className={inputClass} dir="ltr" inputMode="tel" value={referee_phone_1} onChange={(e) => setRefereePhone1(e.target.value)} disabled={busy} />
                  </label>
                  <label className="block text-sm text-navy-900">
                    טלפון ממליץ/ה 2 <span className="text-rose-600">*</span>
                    <input className={inputClass} dir="ltr" inputMode="tel" value={referee_phone_2} onChange={(e) => setRefereePhone2(e.target.value)} disabled={busy} />
                  </label>
                  <div className="flex flex-row-reverse gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setSitterStep(1)}
                      disabled={busy}
                      className="rounded-2xl border border-navy-header/20 bg-white px-4 py-2 text-sm font-semibold text-navy-header"
                    >
                      חזרה
                    </button>
                    <button
                      type="button"
                      onClick={nextSitterStep}
                      disabled={busy}
                      className="rounded-2xl bg-[#001F3F] px-6 py-2 text-sm font-semibold text-white"
                    >
                      המשך
                    </button>
                  </div>
                </div>
              ) : null}

              {sitterStep === 3 ? (
                <div className="space-y-3 pt-1">
                  <label className="flex cursor-pointer flex-row-reverse items-start gap-2 rounded-xl border border-navy-header/15 bg-[#FDFBF6] p-3 text-sm">
                    <input
                      type="checkbox"
                      checked={legal_no_criminal_declaration}
                      onChange={(e) => setLegalNoCriminalDeclaration(e.target.checked)}
                      disabled={busy}
                      className="mt-1 accent-emerald-600"
                    />
                    <span>
                      <span className="text-rose-600">*</span> אני מצהירה כי אין לי עבר פלילי (חובה לאישור הפרופיל)
                    </span>
                  </label>
                  <label className="block text-sm text-navy-900">
                    אימייל <span className="text-rose-600">*</span>
                    <input
                      type="email"
                      autoComplete="email"
                      className={inputClass}
                      dir="ltr"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={busy}
                    />
                  </label>
                  <label className="block text-sm text-navy-900">
                    סיסמה <span className="text-rose-600">*</span>
                    <div className="mt-1">
                      <PasswordPeekField value={password} onChange={setPassword} autoComplete="new-password" disabled={busy} />
                    </div>
                  </label>
                  <label className="block text-sm text-navy-900">
                    אימות סיסמה <span className="text-rose-600">*</span>
                    <div className="mt-1">
                      <PasswordPeekField value={confirmPassword} onChange={setConfirmPassword} autoComplete="new-password" disabled={busy} />
                    </div>
                  </label>
                  {showPasswordMismatch ? (
                    <p className="text-sm font-medium text-red-600" role="alert">
                      הסיסמאות אינן תואמות
                    </p>
                  ) : null}
                  <div className="flex flex-row-reverse gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setSitterStep(2)}
                      disabled={busy}
                      className="rounded-2xl border border-navy-header/20 bg-white px-4 py-2 text-sm font-semibold text-navy-header"
                    >
                      חזרה
                    </button>
                    <button
                      type="submit"
                      disabled={sitterSubmitDisabled}
                      className="inline-flex flex-row-reverse items-center gap-2 rounded-2xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white disabled:opacity-60"
                    >
                      {busy ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                          יוצרים חשבון…
                        </>
                      ) : (
                        "יצירת חשבון וסיום"
                      )}
                    </button>
                  </div>
                </div>
              ) : null}
            </>
          )}
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
