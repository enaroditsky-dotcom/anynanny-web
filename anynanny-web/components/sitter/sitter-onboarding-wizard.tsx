"use client";

import { Eye, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import {
  isSitterProfileComplete,
  SITTER_PROFILES_TABLE,
  type SitterProfileRow
} from "@/lib/sitter/sitter-profile";
import { friendlySupabaseSessionError } from "@/lib/session/supabase-errors";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

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

export function SitterOnboardingWizard() {
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
  const [fullName, setFullName] = useState("");

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

  const handleFinish = async () => {
    if (!isSitterProfileComplete({ ...draftPayload, id: "" } as SitterProfileRow)) {
      setMessage("חסרים שדות חובה בפרופיל המקצועי.");
      return;
    }
    if (!legal_no_criminal_declaration) {
      setMessage("יש לאשר את ההצהרה המשפטית.");
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setMessage("Supabase לא מוגדר.");
      return;
    }

    setBusy(true);
    setMessage("");
    try {
      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (!user) {
        setMessage("יש להתחבר מחדש כדי לשמור את הפרופיל.");
        return;
      }

      const { error: refreshErr } = await supabase.auth.refreshSession();
      if (refreshErr) {
        setMessage(friendlySupabaseSessionError(refreshErr));
        return;
      }

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
      const complete = isSitterProfileComplete({ ...merged, id: user.id } as SitterProfileRow);
      const row: Record<string, unknown> = {
        id: user.id,
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

      if (typeof window !== "undefined") {
        window.location.assign("/sitter/dashboard");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3" dir="rtl">
      <div className="flex justify-between text-xs font-medium text-slate-500">
        <span>
          שלב {sitterStep} מתוך 3
          {sitterStep === 1 ? " — מה שהורים רואים" : sitterStep === 2 ? " — למנהלים" : " — סיום"}
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
            <textarea className={`${inputClass} min-h-[5rem]`} value={bio} onChange={(e) => setBio(e.target.value)} disabled={busy} />
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
              type="button"
              onClick={() => void handleFinish()}
              disabled={busy}
              className="inline-flex flex-row-reverse items-center gap-2 rounded-2xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white disabled:opacity-60"
            >
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  שומרים…
                </>
              ) : (
                "שמירה ומעבר לדשבורד"
              )}
            </button>
          </div>
        </div>
      ) : null}

      {message ? <p className="rounded-lg bg-rose-50 p-3 text-center text-sm text-rose-950">{message}</p> : null}
    </div>
  );
}
