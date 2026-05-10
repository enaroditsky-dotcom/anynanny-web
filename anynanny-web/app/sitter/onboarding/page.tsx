"use client";

import { Eye, Shield } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { isSitterProfileComplete, type SitterProfileRow } from "@/lib/sitter/sitter-profile";
import { friendlySupabaseSessionError } from "@/lib/session/supabase-errors";

const inputClass =
  "w-full rounded-2xl border border-navy-header/15 bg-white px-4 py-3 text-right text-sm text-navy-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-[#001F3F]/40 focus:ring-2 focus:ring-[#001F3F]/15";

function AdminMark() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-900">
      <Shield className="h-3 w-3 shrink-0" aria-hidden />
      למנהלים בלבד
    </span>
  );
}

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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const [full_name, setFullName] = useState("");
  const [show_full_name, setShowFullName] = useState(false);
  const [id_number, setIdNumber] = useState("");
  const [birth_date, setBirthDate] = useState("");
  const [show_age, setShowAge] = useState(true);
  const [citizenship_israeli, setCitizenshipIsraeli] = useState<boolean | null>(null);
  const [birth_country, setBirthCountry] = useState("");
  const [aliyah_year, setAliyahYear] = useState<string>("");

  const [address_full, setAddressFull] = useState("");
  const [military_service, setMilitaryService] = useState("");

  const [years_experience, setYearsExperience] = useState<string>("");
  const [preferred_ages, setPreferredAges] = useState("");
  const [has_car, setHasCar] = useState(false);
  const [languages, setLanguages] = useState("");
  const [homework_help, setHomeworkHelp] = useState(false);
  const [light_cooking, setLightCooking] = useState(false);

  const draftPayload = useMemo(
    (): Partial<SitterProfileRow> => ({
      full_name: full_name.trim() || null,
      show_full_name,
      id_number: id_number.trim() || null,
      birth_date: birth_date || null,
      show_age,
      citizenship_israeli,
      birth_country: birth_country.trim() || null,
      aliyah_year: aliyah_year.trim() ? Number(aliyah_year) : null,
      address_full: address_full.trim() || null,
      military_service: military_service.trim() || null,
      years_experience: years_experience.trim() !== "" ? Number(years_experience) : null,
      preferred_ages: preferred_ages.trim() || null,
      has_car,
      languages: languages.trim() || null,
      homework_help,
      light_cooking
    }),
    [
      full_name,
      show_full_name,
      id_number,
      birth_date,
      show_age,
      citizenship_israeli,
      birth_country,
      aliyah_year,
      address_full,
      military_service,
      years_experience,
      preferred_ages,
      has_car,
      languages,
      homework_help,
      light_cooking
    ]
  );

  const hydrate = useCallback((p: SitterProfileRow) => {
    setFullName(p.full_name ?? "");
    setShowFullName(Boolean(p.show_full_name));
    setIdNumber(p.id_number ?? "");
    setBirthDate(p.birth_date ? String(p.birth_date).slice(0, 10) : "");
    setShowAge(p.show_age !== false);
    setCitizenshipIsraeli(
      p.citizenship_israeli === true ? true : p.citizenship_israeli === false ? false : null
    );
    setBirthCountry(p.birth_country ?? "");
    setAliyahYear(p.aliyah_year != null ? String(p.aliyah_year) : "");
    setAddressFull(p.address_full ?? "");
    setMilitaryService(p.military_service ?? "");
    setYearsExperience(p.years_experience != null ? String(p.years_experience) : "");
    setPreferredAges(p.preferred_ages ?? "");
    setHasCar(Boolean(p.has_car));
    setLanguages(p.languages ?? "");
    setHomeworkHelp(Boolean(p.homework_help));
    setLightCooking(Boolean(p.light_cooking));
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/sitter/profile", { method: "GET" });
        const json = (await res.json()) as { profile?: SitterProfileRow | null };
        if (res.ok && json.profile) hydrate(json.profile);
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    })();
  }, [hydrate]);

  const validateStep = (s: number): string | null => {
    if (s === 1) {
      if (!full_name.trim()) return "יש למלא שם מלא.";
      if (!birth_date) return "יש לבחור תאריך לידה.";
      if (citizenship_israeli !== true && citizenship_israeli !== false) return "יש לציין אזרחות ישראלית.";
      if (!id_number.trim()) return "יש למלא תעודת זהות (נשמרת למנהלים בלבד).";
      return null;
    }
    if (s === 2) {
      if (!address_full.trim()) return "יש למלא כתובת מלאה (לא מוצגת להורים).";
      return null;
    }
    if (s === 3) {
      if (years_experience.trim() === "" || Number(years_experience) < 0) return "יש למלא שנות ניסיון.";
      if (!preferred_ages.trim()) return "יש למלא גילאים מועדפים.";
      if (!languages.trim()) return "יש למלא שפות.";
      return null;
    }
    return null;
  };

  const saveProfile = async () => {
    setSaving(true);
    setErrorBanner(null);
    try {
      const res = await fetch("/api/sitter/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draftPayload)
      });
      const json = (await res.json()) as { error?: string; profile?: SitterProfileRow };
      if (!res.ok) {
        setErrorBanner(json.error ?? friendlySupabaseSessionError({ message: "" }));
        return;
      }
      if (json.profile && isSitterProfileComplete(json.profile)) {
        router.replace("/sitter/dashboard");
        router.refresh();
        return;
      }
      setErrorBanner("חסרים שדות חובה — עברו על השלבים עם כוכבית.");
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

  if (loading) {
    return (
      <main className="mx-auto flex min-h-[40vh] max-w-md items-center justify-center px-4 py-10" dir="rtl">
        <p className="text-sm text-slate-600">טוען פרופיל…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md space-y-6 px-4 py-6 pb-24" dir="rtl">
      <header className="space-y-1 text-right">
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">השלמת פרופיל</p>
        <h1 className="text-2xl font-bold text-[#001F3F]">פרופיל בייביסיטר</h1>
        <p className="text-sm text-slate-600">
          שדות עם <span className="font-bold text-rose-600">*</span> חובה. נתונים עם תג &quot;למנהלים בלבד&quot; לא
          יוצגו להורים.
        </p>
      </header>

      <nav aria-label="שלבי טופס" className="flex flex-row-reverse items-center justify-center gap-2">
        {[1, 2, 3].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => {
              if (n < step) setStep(n);
            }}
            className={`h-2.5 w-8 rounded-full transition ${n === step ? "bg-[#001F3F]" : n < step ? "bg-[#001F3F]/40" : "bg-slate-200"}`}
            aria-label={`שלב ${n}`}
            aria-current={n === step ? "step" : undefined}
          />
        ))}
      </nav>

      {errorBanner ? (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-right text-sm text-amber-950">
          {errorBanner}
        </p>
      ) : null}

      {step === 1 ? (
        <section className="space-y-4">
          <h2 className="text-lg font-bold text-navy-header">שלב 1 — פרטים אישיים</h2>
          <label className="block space-y-1.5 text-right">
            <span className="text-sm font-semibold text-navy-header">
              שם מלא <span className="text-rose-600">*</span>
            </span>
            <input className={inputClass} value={full_name} onChange={(e) => setFullName(e.target.value)} />
          </label>
          <div className="space-y-2">
            <div className="flex flex-row-reverse items-center justify-end gap-2">
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
            <span className="flex flex-wrap items-center justify-end gap-2 text-sm font-semibold text-navy-header">
              תעודת זהות <span className="text-rose-600">*</span>
              <AdminMark />
            </span>
            <input className={inputClass} value={id_number} onChange={(e) => setIdNumber(e.target.value)} dir="ltr" />
          </label>
          <label className="block space-y-1.5 text-right">
            <span className="text-sm font-semibold text-navy-header">
              תאריך לידה <span className="text-rose-600">*</span>
            </span>
            <input
              className={inputClass}
              type="date"
              value={birth_date}
              onChange={(e) => setBirthDate(e.target.value)}
            />
          </label>
          <div className="space-y-2 text-right">
            <span className="text-sm font-semibold text-navy-header">
              אזרחות ישראלית <span className="text-rose-600">*</span>
            </span>
            <div className="flex flex-row-reverse flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setCitizenshipIsraeli(true)}
                className={`rounded-full px-4 py-2 text-sm font-semibold ${citizenship_israeli === true ? "bg-[#001F3F] text-white" : "border border-navy-header/20 bg-white text-navy-header"}`}
              >
                כן
              </button>
              <button
                type="button"
                onClick={() => setCitizenshipIsraeli(false)}
                className={`rounded-full px-4 py-2 text-sm font-semibold ${citizenship_israeli === false ? "bg-[#001F3F] text-white" : "border border-navy-header/20 bg-white text-navy-header"}`}
              >
                לא
              </button>
            </div>
          </div>
          <label className="block space-y-1.5 text-right">
            <span className="text-sm font-semibold text-navy-header">ארץ לידה</span>
            <input className={inputClass} value={birth_country} onChange={(e) => setBirthCountry(e.target.value)} />
          </label>
          <label className="block space-y-1.5 text-right">
            <span className="text-sm font-semibold text-navy-header">שנת עלייה</span>
            <input
              className={inputClass}
              inputMode="numeric"
              value={aliyah_year}
              onChange={(e) => setAliyahYear(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="למשל 2015"
            />
          </label>
        </section>
      ) : null}

      {step === 2 ? (
        <section className="space-y-4">
          <h2 className="text-lg font-bold text-navy-header">שלב 2 — פרטים פנימיים</h2>
          <p className="text-xs text-slate-600">
            השדות הבאים <strong>לא יוצגו להורים</strong> ומשמשים תיעוד ומנהלה בלבד.
          </p>
          <label className="block space-y-1.5 text-right">
            <span className="flex flex-wrap items-center justify-end gap-2 text-sm font-semibold text-navy-header">
              כתובת מלאה <span className="text-rose-600">*</span>
              <AdminMark />
            </span>
            <textarea
              className={`${inputClass} min-h-[5rem] resize-y`}
              value={address_full}
              onChange={(e) => setAddressFull(e.target.value)}
            />
          </label>
          <label className="block space-y-1.5 text-right">
            <span className="flex flex-wrap items-center justify-end gap-2 text-sm font-semibold text-navy-header">
              שירות צבאי / לאומי
              <AdminMark />
            </span>
            <textarea
              className={`${inputClass} min-h-[4rem] resize-y`}
              value={military_service}
              onChange={(e) => setMilitaryService(e.target.value)}
              placeholder="אופציונלי"
            />
          </label>
        </section>
      ) : null}

      {step === 3 ? (
        <section className="space-y-4">
          <h2 className="text-lg font-bold text-navy-header">שלב 3 — מקצועיות</h2>
          <label className="block space-y-1.5 text-right">
            <span className="text-sm font-semibold text-navy-header">
              שנות ניסיון <span className="text-rose-600">*</span>
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
              גילאים מועדפים <span className="text-rose-600">*</span>
            </span>
            <input
              className={inputClass}
              value={preferred_ages}
              onChange={(e) => setPreferredAges(e.target.value)}
              placeholder="למשל: תינוקות, לידה+"
            />
          </label>
          <ToggleSwitch checked={has_car} onChange={setHasCar} label="יש רכב" />
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
          <ToggleSwitch checked={homework_help} onChange={setHomeworkHelp} label="עזרה בשיעורי בית" />
          <ToggleSwitch checked={light_cooking} onChange={setLightCooking} label="בישול קל" />
        </section>
      ) : null}

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-navy-header/10 bg-[#FDFBF6]/95 px-4 py-3 backdrop-blur md:static md:border-0 md:bg-transparent md:px-0 md:py-0">
        <div className="mx-auto flex max-w-md flex-row-reverse items-center justify-end gap-3">
          <div className="flex flex-row-reverse gap-2">
            {step > 1 ? (
              <button
                type="button"
                onClick={() => setStep((s) => Math.max(1, s - 1))}
                className="rounded-full border border-navy-header/20 bg-white px-5 py-2.5 text-sm font-semibold text-navy-header"
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
