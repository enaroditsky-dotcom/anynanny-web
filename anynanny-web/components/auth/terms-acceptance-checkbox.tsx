"use client";

import Link from "next/link";
import type { MouseEvent } from "react";

export const LEGAL_ACCEPTANCE_REQUIRED_MESSAGE =
  "יש לאשר את תנאי השימוש ואת מדיניות הפרטיות כדי להשלים את ההרשמה.";

const checkboxClass =
  "mt-0.5 h-4 w-4 shrink-0 rounded border border-navy-header/25 accent-emerald-600";

const legalLinkClass =
  "font-semibold text-navy-header underline decoration-navy-header/30 underline-offset-2 transition hover:decoration-navy-header/60";

function stopLabelToggle(event: MouseEvent<HTMLAnchorElement>) {
  event.stopPropagation();
}

type TermsAcceptanceCheckboxProps = {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  error?: string | null;
};

export function TermsAcceptanceCheckbox({
  id,
  checked,
  onChange,
  disabled = false,
  error = null
}: TermsAcceptanceCheckboxProps) {
  return (
    <div className="space-y-2">
      <label
        htmlFor={id}
        className={`flex cursor-pointer items-start gap-3 rounded-xl border bg-[#FDFBF6]/80 p-3 text-right shadow-sm ${
          error
            ? "border-rose-300"
            : "border-navy-header/10"
        }`}
      >
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          className={checkboxClass}
        />
        <span className="min-w-0 flex-1 text-xs leading-relaxed text-navy-900">
          קראתי ואני מאשר/ת את{" "}
          <Link
            href="/terms"
            target="_blank"
            rel="noopener noreferrer"
            className={legalLinkClass}
            onClick={stopLabelToggle}
            onMouseDown={stopLabelToggle}
          >
            תנאי השימוש
          </Link>{" "}
          ואת{" "}
          <Link
            href="/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className={legalLinkClass}
            onClick={stopLabelToggle}
            onMouseDown={stopLabelToggle}
          >
            מדיניות הפרטיות
          </Link>
        </span>
      </label>
      {error ? (
        <p id={`${id}-error`} className="px-1 text-xs font-medium text-rose-700" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
