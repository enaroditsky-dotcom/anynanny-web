"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { MouseEvent, ReactNode } from "react";

export const PARENT_TERMS_LABEL =
  "אני מצהיר/ה שקראתי והסכמתי לכל תנאי השימוש של AnyNanny.";

export const SITTER_TERMS_LABEL =
  "אני מצהיר/ה שקראתי והסכמתי לתנאי השימוש, וידוע לי ש-AnyNanny מציגה להורים את תעריף המשמרת בתוספת דמי תפעול וסנכרון של 10%.";

const TERMS_PHRASE = "תנאי השימוש";

const checkboxClass =
  "mt-0.5 h-4 w-4 shrink-0 rounded border border-navy-header/25 accent-emerald-600";

const termsLinkClass =
  "font-semibold text-navy-header underline decoration-navy-header/30 underline-offset-2 transition hover:decoration-navy-header/60";

function stopLabelToggle(event: MouseEvent<HTMLAnchorElement>) {
  event.stopPropagation();
}

function renderLabelWithTermsLink(label: string, from: string): ReactNode {
  const idx = label.indexOf(TERMS_PHRASE);
  if (idx === -1) return label;

  const href = `/terms?from=${encodeURIComponent(from)}`;

  return (
    <>
      {label.slice(0, idx)}
      <Link
        href={href}
        className={termsLinkClass}
        onClick={stopLabelToggle}
        onMouseDown={stopLabelToggle}
      >
        {TERMS_PHRASE}
      </Link>
      {label.slice(idx + TERMS_PHRASE.length)}
    </>
  );
}

type TermsAcceptanceCheckboxProps = {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
};

export function TermsAcceptanceCheckbox({
  id,
  label,
  checked,
  onChange,
  disabled = false
}: TermsAcceptanceCheckboxProps) {
  const pathname = usePathname();
  const from = pathname && pathname.startsWith("/") ? pathname : "/";

  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-start gap-3 rounded-xl border border-navy-header/10 bg-[#FDFBF6]/80 p-3 text-right shadow-sm"
    >
      <input
        id={id}
        type="checkbox"
        required
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className={checkboxClass}
      />
      <span className="min-w-0 flex-1 text-xs leading-relaxed text-navy-900">
        {renderLabelWithTermsLink(label, from)}
      </span>
    </label>
  );
}
