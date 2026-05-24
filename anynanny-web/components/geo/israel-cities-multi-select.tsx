"use client";

import { Check, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ISRAEL_CITIES, type IsraelCity } from "@/lib/geo/israel-cities";
import {
  SITTER_WORKING_CITIES_SAVE_SUCCESS_MESSAGE,
  type WorkingCitiesSaveOutcome
} from "@/lib/sitter/sitter-working-cities";

const checkboxClass =
  "h-4 w-4 shrink-0 rounded border border-navy-header/25 accent-emerald-600";

function sameCitySet(a: readonly IsraelCity[], b: readonly IsraelCity[]): boolean {
  if (a.length !== b.length) return false;
  const setB = new Set(b);
  return a.every((city) => setB.has(city));
}

function SavedCitiesSummary({ cities }: { cities: IsraelCity[] }) {
  return (
    <p className="text-right text-sm text-slate-700">
      {cities.length === 0 ? (
        <span className="text-slate-500">לא הוגדרו אזורי שירות</span>
      ) : (
        <span className="font-medium text-slate-900">{cities.join(", ")}</span>
      )}
    </p>
  );
}

type IsraelCitiesMultiSelectProps = {
  /** Committed selection (from DB or parent form state). */
  value: IsraelCity[];
  /** Immediate toggle updates — used when selection is saved elsewhere (e.g. onboarding form submit). */
  onChange?: (next: IsraelCity[]) => void;
  /** Yad2-style confirm: toggles update local draft; parent persists on button click. */
  onConfirm?: (next: IsraelCity[]) => void | Promise<void | WorkingCitiesSaveOutcome>;
  disabled?: boolean;
  label?: string;
  confirmLabel?: string;
  saving?: boolean;
  saveSuccess?: boolean;
  successMessage?: string;
  /** PostgREST / validation error from parent save handler. */
  errorMessage?: string | null;
};

