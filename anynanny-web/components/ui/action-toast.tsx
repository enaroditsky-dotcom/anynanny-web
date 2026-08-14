"use client";

import { useEffect, useRef, type ReactNode } from "react";

type ActionToastVariant = "success" | "error" | "info";

const VARIANT_CLASS: Record<ActionToastVariant, string> = {
  success: "bg-emerald-800 text-white shadow-emerald-900/25",
  error: "bg-rose-800 text-white shadow-rose-900/25",
  info: "bg-[#001F3F] text-white shadow-[#001F3F]/30"
};

type Props = {
  message?: string | null;
  children?: ReactNode;
  /** Stable identity for auto-dismiss. Defaults to `message`. */
  contentKey?: string | null;
  variant?: ActionToastVariant;
  /** Auto-hide after ms (default 4500). Set 0 to disable. */
  durationMs?: number;
  onDismiss?: () => void;
  className?: string;
};

export function ActionToast({
  message = null,
  children,
  contentKey = null,
  variant = "success",
  durationMs = 4500,
  onDismiss,
  className = ""
}: Props) {
  const content = children ?? message;
  const visibilityKey = contentKey ?? message;
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    if (!content || durationMs <= 0) return;
    const id = window.setTimeout(() => onDismissRef.current?.(), durationMs);
    return () => window.clearTimeout(id);
  }, [visibilityKey, durationMs, Boolean(content)]);

  if (!content) return null;

  return (
    <div
      role="status"
      aria-live="assertive"
      className={`pointer-events-none fixed bottom-6 left-1/2 z-[100] max-w-[min(92vw,22rem)] -translate-x-1/2 rounded-2xl shadow-lg ${
        children
          ? "px-3 py-2.5 text-right"
          : "px-5 py-3 text-center text-sm font-semibold"
      } ${VARIANT_CLASS[variant]} ${className}`}
    >
      {children ?? message}
    </div>
  );
}
