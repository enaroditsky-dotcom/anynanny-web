import React, { useState } from "react";
import {
  commitNowClockInput,
  formatNowClockInput,
  normalizeRequestedTime
} from "@/lib/broadcast/now-request-details";

/**
 * One 24-hour HH:MM field.
 * Separate hour and minute boxes moved focus as soon as the hour had two digits,
 * so the second keystroke landed in the minutes. A native time input can also
 * show AM/PM from the OS locale.
 */
export function NowSpecificTimeInput({
  value,
  disabled = false,
  onChange
}: {
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const stored = normalizeRequestedTime(value) ?? "";
  const [draft, setDraft] = useState(stored);
  const [focused, setFocused] = useState(false);
  const shown = focused || !stored ? draft : stored;
  const invalid = /^\d{2}:\d{2}$/.test(shown) && commitNowClockInput(shown) === null;

  return (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      autoCorrect="off"
      spellCheck={false}
      dir="ltr"
      placeholder="16:00"
      aria-label="שעה"
      aria-invalid={invalid}
      disabled={disabled}
      value={shown}
      onFocus={() => {
        setDraft(shown);
        setFocused(true);
      }}
      onBlur={() => {
        setFocused(false);
        const committed = commitNowClockInput(draft);
        if (committed) {
          setDraft(committed);
          onChange(committed);
          return;
        }
        onChange("");
      }}
      onChange={(event) => {
        const next = formatNowClockInput(event.target.value);
        const committed = commitNowClockInput(next);
        setDraft(committed ?? next);
        onChange(committed ?? "");
      }}
      className={`h-[52px] w-full rounded-[15px] border bg-white px-4 text-left text-[17px] font-medium text-[#001F3F] shadow-sm outline-none transition focus:ring-2 disabled:opacity-60 ${
        invalid
          ? "border-red-300 focus:border-red-400 focus:ring-red-400/20"
          : "border-slate-200/80 focus:border-emerald-500 focus:ring-emerald-500/20"
      }`}
    />
  );
}
