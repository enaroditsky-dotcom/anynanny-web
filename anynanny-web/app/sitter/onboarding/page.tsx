"use client";

import { Eye, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { isSitterProfileComplete, type SitterProfileRow } from "@/lib/sitter/sitter-profile";
import { friendlySupabaseSessionError } from "@/lib/session/supabase-errors";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

const inputClass =
  "w-full rounded-2xl border border-navy-header/15 bg-white px-4 py-3 text-right text-sm text-navy-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-[#001F3F]/40 focus:ring-2 focus:ring-[#001F3F]/15";

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
    <div className="flex flex-row-reverse items-center justify-between gap-3 rounded-2xl border border-navy-header/12 bg-[#FDFBF6]/90 px-4 py-3">
      <span className="text-right text-sm font-medium text-navy-header">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-8 w-14 shrink-0 rounded-full transition-colors ${checked ? "bg-emerald-600" : "bg-slate-300"}`}
      >
        <span
          className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all ${checked ? "end-1" : "start-1"}`}
        />
      </button>
    </div>
  );
}

export default function SitterOnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [authResolved, setAuthResolved] = useState(false);
  const [profileHydrating, setProfileHydrating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const [full_name, setFullName] = useState("");
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

  const draftPayload = useMemo(
    (): Partial<SitterProfileRow> => ({
      full_name: full_name.trim() || null,
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
      full_name,
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

  const hydrate = useCallback((p: SitterProfileRow) => {
    setFullName(p.full_name ?? "");
    setShowFullName(Boolean(p.show_full_name));
    setBirthDate(p.birth_date ? String(p.birth_date).slice(0, 10) : "");
    setShowAge(p.show_age !== false);
    setLanguages(p.languages ?? "");
    setYearsExperience(p.years_experience != null ? String(p.years_experience) : "");
    setBio(p.bio ?? "");
    setHourlyRateNis(p.hourly_rate_nis != null ? String(p.hourly_rate_nis) : "");
    setIdNumber(p.id_number ?? "");
    setAddressFull(p.address_full ?? "");
    setMilitaryService(p.military_service ?? "");
    setRefereePhone1(p.referee_phone_1 ?? "");
    setRefereePhone2(p.referee_phone_2 ?? "");
    setLegalNoCriminalDeclaration(Boolean(p.legal_no_criminal_declaration));
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        if (!cancelled) {
          setErrorBanner("Supabase לא מוגדר.");
          setAuthResolved(true);
        }
        return;
      }

      const { data: sessionWrap } = await supabase.auth.getSession();
      const { data: authData, error: authErr } = await supabase.auth.getUser();
      const user = authData.user ?? sessionWrap.session?.user ?? null;

      if (cancelled) return;

      if (authErr && !user) {
        const authUrl = `/auth?next=${encodeURIComponent("/sitter/onboarding")}`;
        router.replace(authUrl);
        return;
      }

      if (!user?.id) {
        router.replace(`/auth?next=${encodeURIComponent("/sitter/onboarding")}`);
        return;
      }

      setAuthResolved(true);
      setProfileHydrating(true);
      try {
        const res = await fetch("/api/sitter/profile", {
          method: "GET",
          credentials: "include",
          cache: "no-store"
        });
        const json = (await res.json()) as { profile?: SitterProfileRow | null; error?: string };
        if (cancelled) return;
        if (res.ok && json.profile) hydrate(json.profile);
        else if (!res.ok && json.error) setErrorBanner(json.error);
      } catch {
      } finally {
        if (!cancelled) setProfileHydrating(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hydrate, router]);

  const validateStep = (s: number): string | null => {
    if (s === 1) {
      if (!full_name.trim()) return "יש למלא שם מלא.";
      if (!birth_date) return "יש לבחור תאריך לידה (לחישוב גיל).";
      if (!languages.trim()) return "יש למלא שפות.";
      if (years_experience.trim() === "" || Number(years_experience) < 0) return "יש למלא שנות ניסיון.";
      if (!bio.trim()) return "יש למלא קצת על עצמך (ביוגרפיה).";
      if (hourly_rate_nis.trim() === "" || Number(hourly_rate_nis) <= 0) return "יש להזין תעריף שעתי חוקי (₪).";
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

  const saveProfile = async () => {
    if (!legal_no_criminal_declaration) {
      setErrorBanner("יש לאשר את ההצהרה המשפטית כדי להמשיך.");
      return;
    }
    const complete = isSitterProfileComplete({ ...draftPayload, id: "" } as SitterProfileRow);
    if (!complete) {
      setErrorBanner("חסרים שדות חובה — עברו על כל השלבים.");
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setErrorBanner("Supabase לא מוגדר.");
      return;
    }
    const {
      data: { user },
      error: saveAuthErr
    } = await supabase.auth.getUser();
    if (saveAuthErr || !user) {
      setErrorBanner("הסשן לא זוהה — התחברו מחדש ונסו שוב.");
      router.replace(`/auth?next=${encodeURIComponent("/sitter/onboarding")}`);
      return;
    }

    setSaving(true);
    setErrorBanner(null);
    try {
      const res = await fetch("/api/sitter/profile", {
        method: "PUT",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draftPayload)
      });
      const json = (await res.json()) as { error?: string; profile?: SitterProfileRow };
      if (!res.ok) {
        setErrorBanner(json.error ?? "שגיאת שמירה.");
        return;
      }
      if (json.profile?.is_public) {
        router.replace("/sitter/dashboard");
        router.refresh();
      } else {
        setErrorBanner("הפרופיל עדיין לא מלא — בדקו שכל השדות המסומנים בכוכבית מולאו.");
      }
    } catch (e) {
      setErrorBanner(friendlySupabaseSessionError(e));
    } finally {
      setSaving(false);
    }
  };

  const nextStep = () => {
    const err = validateStep(step);
    if (err) {
      setErrorBanner(err);
      return;
    }
    setErrorBanner(null);
    setStep((v) => Math.min(3, v + 1));
  };

  if (!authResolved) {
    return (
      <main className="mx-auto flex min-h-[50vh] max-w-md flex-col items-center justify-center gap-3 px-4 py-16" dir="rtl">
        <Loader2 className="h-10 w-10 animate-spin text-[#001F3F]" aria-hidden />
        <p className="text-center text-sm font-medium text-slate-600">מזהים את החשבון…</p>
        <p className="text-center text-xs text-slate-500">לא מועברים להתחברות עד שהדפדפן מאמת את הסשן.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md space-y-6 px-4 py-6 pb-28" dir="rtl">
      {profileHydrating ? (
        <p className="flex flex-row-reverse items-center justify-center gap-2 rounded-2xl border border-[#001F3F]/15 bg-white px-4 py-2 text-center text-xs font-medium text-slate-600 shadow-sm">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[#001F3F]" aria-hidden />
          טוען נתונים שמורים מהשרת…
        </p>
      ) : null}

      <div className="space-y-2 text-right">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#001F3F]/80">השלמת פרופיל</p>
        <h1 className="text-2xl font-bold text-[#001F3F]">קצת עליך</h1>
        <p className="text-sm leading-relaxed text-slate-600">
          שלושה שלבים קצרים. שדות עם <span className="font-bold text-rose-600">*</span> חובה. בשלב 2 הנתונים מיועדים{" "}
          <strong>למנהלים בלבד</strong> ולא יוצגו להורים.
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-xs font-medium text-slate-500">
          <span>שלב {step} מתוך 3</span>
          <span>{step === 1 ? "חשיפה ציבורית" : step === 2 ? "מידע חסוי" : "אישור משפטי"}</span>
        </div>
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full rounded-full bg-gradient-to-l from-[#001F3F] to-emerald-600 transition-all duration-500 ease-out"
            style={{ width: `${Math.min(100, (step / 3) * 100)}%` }}
          />
        </div>
      </div>

      {errorBanner ? (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-right text-sm text-amber-950">
          {errorBanner}
        </p>
      ) : null}

      {step === 1 ? (
        <section className="space-y-4 rounded-3xl border border-navy-header/10 bg-white p-5 shadow-soft">
          <h2 className="text-lg font-bold text-[#001F3F]">שלב 1 — מה שהורים רואים</h2>

          <label className="block space-y-1.5 text-right">
            <span className="text-sm font-semibold text-navy-header">
              שם מלא <span className="text-rose-600">*</span>
            </span>
            <input className={inputClass} value={full_name} onChange={(e) => setFullName(e.target.value)} />
          </label>

          <div className="space-y-2">
            <div className="flex flex-row-reverse justify-end">
              <PrivacyMark />
            </div>
            <ToggleSwitch
              checked={show_full_name}
              onChange={setShowFullName}
              label="הצג שם מלא להורים (כבוי = רק שם פרטי)"
            />
            <ToggleSwitch checked={show_age} onChange={setShowAge} label="הצג גיל להורים" />
          </div>

          <label className="block space-y-1.5 text-right">
            <span className="text-sm font-semibold text-navy-header">
              תאריך לידה <span className="text-rose-600">*</span>
            </span>
            <input className={inputClass} type="date" value={birth_date} onChange={(e) => setBirthDate(e.target.value)} />
          </label>

          <label className="block space-y-1.5 text-right">
            <span className="text-sm font-semibold text-navy-header">
              שפות <span className="text-rose-600">*</span>
            </span>
            <input
              className={inputClass}
              value={languages}
              onChange={(e) => setLanguages(e.target.value)}
              placeholder="עברית, אנגלית…"
            />
          </label>

          <label className="block space-y-1.5 text-right">
            <span className="text-sm font-semibold text-navy-header">
              שנות ניסיון בטיפול בילדים <span className="text-rose-600">*</span>
            </span>
            <input
              className={inputClass}
              inputMode="numeric"
              value={years_experience}
              onChange={(e) => setYearsExperience(e.target.value.replace(/\D/g, "").slice(0, 2))}
            />
          </label>

          <label className="block space-y-1.5 text-right">
            <span className="text-sm font-semibold text-navy-header">
              על עצמי (ביוגרפיה קצרה) <span className="text-rose-600">*</span>
            </span>
            <textarea
              className={`${inputClass} min-h-[6rem] resize-y`}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="ספרי להורים מי את — ניסיון, גישה, מה חשוב לך…"
            />
          </label>

          <label className="block space-y-1.5 text-right">
            <span className="text-sm font-semibold text-navy-header">
              תעריף שעתי (₪) <span className="text-rose-600">*</span>
            </span>
            <input
              className={inputClass}
              inputMode="decimal"
              value={hourly_rate_nis}
              onChange={(e) => setHourlyRateNis(e.target.value.replace(/[^\d.]/g, "").slice(0, 8))}
              dir="ltr"
            />
          </label>
        </section>
      ) : null}

      {step === 2 ? (
        <section className="space-y-4 overflow-hidden rounded-3xl border-2 border-rose-200 bg-white shadow-soft">
          <div className="bg-gradient-to-l from-rose-700 to-rose-600 px-4 py-4 text-center">
            <h2 className="text-lg font-bold text-white">מידע חסוי למנהלים בלבד</h2>
            <p className="mt-1 text-sm text-rose-100">השדות הבאים לא יוצגו להורים — לשימוש פנימי ובקרה בלבד.</p>
          </div>
          <div className="space-y-4 px-5 pb-5 pt-2">
            <label className="block space-y-1.5 text-right">
              <span className="text-sm font-semibold text-navy-header">
                תעודת זהות <span className="text-rose-600">*</span>
              </span>
              <input className={inputClass} value={id_number} onChange={(e) => setIdNumber(e.target.value)} dir="ltr" />
            </label>
            <label className="block space-y-1.5 text-right">
              <span className="text-sm font-semibold text-navy-header">
                כתובת מלאה <span className="text-rose-600">*</span>
              </span>
              <textarea
                className={`${inputClass} min-h-[5rem] resize-y`}
                value={address_full}
                onChange={(e) => setAddressFull(e.target.value)}
              />
            </label>
            <label className="block space-y-1.5 text-right">
              <span className="text-sm font-semibold text-navy-header">שירות צבאי / לאומי</span>
              <textarea
                className={`${inputClass} min-h-[4rem] resize-y`}
                value={military_service}
                onChange={(e) => setMilitaryService(e.target.value)}
                placeholder="אופציונלי"
              />
            </label>
            <label className="block space-y-1.5 text-right">
              <span className="text-sm font-semibold text-navy-header">
                טלפון ממליץ/ה ראשון <span className="text-rose-600">*</span>
              </span>
              <input
                className={inputClass}
                value={referee_phone_1}
                onChange={(e) => setRefereePhone1(e.target.value)}
                dir="ltr"
                inputMode="tel"
              />
            </label>
            <label className="block space-y-1.5 text-right">
              <span className="text-sm font-semibold text-navy-header">
                טלפון ממליץ/ה שני <span className="text-rose-600">*</span>
              </span>
              <input
                className={inputClass}
                value={referee_phone_2}
                onChange={(e) => setRefereePhone2(e.target.value)}
                dir="ltr"
                inputMode="tel"
              />
            </label>
          </div>
        </section>
      ) : null}

      {step === 3 ? (
        <section className="space-y-4 rounded-3xl border border-navy-header/15 bg-white p-5 shadow-soft">
          <h2 className="text-lg font-bold text-[#001F3F]">שלב 3 — הצהרה משפטית</h2>
          <p className="text-sm leading-relaxed text-slate-600">
            לפי מדיניות האפליקציה, אנו משתמשים בהצהרת בעלות/ת המקצוע בלבד (לא החלפת בדיקת רקע רשמית).
          </p>
          <label className="flex cursor-pointer flex-row-reverse items-start gap-3 rounded-2xl border border-navy-header/15 bg-[#FDFBF6] p-4 text-right">
            <input
              type="checkbox"
              checked={legal_no_criminal_declaration}
              onChange={(e) => setLegalNoCriminalDeclaration(e.target.checked)}
              className="mt-1 h-5 w-5 shrink-0 accent-emerald-600"
            />
            <span className="text-sm font-medium leading-snug text-navy-header">
              <span className="text-rose-600">*</span> אני מצהירה כי אין לי עבר פלילי{" "}
              <span className="font-normal text-slate-600">(חובה לאישור הפרופיל)</span>
            </span>
          </label>
        </section>
      ) : null}

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-navy-header/10 bg-[#FDFBF6]/95 px-4 py-3 backdrop-blur md:static md:border-0 md:bg-transparent md:px-0 md:py-0">
        <div className="mx-auto flex max-w-md flex-row-reverse flex-wrap items-center justify-between gap-3">
          <div className="flex flex-row-reverse gap-2">
            {step > 1 ? (
              <button
                type="button"
                onClick={() => setStep((s) => Math.max(1, s - 1))}
                className="rounded-full border border-navy-header/20 bg-white px-5 py-2.5 text-sm font-semibold text-navy-header shadow-sm"
              >
                חזרה
              </button>
            ) : null}
            {step < 3 ? (
              <button
                type="button"
                onClick={nextStep}
                className="rounded-full bg-[#001F3F] px-6 py-2.5 text-sm font-semibold text-white shadow-md transition hover:brightness-110"
              >
                המשך
              </button>
            ) : (
              <button
                type="button"
                disabled={saving}
                onClick={() => void saveProfile()}
                className="rounded-full bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white shadow-md transition hover:brightness-105 disabled:opacity-60"
              >
                {saving ? "שומרים…" : "שמירה וסיום"}
              </button>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
