"use client";

import { Loader2 } from "lucide-react";
import { SESSION_ACTION_CIRCLE_STYLE, SESSION_CIRCLE_SHELL_CLASS } from "@/lib/session/session-circle";

export const DOUBLE_SHAKE_NO_SHIFT_TODAY_LABEL = "אין משמרת פעילה היום";

export type DoubleShakeCircleVariant =
  | "disabled"
  | "navy"
  | "emerald"
  | "approve"
  | "salmon"
  | "waiting-navy"
  | "waiting-salmon";

const VARIANT_CLASS: Record<DoubleShakeCircleVariant, string> = {
  disabled:
    "pointer-events-none cursor-default bg-slate-400 text-white opacity-55 shadow-none ring-slate-300/50",
  navy: "bg-[#001F3F] text-white shadow-[0_12px_40px_-10px_rgba(0,31,63,0.65)] ring-[#001F3F]/25 transition hover:brightness-110 active:brightness-95",
  emerald:
    "bg-emerald-600 text-white shadow-[0_12px_40px_-10px_rgba(5,150,105,0.55)] ring-emerald-500/30 transition hover:bg-emerald-700 active:scale-[0.99]",
  approve:
    "bg-emerald-600 text-white shadow-[0_12px_40px_-10px_rgba(5,150,105,0.55)] ring-4 ring-emerald-300/80 animate-session-pulse-navy transition hover:bg-emerald-700 active:scale-[0.99]",
  salmon:
    "bg-[#FF8A8A] text-white shadow-[0_10px_36px_-8px_rgba(255,138,138,0.75)] ring-[#FF8A8A]/40 transition hover:brightness-105 active:brightness-95",
  "waiting-navy":
    "cursor-wait bg-[#001F3F] text-white opacity-95 shadow-[0_12px_40px_-10px_rgba(0,31,63,0.65)] ring-[#001F3F]/30 animate-session-pulse-navy",
  "waiting-salmon":
    "cursor-wait bg-[#FF8A8A] text-white shadow-[0_10px_36px_-8px_rgba(255,138,138,0.65)] ring-[#FF8A8A]/35 animate-session-pulse-salmon"
};

type Props = {
  label: string;
  variant: DoubleShakeCircleVariant;
  onClick?: () => void;
  busy?: boolean;
  /** When true, renders a non-interactive circle (timer / waiting states). */
  presentational?: boolean;
};

export function DoubleShakeCircleButton({
  label,
  variant,
  onClick,
  busy = false,
  presentational = false
}: Props) {
  const className = `${SESSION_CIRCLE_SHELL_CLASS} ${VARIANT_CLASS[variant]} flex flex-col items-center justify-center gap-1 px-2`;
  const labelEl = (
    <span className="max-w-[14rem] text-center text-sm font-bold leading-snug sm:text-base">{label}</span>
  );

  if (presentational || variant === "disabled") {
    return (
      <div style={SESSION_ACTION_CIRCLE_STYLE} className={className} role="status" aria-live="polite">
        {labelEl}
      </div>
    );
  }

  const isWaiting = variant === "waiting-navy" || variant === "waiting-salmon";

  return (
    <button
      type="button"
      style={SESSION_ACTION_CIRCLE_STYLE}
      className={className}
      disabled={busy || isWaiting}
      onClick={onClick}
    >
      {busy ? <Loader2 className="h-6 w-6 shrink-0 animate-spin" aria-hidden /> : null}
      {labelEl}
    </button>
  );
}

/** Shared outer panel for parent + sitter Double-Shake blocks. */
export function DoubleShakeShiftPanel({
  children,
  className = ""
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`mt-1 flex min-h-0 flex-1 flex-col items-center rounded-3xl border-2 border-[#001F3F]/20 bg-white p-4 shadow-[0_16px_48px_-12px_rgba(0,31,63,0.45)] sm:p-6 ${className}`}
    >
      {children}
    </section>
  );
}
