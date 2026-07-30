"use client";

import type { ReactNode } from "react";

export function PersonalAreaSection({
  title,
  description,
  accent = "navy",
  children
}: {
  title: string;
  description?: string;
  accent?: "navy" | "gold" | "emerald" | "sky";
  children: ReactNode;
}) {
  const accentClass =
    accent === "gold"
      ? "border-[#C5A059]/25"
      : accent === "emerald"
        ? "border-emerald-200/80"
        : accent === "sky"
          ? "border-sky-200/80"
          : "border-navy-header/10";

  return (
    <section className={`rounded-2xl border bg-white p-4 shadow-soft sm:p-5 ${accentClass}`} dir="rtl">
      <div className="mb-3 text-right">
        <h2 className="text-[15px] font-bold text-[#001F3F]">{title}</h2>
        {description ? <p className="mt-1 text-xs leading-relaxed text-slate-500">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function PersonalField({
  label,
  children,
  className = ""
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block text-right ${className}`}>
      <span className="mb-1 block text-[11px] font-semibold text-slate-600">{label}</span>
      {children}
    </label>
  );
}

export const personalInputClassName =
  "w-full rounded-xl border border-[#001F3F]/15 bg-[#FDFBF6]/70 px-3 py-2.5 text-sm text-[#001F3F] outline-none transition focus:border-[#001F3F]/40 focus:bg-white";

export const personalTextareaClassName = `${personalInputClassName} min-h-[6.5rem] resize-y leading-relaxed`;

export function PersonalCheckbox({
  checked,
  onChange,
  label,
  disabled = false
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-right text-sm text-[#001F3F]">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
      />
      <span>{label}</span>
    </label>
  );
}
