"use client";

import {
  NOW_FAVORITES_ONLY_LABEL,
  NOW_VERIFIED_SITTERS_ONLY_LABEL
} from "@/lib/trust/request-recipient-filters";

type NowRecipientFiltersProps = {
  favoritesOnly: boolean;
  verifiedSittersOnly: boolean;
  disabled?: boolean;
  onFavoritesOnlyChange: (checked: boolean) => void;
  onVerifiedSittersOnlyChange: (checked: boolean) => void;
};

function FilterLine({
  checked,
  disabled,
  label,
  onChange
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-2.5 py-0.5">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="h-5 w-5 shrink-0 rounded border-slate-300 accent-[#00A86B]"
      />
      <span className="min-w-0 flex-1 text-right text-[15px] font-medium leading-snug text-[#001F3F]">
        {label}
      </span>
    </label>
  );
}

/** Per-request NOW audience. Unchecked leaves the current recipient pool. */
export function NowRecipientFilters({
  favoritesOnly,
  verifiedSittersOnly,
  disabled,
  onFavoritesOnlyChange,
  onVerifiedSittersOnlyChange
}: NowRecipientFiltersProps) {
  return (
    <fieldset
      dir="rtl"
      disabled={disabled}
      className="min-w-0 rounded-2xl border border-slate-200/80 bg-[#F7FBF8] px-3 py-1.5"
    >
      <legend className="sr-only">סינון נמענות</legend>
      <FilterLine
        checked={favoritesOnly}
        disabled={disabled}
        label={NOW_FAVORITES_ONLY_LABEL}
        onChange={onFavoritesOnlyChange}
      />
      <FilterLine
        checked={verifiedSittersOnly}
        disabled={disabled}
        label={NOW_VERIFIED_SITTERS_ONLY_LABEL}
        onChange={onVerifiedSittersOnlyChange}
      />
    </fieldset>
  );
}
