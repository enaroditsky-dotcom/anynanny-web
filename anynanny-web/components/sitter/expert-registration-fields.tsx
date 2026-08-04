"use client";

import { ExpertServiceSelect } from "@/components/sitter/expert-service-select";
import {
  EXPERT_BIO_MAX_LENGTH,
  EXPERT_ONLY_SERVICE_KINDS,
  SERVICE_LOCATION_OPTIONS,
  type ExpertProfileDraft,
  type ServiceLocationId
} from "@/lib/sitter/expert-profile";

type Props = {
  value: ExpertProfileDraft;
  onChange: (next: ExpertProfileDraft) => void;
  /** Compact spacing for onboarding wizard */
  compact?: boolean;
};

export function ExpertRegistrationFields({ value, onChange, compact = false }: Props) {
  const fieldGap = compact ? "space-y-3" : "space-y-4";
  const inputClass =
    "w-full rounded-xl border border-slate-200 bg-white p-3 text-sm outline-none focus:border-navy-header";
  const labelClass = "mb-1.5 block text-xs font-bold text-slate-600";

  const toggleLocation = (id: ServiceLocationId) => {
    const has = value.serviceLocations.includes(id);
    onChange({
      ...value,
      serviceLocations: has
        ? value.serviceLocations.filter((x) => x !== id)
        : [...value.serviceLocations, id]
    });
  };

  return (
    <div className={`${fieldGap} text-right`} dir="rtl">
      <ExpertServiceSelect
        value={value.serviceType}
        onChange={(serviceType) => {
          if (EXPERT_ONLY_SERVICE_KINDS.includes(serviceType as (typeof EXPERT_ONLY_SERVICE_KINDS)[number])) {
            onChange({
              ...value,
              serviceType: serviceType as ExpertProfileDraft["serviceType"]
            });
          }
        }}
        kinds={[...EXPERT_ONLY_SERVICE_KINDS]}
        label="סוג השירות המקצועי:"
      />

      <fieldset>
        <legend className={labelClass}>מיקום השירות</legend>
        <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
          {SERVICE_LOCATION_OPTIONS.map((opt) => {
            const checked = value.serviceLocations.includes(opt.id);
            return (
              <label
                key={opt.id}
                className="flex cursor-pointer items-center justify-between gap-3 text-sm text-slate-800"
              >
                <span>{opt.labelHe}</span>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleLocation(opt.id)}
                  className="h-4 w-4 rounded border-slate-300 text-navy-header focus:ring-navy-header"
                />
              </label>
            );
          })}
        </div>
      </fieldset>

      <fieldset>
        <legend className={labelClass}>מודל תמחור</legend>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              { id: "hourly" as const, label: "מחיר שעתי" },
              { id: "package" as const, label: "מחיר גלובלי / חבילה" }
            ] as const
          ).map((opt) => {
            const selected = value.pricingModel === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => onChange({ ...value, pricingModel: opt.id })}
                className={`rounded-xl border px-3 py-2.5 text-xs font-bold transition ${
                  selected
                    ? "border-navy-header bg-[#001F3F]/5 text-navy-header ring-1 ring-navy-header/20"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      {value.pricingModel === "hourly" ? (
        <div>
          <label className={labelClass} htmlFor="expert-hourly-rate">
            מחיר שעתי (₪)
          </label>
          <input
            id="expert-hourly-rate"
            type="number"
            min={0}
            step={1}
            inputMode="decimal"
            className={inputClass}
            value={value.hourlyRateNis}
            onChange={(e) => onChange({ ...value, hourlyRateNis: e.target.value })}
            placeholder="לדוגמה: 250"
          />
        </div>
      ) : (
        <div>
          <label className={labelClass} htmlFor="expert-package-price">
            מחיר גלובלי / חבילה (₪)
          </label>
          <input
            id="expert-package-price"
            type="number"
            min={0}
            step={1}
            inputMode="decimal"
            className={inputClass}
            value={value.packagePriceNis}
            onChange={(e) => onChange({ ...value, packagePriceNis: e.target.value })}
            placeholder="לדוגמה: 1,800"
          />
        </div>
      )}

      <div>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <label className="text-xs font-bold text-slate-600" htmlFor="expert-bio">
            תיאור מקצועי (ביו)
          </label>
          <span className="text-[10px] text-slate-400">
            {value.bio.length}/{EXPERT_BIO_MAX_LENGTH}
          </span>
        </div>
        <textarea
          id="expert-bio"
          rows={compact ? 5 : 6}
          maxLength={EXPERT_BIO_MAX_LENGTH}
          className={`${inputClass} resize-y min-h-[120px]`}
          value={value.bio}
          onChange={(e) => onChange({ ...value, bio: e.target.value.slice(0, EXPERT_BIO_MAX_LENGTH) })}
          placeholder="ספרו להורים על הרקע המקצועי, הגישה שלכם ומה מייחד את השירות…"
        />
      </div>

      <div>
        <label className={labelClass} htmlFor="expert-certifications">
          הסמכות וניסיון מקצועי <span className="font-medium text-slate-400">(אופציונלי)</span>
        </label>
        <textarea
          id="expert-certifications"
          rows={compact ? 3 : 4}
          className={`${inputClass} resize-y`}
          value={value.certifications}
          onChange={(e) => onChange({ ...value, certifications: e.target.value })}
          placeholder="תעודות, קורסים, שנות ניסיון, מסגרות מקצועיות…"
        />
      </div>
    </div>
  );
}
