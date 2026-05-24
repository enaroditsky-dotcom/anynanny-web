"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { IsraelCitiesMultiSelect } from "@/components/geo/israel-cities-multi-select";
import type { IsraelCity } from "@/lib/geo/israel-cities";
import {
  loadSitterWorkingCities,
  SITTER_WORKING_CITIES_SAVE_SUCCESS_MESSAGE,
  toWorkingCitiesSaveOutcome,
  updateSitterWorkingCities,
  type WorkingCitiesSaveOutcome
} from "@/lib/sitter/sitter-working-cities";

type SaveStatus = "idle" | "saving" | "saved" | "error";

type SitterProfileFormProps = {
  userId: string | null;
  disabled?: boolean;
  className?: string;
};

export function SitterProfileForm({ userId, disabled = false, className = "" }: SitterProfileFormProps) {
  const [ready, setReady] = useState(false);
  const [workingCities, setWorkingCities] = useState<IsraelCity[]>([]);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const saveGenRef = useRef(0);
  const savedResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (savedResetRef.current) clearTimeout(savedResetRef.current);
    };
  }, []);

  useEffect(() => {
    if (!userId) {
      setReady(false);
      setWorkingCities([]);
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const result = await loadSitterWorkingCities(userId);
        if (cancelled) return;

        setWorkingCities(result.ok ? result.cities : []);
        setErrorMessage(null);
      } catch {
        if (!cancelled) {
          console.warn("Working cities column not ready yet, defaulting to empty array.");
          setWorkingCities([]);
          setErrorMessage(null);
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const persistWorkingCities = useCallback(
    async (next: IsraelCity[]): Promise<WorkingCitiesSaveOutcome> => {
      if (!userId || disabled) {
        return { success: false, error: "לא ניתן לשמור כרגע." };
      }

      const gen = ++saveGenRef.current;
      setSaveStatus("saving");
      setErrorMessage(null);

      try {
        const result = await updateSitterWorkingCities(userId, next);
        const outcome = toWorkingCitiesSaveOutcome(result);

        if (gen !== saveGenRef.current) {
          return { success: false, error: "הבקשה בוטלה." };
        }

        if (!outcome.success) {
          setSaveStatus("error");
          setErrorMessage(outcome.error);
          return outcome;
        }

        setWorkingCities(outcome.cities);
        setSaveStatus("saved");
        setErrorMessage(null);

        if (savedResetRef.current) clearTimeout(savedResetRef.current);
        savedResetRef.current = setTimeout(() => {
          setSaveStatus("idle");
        }, 2500);

        return outcome;
      } catch (err) {
        const message =
          err instanceof Error && err.message.trim()
            ? err.message.trim()
            : "שמירת אזורי העבודה נכשלה.";
        console.warn("[SitterProfileForm] save exception:", message);

        if (gen !== saveGenRef.current) {
          return { success: false, error: message };
        }

        setSaveStatus("error");
        setErrorMessage(message);
        return { success: false, error: message };
      }
    },
    [userId, disabled]
  );

  if (!userId) return null;

  return (
    <section
      className={`rounded-3xl border border-navy-header/12 bg-white p-4 shadow-soft sm:p-5 ${className}`}
      dir="rtl"
      aria-labelledby="sitter-profile-form-heading"
    >
      <div className="mb-3 text-right">
        <h2 id="sitter-profile-form-heading" className="text-base font-bold text-navy-header">
          אזורי שירות
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-slate-600">
          בחרו את הערים שבהן אתם מוכנים לעבוד, ולחצו &quot;שמור אזורי שירות&quot; לעדכון.
        </p>
      </div>

      {!ready ? (
        <div className="min-h-[8rem] animate-pulse rounded-xl bg-slate-50 p-4" aria-busy="true">
          <div className="h-3 w-1/3 rounded bg-slate-200" />
          <div className="mt-3 h-10 w-full rounded-lg bg-slate-200" />
        </div>
      ) : (
        <IsraelCitiesMultiSelect
          value={workingCities}
          onConfirm={persistWorkingCities}
          disabled={disabled}
          saving={saveStatus === "saving"}
          saveSuccess={saveStatus === "saved"}
          successMessage={SITTER_WORKING_CITIES_SAVE_SUCCESS_MESSAGE}
          errorMessage={errorMessage}
        />
      )}
    </section>
  );
}
