"use client";

import type { CSSProperties, ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { ShiftActivationToast } from "@/components/session/shift-activation-toast";
import { SESSION_ACTION_CIRCLE_STYLE, SESSION_CIRCLE_SHELL_CLASS } from "@/lib/session/session-circle";
import {
  isShiftLocallyDismissed,
  SHIFT_COMPLETED_CIRCLE_LABEL
} from "@/lib/session/dismissed-shift-lock";

/** Shown on the disabled circle whenever there is no live ongoing shift. */
export const DOUBLE_SHAKE_NO_SHIFT_TODAY_LABEL = "אין משמרת פעילה";
export const DOUBLE_SHAKE_NO_ACTIVE_SHIFT_LABEL = DOUBLE_SHAKE_NO_SHIFT_TODAY_LABEL;

/** Shared activation-window copy when shift preview or live window bypasses pending gates. */
export const DOUBLE_SHAKE_UPCOMING_SHIFT_LABEL = "המשמרת תיכף תתחיל.";
export const DOUBLE_SHAKE_UPCOMING_PARENT_SUBLABEL = "לחץ להתחיל";

export type DoubleShakeCircleVariant =
  | "disabled"
  | "loading"
  | "navy"
  | "emerald"
  | "approve"
  | "salmon"
  | "waiting-navy"
  | "waiting-salmon";

const VARIANT_CLASS: Record<DoubleShakeCircleVariant, string> = {
  disabled:
    "pointer-events-none cursor-default bg-slate-400 text-white opacity-55 shadow-none ring-slate-300/50",
  loading:
    "pointer-events-none cursor-wait bg-[#001F3F]/70 text-white opacity-90 shadow-[0_12px_40px_-10px_rgba(0,31,63,0.45)] ring-[#001F3F]/20 animate-session-pulse-navy",
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
  /** Optional second line (e.g. parent upcoming call-to-action). */
  subLabel?: string;
  variant: DoubleShakeCircleVariant;
  onClick?: () => void;
  busy?: boolean;
  /** When true, renders a non-interactive circle (timer / waiting states). */
  presentational?: boolean;
};

export function DoubleShakeCircleButton({
  label,
  subLabel,
  variant,
  onClick,
  busy = false,
  presentational = false
}: Props) {
  const hasSubLabel = Boolean(subLabel?.trim());
  const className = `${SESSION_CIRCLE_SHELL_CLASS}${
    hasSubLabel ? " overflow-visible" : ""
  } ${VARIANT_CLASS[variant]} flex flex-col items-center justify-center gap-1.5 px-2`;
  const circleStyle: CSSProperties = hasSubLabel
    ? { ...SESSION_ACTION_CIRCLE_STYLE, padding: "1.35rem", overflow: "visible" }
    : SESSION_ACTION_CIRCLE_STYLE;

  const labelEl = (
    <div className="flex w-full flex-col items-center justify-center gap-1 text-center">
      <span className="max-w-[12rem] text-sm font-bold leading-snug sm:text-base">{label}</span>
      {hasSubLabel ? (
        <span className="max-w-[12rem] text-xs font-semibold leading-snug text-white/95 sm:text-sm">
          {subLabel}
        </span>
      ) : null}
    </div>
  );

  if (presentational || variant === "disabled" || variant === "loading") {
    return (
      <div style={circleStyle} className={className} role="status" aria-live="polite">
        {variant === "loading" ? (
          <Loader2 className="mb-1 h-6 w-6 shrink-0 animate-spin" aria-hidden />
        ) : null}
        {labelEl}
      </div>
    );
  }

  const isWaiting = variant === "waiting-navy" || variant === "waiting-salmon";

  return (
    <button
      type="button"
      style={circleStyle}
      className={className}
      disabled={busy || isWaiting}
      onClick={onClick}
    >
      {busy ? <Loader2 className="h-6 w-6 shrink-0 animate-spin" aria-hidden /> : null}
      {labelEl}
    </button>
  );
}

/** Non-interactive disabled or loading circle shell. */
export function DoubleShakeDisabledCircleState({
  label,
  variant = "disabled"
}: {
  label: string;
  variant?: "disabled" | "loading";
}) {
  return (
    <DoubleShakeCircleButton
      label={label}
      variant={variant}
      presentational
    />
  );
}

type ParentActivationCircleProps = {
  justActivated: boolean;
  onStartShift: () => void;
  isUpcoming?: boolean;
  active?: boolean;
  busy?: boolean;
  bookingId?: string;
};

function DoubleShakeParentActivationCircleInner({
  justActivated,
  onStartShift,
  wakeUpToast = "המשמרת מתחילה — אפשר להתחיל את המשמרת",
  isUpcoming = true,
  active = true,
  busy = false
}: ParentActivationCircleProps & { wakeUpToast?: string }) {
  const showParentSubLabel = isUpcoming || active;

  return (
    <div className="flex w-full flex-col items-center gap-2">
      <ShiftActivationToast visible={justActivated} message={wakeUpToast} />
      <DoubleShakeCircleButton
        label={DOUBLE_SHAKE_UPCOMING_SHIFT_LABEL}
        subLabel={showParentSubLabel ? DOUBLE_SHAKE_UPCOMING_PARENT_SUBLABEL : undefined}
        variant="navy"
        busy={busy}
        onClick={onStartShift}
      />
    </div>
  );
}

/** Active navy parent circle — always interactive during the shift activation window. */
export function DoubleShakeParentActivationCircle({
  bookingId,
  ...props
}: ParentActivationCircleProps & { wakeUpToast?: string }) {
  if (isShiftLocallyDismissed(bookingId)) {
    return (
      <DoubleShakeDisabledCircleState label={SHIFT_COMPLETED_CIRCLE_LABEL} variant="disabled" />
    );
  }

  return <DoubleShakeParentActivationCircleInner {...props} />;
}

/** Clock window from useShiftActivationStatus — booking status must not override this. */
export function isDoubleShakeShiftTimeWindowActive(active: boolean, isUpcoming: boolean): boolean {
  return active || isUpcoming;
}

/** Centers the primary circle inside {@link DoubleShakeShiftPanel}. */
export function DoubleShakeCircleSlot({ children }: { children: ReactNode }) {
  return (
    <div className="mt-auto flex w-full flex-1 flex-col items-center justify-center gap-4 px-2 pt-8">
      {children}
    </div>
  );
}

/** Shared outer panel for parent + sitter Double-Shake blocks. */
export function DoubleShakeShiftPanel({
  children,
  className = ""
}: {
  children: ReactNode;
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
