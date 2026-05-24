"use client";

import { useEffect } from "react";

type ActionToastVariant = "success" | "error" | "info";

const VARIANT_CLASS: Record<ActionToastVariant, string> = {
  success: "bg-emerald-800 text-white shadow-emerald-900/25",
  error: "bg-rose-800 text-white shadow-rose-900/25",
  info: "bg-[#001F3F] text-white shadow-[#001F3F]/30"
};

type Props = {
  message: string | null;
  variant?: ActionToastVariant;
  /** Auto-hide after ms (default 4500). Set 0 to disable. */
  durationMs?: number;
  onDismiss?: () => void;
};

export function ActionToast({
  message,
  variant = "success",
  durationMs = 4500,
  onDismiss
}: Props) {
  useEffect(() => {
    if (!message || durationMs <= 0) return;
    const id = window.setTimeout(() => onDismiss?.(), durationMs);
    return () => window.clearTimeout(id);
  }, [message, durationMs, onDismiss]);

  if (!message) return null;

  return (
    <div
      role="status"
      aria-live="assertive"
      className={`pointer-events-none fixed bottom-6 left-1/2 z-[100] max-w-[min(92vw,22rem)] -translate-x-1/2 rounded-2xl px-5 py-3 text-center text-sm font-semibold shadow-lg ${VARIANT_CLASS[variant]}`}
    >
      {message}
    </div>
  );
}
