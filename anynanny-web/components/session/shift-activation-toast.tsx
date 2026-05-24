"use client";

import { useEffect } from "react";

type Props = {
  visible: boolean;
  message: string;
};

function tryVibrate(pattern: number[]) {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(pattern);
    }
  } catch {
    /* haptics best-effort; ignore */
  }
}

function tryWebNotification(message: string) {
  try {
    if (typeof window === "undefined" || typeof Notification === "undefined") return;
    if (Notification.permission !== "granted") return;
    new Notification("AnyNanny", { body: message, tag: "shift-activated" });
  } catch {
    /* notifications best-effort; ignore */
  }
}

/**
 * Small banner shown above the Double-Shake circle the moment activation flips on.
 * Also triggers a soft vibration on mobile and (if previously granted) a Web Notification.
 */
export function ShiftActivationToast({ visible, message }: Props) {
  useEffect(() => {
    if (!visible) return;
    tryVibrate([120, 80, 120]);
    tryWebNotification(message);
  }, [visible, message]);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="assertive"
      className="mb-2 w-full max-w-[20rem] rounded-2xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-center text-xs font-semibold text-emerald-900 shadow-soft"
    >
      {message}
    </div>
  );
}
