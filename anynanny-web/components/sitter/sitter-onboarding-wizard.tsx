"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { IsraelCitiesMultiSelect } from "@/components/geo/israel-cities-multi-select";
import type { IsraelCity } from "@/lib/geo/israel-cities";
import {
  ensureSitterProfileRowForUser,
  hasSitterCompletedOnboarding,
  SITTER_PROFILES_TABLE,
  SITTER_PROFILES_USER_COLUMN,
  SITTER_WORKING_CITIES_COLUMN
} from "@/lib/sitter/sitter-profile";
import { updateSitterWorkingCities } from "@/lib/sitter/sitter-working-cities";
import { resolveBrowserAuth } from "@/lib/supabase/browser-auth";

type Props = {
  onSaved?: () => void | Promise<void>;
};

export function SitterOnboardingWizard({ onSaved }: Props) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [militaryService, setMilitaryService] = useState("כן");
  const [yearsExperience, setYearsExperience] = useState("");
  const [hourlyRateNis, setHourlyRateNis] = useState("");
  const [hasCar, setHasCar] = useState(false);
  const [workingCities, setWorkingCities] = useState<IsraelCity[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFinish = async () => {
    if (busy) return;
    if (workingCities.length === 0) {
      setError("יש לבחור לפחות עיר אחת שבה את עובדת.");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const auth = await resolveBrowserAuth();
      if (!auth.ok) {
        setError("יש להתחבר מחדש כדי לסיים את השאלון.");
        return;
      }

      const ensure = await ensureSitterProfileRowForUser(auth.supabase, auth.userId);
      if (ensure.error) {
        setError(ensure.error);
        return;
      }

      const citiesResult = await updateSitterWorkingCities(auth.userId, workingCities);
      if (!citiesResult.ok) {
        setError(citiesResult.error || "שמירת אזורי העבודה נכשלה.");
        return;
      }

      const completedAt = new Date().toISOString();
      const years = Number(yearsExperience);
      const rate = Number(hourlyRateNis);

      const patch: Record<string, unknown> = {
        onboarding_completed_at: completedAt,
        updated_at: completedAt,
        [SITTER_WORKING_CITIES_COLUMN]: citiesResult.cities,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        birth_date: birthDate || null,
        military_service: militaryService === "כן",
        has_car: hasCar
      };

      if (Number.isFinite(years) && years >= 0) {
        patch.years_experience = Math.floor(years);
      }

      if (Number.isFinite(rate) && rate >= 0) {
        patch.hourly_rate_nis = Math.round(rate);
      }

      const { data, error: updateError } = await auth.supabase
        .from(SITTER_PROFILES_TABLE)
        .update(patch)
        .eq(SITTER_PROFILES_USER_COLUMN, auth.userId)
        .select(`onboarding_completed_at, ${SITTER_WORKING_CITIES_COLUMN}`)
        .maybeSingle();

      if (updateError) {
        const { data: retryData, error: retryError } = await auth.supabase
          .from(SITTER_PROFILES_TABLE)
          .update({
            onboarding_completed_at: completedAt,
            updated_at: completedAt,
            [SITTER_WORKING_CITIES_COLUMN]: citiesResult.cities
          })
          .eq(SITTER_PROFILES_USER_COLUMN, auth.userId)
          .select("onboarding_completed_at")
          .maybeSingle();

        if (retryError || !hasSitterCompletedOnboarding(retryData ?? {})) {
          setError(retryError?.message || updateError.message || "שמירת סיום השאלון נכשלה.");
          return;
        }
      } else if (!hasSitterCompletedOnboarding(data ?? {})) {
        setError("הסטטוס לא נשמר. נסו שוב.");
        return;
      }

      await onSaved?.();
      router.replace("/sitter/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שמירה נכשלה.");
    } finally {
      setBusy(false);
    }
  };

  return (
    // הוספת max-h-full ו-overflow-y-auto ישירות לכרטיס כדי שיגולל בצורה מושלמת בתוך מסגרת הטלפון
    <div className="mx-auto max-w-sm max-h-[85vh] overflow-y-auto rounded-[2rem] border-2 border-[#C5A059] bg-[#FDFBF6] p-6 text-center shadow-2xl my-auto" dir="rtl">
      <h2 className="mb-2 text-2xl font-bold text-[#001F3F]">ברוכה הבאה ל-AnyNanny</h2>
      <p className="mb-4 text-sm text-slate-600 leading-relaxed">
        בואי נכיר טוב יותר ונבנה פרופיל בולט ואטרקטיבי שיגרום להורים לבחור בך בקלות!
      </p>

      {error ? (
        <p className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>
      ) : null}

      {step === 1 && (
        <div className="space-y-4 text-right">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">שם פרטי</label>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="w-full rounded-2xl border-2 border-[#C5A059]/30 bg-white p-3.5"
              placeholder="שם פרטי"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">שם משפחה</label>
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="w-full rounded-2xl border-2 border-[#C5A059]/30 bg-white p-3.5"
              placeholder="שם משפחה"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">תאריך לידה</label>
            <input
              type="date"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
              className="w-full rounded-2xl border-2 border-[#C5A059]/30 bg-white p-3.5 text-slate-700"
            />
          </div>
          <button
            type="button"
            onClick={() => setStep(2)}
            className="w-full rounded-2xl bg-[#001F3F] py-3.5 font-bold text-white transition hover:bg-blue-900 mt-2"
          >
            הבא
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3 text-right">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">שנות ניסיון בטיפול בילדים</label>
            <input
              type="number"
              min={0}
              value={yearsExperience}
              onChange={(e) => setYearsExperience(e.target.value)}
              className="w-full rounded-2xl border-2 border-[#C5A059]/30 bg-white p-3.5"
              placeholder="מספר שנים"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">תעריף שעתי (₪)</label>
            <input
              type="number"
              min={0}
              value={hourlyRateNis}
              onChange={(e) => setHourlyRateNis(e.target.value)}
              className="w-full rounded-2xl border-2 border-[#C5A059]/30 bg-white p-3.5"
              placeholder="לדוגמה: 50"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">שירות צבאי / שירות לאומי</label>
            <select
              value={militaryService}
              onChange={(e) => setMilitaryService(e.target.value)}
              className="w-full rounded-2xl border-2 border-[#C5A059]/30 bg-white p-3.5 text-slate-700"
            >
              <option value="כן">כן</option>
              <option value="לא">לא</option>
            </select>
          </div>
          <div className="flex items-center gap-2 pt-1 cursor-pointer">
            <input
              type="checkbox"
              id="hasCarCheck"
              checked={hasCar}
              onChange={(e) => setHasCar(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
            />
            <label htmlFor="hasCarCheck" className="text-sm text-slate-700 cursor-pointer">יש לי רכב / הגעה עצמאית</label>
          </div>
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="flex-1 rounded-2xl border-2 border-[#001F3F]/20 py-3.5 font-bold text-[#001F3F] transition hover:bg-white/60"
            >
              חזרה
            </button>
            <button
              type="button"
              onClick={() => setStep(3)}
              className="flex-[1.4] rounded-2xl bg-[#001F3F] py-3.5 font-bold text-white transition hover:bg-blue-900"
            >
              הבא
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4 text-right">
          <p className="text-center font-medium text-navy-800">באילו ערים את עובדת?</p>
          
          <div className="max-h-[35vh] overflow-y-auto pr-1">
            <IsraelCitiesMultiSelect
              value={workingCities}
              onChange={setWorkingCities}
              disabled={busy}
              label="בחרי ערים מכל הארץ"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => setStep(2)}
              className="flex-1 rounded-2xl border-2 border-[#001F3F]/20 py-3.5 font-bold text-[#001F3F] transition hover:bg-white/60 disabled:opacity-60"
            >
              חזרה
            </button>
            <button
              type="button"
              disabled={busy || workingCities.length === 0}
              onClick={() => void handleFinish()}
              className="flex-[1.4] rounded-2xl bg-[#B8860B] py-3.5 font-bold text-white transition hover:bg-yellow-700 disabled:opacity-60"
            >
              {busy ? "שומר..." : "סיום ושמירה"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}