export function IsraelCitiesMultiSelect({
  value,
  onChange,
  onConfirm,
  disabled = false,
  label = "אזורי עבודה (ערים)",
  confirmLabel = "שמור אזורי שירות",
  saving = false,
  saveSuccess = false,
  successMessage = SITTER_WORKING_CITIES_SAVE_SUCCESS_MESSAGE,
  errorMessage = null
}: IsraelCitiesMultiSelectProps) {
  const confirmMode = onConfirm != null;
  const [query, setQuery] = useState("");
  const [localSelectedCities, setLocalSelectedCities] = useState<IsraelCity[]>(value);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (confirmMode) {
      setLocalSelectedCities(value);
    }
  }, [confirmMode, value]);

  useEffect(() => {
    if (errorMessage) {
      setConfirmError(null);
    }
  }, [errorMessage]);

  useEffect(() => {
    if (confirmMode && saveSuccess && !saving) {
      setIsOpen(false);
      setQuery("");
    }
  }, [confirmMode, saveSuccess, saving]);

  const selectedCities = confirmMode ? localSelectedCities : value;
  const hasPendingChanges = confirmMode && !sameCitySet(localSelectedCities, value);
  const showSuccess = saveSuccess && !hasPendingChanges && !saving;
  const displayError = errorMessage?.trim() || confirmError;
  const panelOpen = !confirmMode || isOpen;

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return ISRAEL_CITIES;
    return ISRAEL_CITIES.filter((city) => city.includes(q));
  }, [query]);

  const openEditor = () => {
    if (disabled || saving) return;
    setLocalSelectedCities(value);
    setConfirmError(null);
    setQuery("");
    setIsOpen(true);
  };

  const closeEditor = () => {
    setIsOpen(false);
    setQuery("");
    setLocalSelectedCities(value);
    setConfirmError(null);
  };

  const toggle = (city: IsraelCity) => {
    if (disabled || saving) return;

    if (confirmMode) {
      setConfirmError(null);
      setLocalSelectedCities((prev) =>
        prev.includes(city) ? prev.filter((c) => c !== city) : [...prev, city]
      );
      return;
    }

    if (onChange) {
      if (value.includes(city)) {
        onChange(value.filter((c) => c !== city));
      } else {
        onChange([...value, city]);
      }
    }
  };

  const handleConfirm = async () => {
    if (!onConfirm || disabled || saving) return;

    if (localSelectedCities.length === 0) {
      setConfirmError("יש לבחור לפחות עיר אחת.");
      return;
    }

    if (!hasPendingChanges && sameCitySet(localSelectedCities, value)) {
      setIsOpen(false);
      return;
    }

    setConfirmError(null);

    try {
      const outcome = await onConfirm(localSelectedCities);
      if (outcome && outcome.success === false) {
        setConfirmError(outcome.error);
        return;
      }
      setIsOpen(false);
      setQuery("");
    } catch (err) {
      const message =
        err instanceof Error && err.message.trim()
          ? err.message.trim()
          : "שמירת אזורי העבודה נכשלה.";
      console.warn("[IsraelCitiesMultiSelect] confirm failed:", message);
      setConfirmError(message);
    }
  };

  const confirmDisabled =
    disabled || saving || localSelectedCities.length === 0 || !hasPendingChanges;

  return (
    <div className="space-y-2" dir="rtl">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-navy-900">{label}</span>
        {panelOpen && selectedCities.length > 0 ? (
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800">
            {selectedCities.length} נבחרו
            {confirmMode && hasPendingChanges ? (
              <span className="mr-1 text-amber-700"> - לא נשמר</span>
            ) : null}
          </span>
        ) : null}
      </div>

      {confirmMode ? <SavedCitiesSummary cities={value} /> : null}

      {confirmMode && !isOpen ? (
        <button
          type="button"
          onClick={openEditor}
          disabled={disabled || saving}
          className="w-full rounded-xl border border-navy-header/15 bg-slate-50 py-2.5 text-sm font-semibold text-navy-800 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-55"
        >
          ערוך אזורי שירות
        </button>
      ) : null}

      {panelOpen ? (
        <div className="space-y-2 rounded-xl border border-navy-header/10 bg-white p-3 shadow-sm">
          <input
            type="search"
            placeholder="חיפוש עיר..."
            className="block min-h-10 w-full rounded-lg border border-navy-header/20 bg-[#FDFBF6] px-3 py-2 text-sm"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={disabled || saving}
            autoComplete="off"
          />

          <div className="max-h-52 space-y-1 overflow-y-auto rounded-xl border border-navy-header/10 bg-[#FDFBF6]/60 p-2">
            {filtered.length === 0 ? (
              <p className="py-2 text-center text-xs text-slate-500">לא נמצאו ערים</p>
            ) : (
              filtered.map((city) => {
                const checked = selectedCities.includes(city);
                return (
                  <label
                    key={city}
                    className={`flex cursor-pointer flex-row-reverse items-center gap-2 rounded-lg px-2 py-2 text-sm transition ${
                      checked ? "bg-emerald-50/80 text-emerald-950" : "hover:bg-slate-50"
                    } ${disabled || saving ? "cursor-not-allowed opacity-60" : ""}`}
                  >
                    <input
                      type="checkbox"
                      className={checkboxClass}
                      checked={checked}
                      disabled={disabled || saving}
                      onChange={() => toggle(city)}
                    />
                    <span className="flex-1 text-right">{city}</span>
                  </label>
                );
              })
            )}
          </div>

          {confirmMode ? (
            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={() => void handleConfirm()}
                disabled={confirmDisabled}
                className="inline-flex w-full flex-row-reverse items-center justify-center gap-2 rounded-2xl bg-emerald-600 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-55"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    שומר...
                  </>
                ) : showSuccess ? (
                  <>
                    <Check className="h-4 w-4" aria-hidden />
                    {successMessage}
                  </>
                ) : (
                  confirmLabel
                )}
              </button>

              <button
                type="button"
                onClick={closeEditor}
                disabled={disabled || saving}
                className="w-full rounded-xl border border-navy-header/15 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-55"
              >
                ביטול
              </button>

              {showSuccess ? (
                <p
                  role="status"
                  aria-live="polite"
                  className="rounded-lg bg-emerald-50 px-3 py-2 text-center text-xs font-medium text-emerald-900"
                >
                  {successMessage}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {!confirmMode ? (
        selectedCities.length > 0 ? (
          <p className="text-right text-xs text-slate-600">{selectedCities.join(", ")}</p>
        ) : (
          <p className="text-right text-xs text-slate-500">בחרו לפחות עיר אחת שבה אתם מוכנים לעבוד.</p>
        )
      ) : null}

      {displayError ? (
        <p
          role="alert"
          className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-center text-xs text-amber-950"
        >
          {displayError}
        </p>
      ) : confirmMode && isOpen && hasPendingChanges && !saving ? (
        <p className="text-center text-xs text-slate-500">לחצו לאישור כדי לעדכן את אזורי השירות.</p>
      ) : null}
    </div>
  );
}
