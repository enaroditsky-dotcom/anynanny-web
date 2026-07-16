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
  const [yearsExperience, setYearsExperience] = useState("");
  const [firstAidCert, setFirstAidCert] = useState("כן");
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
      const patch: Record<string, unknown> = {
        onboarding_completed_at: completedAt,
        updated_at: completedAt,
        [SITTER_WORKING_CITIES_COLUMN]: citiesResult.cities
      };

      if (Number.isFinite(years) && years >= 0) {
        patch.years_experience = Math.floor(years);
      }

      // firstAidCert is collected in the wizard; dedicated DB column is not required.
      const { data, error: updateError } = await auth.supabase
        .from(SITTER_PROFILES_TABLE)
        .update(patch)
        .eq(SITTER_PROFILES_USER_COLUMN, auth.userId)
        .select(`onboarding_completed_at, ${SITTER_WORKING_CITIES_COLUMN}`)
        .maybeSingle();

      if (updateError) {
        // Retry with only the completion timestamp if optional columns are unavailable.
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
    <div className="mx-auto max-w-sm rounded-[2rem] border-2 border-[#C5A059] bg-[#FDFBF6] p-8 text-center shadow-2xl">
      <h2 className="mb-6 text-2xl font-bold text-[#001F3F]">ברוכה הבאה ל-AnyNanny</h2>

      {error ? (
        <p className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>
      ) : null}

      {step === 1 && (
        <div className="space-y-4">
          <p className="font-medium text-navy-800">כמה שנות ניסיון יש לך בטיפול בילדים?</p>
          <input
            type="number"
            min={0}
            value={yearsExperience}
            onChange={(e) => setYearsExperience(e.target.value)}
            className="w-full rounded-2xl border-2 border-[#C5A059]/30 bg-white p-4"
            placeholder="מספר שנים"
          />
          <button
            type="button"
            onClick={() => setStep(2)}
            className="w-full rounded-2xl bg-[#001F3F] py-4 font-bold text-white transition hover:bg-blue-900"
          >
            הבא
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <p className="font-medium text-navy-800">האם יש לך הסמכת עזרה ראשונה?</p>
          <select
            value={firstAidCert}
            onChange={(e) => setFirstAidCert(e.target.value)}
            className="w-full rounded-2xl border-2 border-[#C5A059]/30 bg-white p-4"
          >
            <option>כן</option>
            <option>לא</option>
          </select>
          <button
            type="button"
            onClick={() => setStep(3)}
            className="w-full rounded-2xl bg-[#001F3F] py-4 font-bold text-white transition hover:bg-blue-900"
          >
            הבא
          </button>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4 text-right">
          <p className="text-center font-medium text-navy-800">באילו ערים את עובדת?</p>
          <IsraelCitiesMultiSelect
            value={workingCities}
            onChange={setWorkingCities}
            disabled={busy}
            label="בחרי ערים"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => setStep(2)}
              className="flex-1 rounded-2xl border-2 border-[#001F3F]/20 py-4 font-bold text-[#001F3F] transition hover:bg-white/60 disabled:opacity-60"
            >
              חזרה
            </button>
            <button
              type="button"
              disabled={busy || workingCities.length === 0}
              onClick={() => void handleFinish()}
              className="flex-[1.4] rounded-2xl bg-[#B8860B] py-4 font-bold text-white transition hover:bg-yellow-700 disabled:opacity-60"
            >
              {busy ? "שומר..." : "סיום ושמירה"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
