import type { ReactNode } from "react";
import { todayIsoDate } from "@/lib/onboarding/shared";

const fieldClass =
  "min-h-12 w-full min-w-0 rounded-2xl border border-[#001F3F]/15 bg-[#FDFBF6] px-3.5 text-sm text-[#001F3F] outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100";

export function OnboardingField({
  id,
  label,
  required = false,
  hint,
  children
}: {
  id: string;
  label: string;
  required?: boolean;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5 text-right">
      <label htmlFor={id} className="block text-sm font-semibold text-[#001F3F]">
        {label}
        {required ? (
          <span className="ms-1 text-teal-700" aria-hidden>
            *
          </span>
        ) : null}
        {required ? <span className="sr-only"> (שדה חובה)</span> : null}
      </label>
      {hint ? <p className="text-xs text-slate-500">{hint}</p> : null}
      {children}
    </div>
  );
}

export function OnboardingTextInput({
  id,
  label,
  required,
  value,
  onChange,
  autoComplete,
  inputMode,
  maxLength,
  placeholder
}: {
  id: string;
  label: string;
  required?: boolean;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  inputMode?: "text" | "tel" | "numeric" | "decimal";
  maxLength?: number;
  placeholder?: string;
}) {
  return (
    <OnboardingField id={id} label={label} required={required}>
      <input
        id={id}
        type={inputMode === "tel" ? "tel" : "text"}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        inputMode={inputMode}
        maxLength={maxLength}
        placeholder={placeholder}
        required={required}
        aria-required={required || undefined}
        className={fieldClass}
      />
    </OnboardingField>
  );
}

export function OnboardingDateInput({
  id,
  label,
  required,
  value,
  onChange,
  disallowFuture = false
}: {
  id: string;
  label: string;
  required?: boolean;
  value: string;
  onChange: (value: string) => void;
  disallowFuture?: boolean;
}) {
  return (
    <OnboardingField id={id} label={label} required={required}>
      <input
        id={id}
        type="date"
        lang="he-IL"
        value={value}
        max={disallowFuture ? todayIsoDate() : undefined}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        aria-required={required || undefined}
        className={`${fieldClass} text-right`}
      />
    </OnboardingField>
  );
}

export function OnboardingSelect({
  id,
  label,
  required,
  value,
  onChange,
  options,
  placeholder = "בחרו…"
}: {
  id: string;
  label: string;
  required?: boolean;
  value: string;
  onChange: (value: string) => void;
  options: readonly { value: string; label: string }[];
  placeholder?: string;
}) {
  return (
    <OnboardingField id={id} label={label} required={required}>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        aria-required={required || undefined}
        className={fieldClass}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </OnboardingField>
  );
}

export function OnboardingYesNo({
  legend,
  required,
  value,
  onChange,
  name
}: {
  legend: string;
  required?: boolean;
  value: boolean | null;
  onChange: (value: boolean) => void;
  name: string;
}) {
  return (
    <fieldset className="space-y-2 text-right">
      <legend className="text-sm font-semibold text-[#001F3F]">
        {legend}
        {required ? (
          <span className="ms-1 text-teal-700" aria-hidden>
            *
          </span>
        ) : null}
        {required ? <span className="sr-only"> (שדה חובה)</span> : null}
      </legend>
      <div className="grid grid-cols-2 gap-2" role="group" aria-label={legend}>
        {[
          { label: "כן", selected: value === true, next: true },
          { label: "לא", selected: value === false, next: false }
        ].map((option) => (
          <button
            key={option.label}
            type="button"
            name={name}
            aria-pressed={option.selected}
            onClick={() => onChange(option.next)}
            className={`min-h-12 rounded-2xl border-2 text-sm font-bold transition ${
              option.selected
                ? "border-teal-700 bg-teal-50 text-teal-900"
                : "border-[#001F3F]/15 bg-[#FDFBF6] text-[#001F3F]"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function OnboardingChoiceRow<T extends string | number>({
  legend,
  required,
  options,
  value,
  onChange
}: {
  legend: string;
  required?: boolean;
  options: readonly { value: T; label: string }[];
  value: T | null;
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className="space-y-2 text-right">
      <legend className="text-sm font-semibold text-[#001F3F]">
        {legend}
        {required ? (
          <span className="ms-1 text-teal-700" aria-hidden>
            *
          </span>
        ) : null}
        {required ? <span className="sr-only"> (שדה חובה)</span> : null}
      </legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const selected = value === option.value;
          return (
            <button
              key={String(option.value)}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(option.value)}
              className={`min-h-11 min-w-11 rounded-xl border-2 px-3 text-sm font-bold transition ${
                selected
                  ? "border-teal-700 bg-teal-50 text-teal-900"
                  : "border-[#001F3F]/15 bg-[#FDFBF6] text-[#001F3F]"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function OnboardingChips<T extends string>({
  legend,
  required,
  options,
  value,
  onChange
}: {
  legend: string;
  required?: boolean;
  options: readonly { value: T; label: string }[];
  value: T[];
  onChange: (value: T[]) => void;
}) {
  const toggle = (next: T) => {
    onChange(value.includes(next) ? value.filter((item) => item !== next) : [...value, next]);
  };

  return (
    <fieldset className="space-y-2 text-right">
      <legend className="text-sm font-semibold text-[#001F3F]">
        {legend}
        {required ? (
          <span className="ms-1 text-teal-700" aria-hidden>
            *
          </span>
        ) : null}
        {required ? <span className="sr-only"> (שדה חובה)</span> : null}
      </legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const selected = value.includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              onClick={() => toggle(option.value)}
              className={`min-h-11 rounded-xl border-2 px-3 text-sm font-semibold transition ${
                selected
                  ? "border-teal-700 bg-teal-50 text-teal-900"
                  : "border-[#001F3F]/15 bg-[#FDFBF6] text-[#001F3F]"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
