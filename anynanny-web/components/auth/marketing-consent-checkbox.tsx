"use client";

import {
  MARKETING_CONSENT_CHECKBOX_LABEL,
  MARKETING_CONSENT_INTRO
} from "@/lib/legal/marketing-consent";

const checkboxClass =
  "mt-0.5 h-4 w-4 shrink-0 rounded border border-navy-header/25 accent-emerald-600";

type MarketingConsentCheckboxProps = {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
};

export function MarketingConsentCheckbox({
  id,
  checked,
  onChange,
  disabled = false
}: MarketingConsentCheckboxProps) {
  return (
    <div className="space-y-2">
      <p className="px-1 text-right text-xs leading-relaxed text-navy-900">{MARKETING_CONSENT_INTRO}</p>
      <label
        htmlFor={id}
        className="flex cursor-pointer items-start gap-3 rounded-xl border border-navy-header/10 bg-[#FDFBF6]/80 p-3 text-right shadow-sm"
      >
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          disabled={disabled}
          className={checkboxClass}
        />
        <span className="min-w-0 flex-1 text-xs leading-relaxed text-navy-900">
          {MARKETING_CONSENT_CHECKBOX_LABEL}
        </span>
      </label>
    </div>
  );
}
