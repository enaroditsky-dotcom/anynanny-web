"use client";

import { Plus } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";

export type FloatingActionButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  label: string;
};

/** Large circular primary action — match app accent (emerald). */
export function FloatingActionButton({ label, className = "", ...rest }: FloatingActionButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-white shadow-[0_10px_28px_-6px_rgba(5,150,105,0.55)] ring-2 ring-emerald-500/30 transition hover:brightness-110 active:scale-[0.96] active:brightness-95 sm:h-16 sm:w-16 ${className}`.trim()}
      {...rest}
    >
      <Plus className="h-7 w-7 sm:h-8 sm:w-8" strokeWidth={2.25} aria-hidden />
    </button>
  );
}
