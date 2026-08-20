"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import {
  PUSH_PROMPT_DISMISS_MS,
  PUSH_PROMPT_DISMISS_STORAGE_KEY
} from "@/lib/push/constants";
import {
  currentNotificationPermission,
  readBrowserPushCapability
} from "@/lib/push/capability";
import { readNotificationPreferences } from "@/lib/settings/notification-preferences";
import { loadNotificationPreferencesForUser } from "@/lib/push/preferences";
import {
  enablePushFromUserGesture,
  getExistingPushSubscription
} from "@/lib/push/register-push";

function isDashboardPath(pathname: string): boolean {
  return pathname === "/parent/dashboard" || pathname === "/sitter/dashboard";
}

function readDismissedUntil(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = window.localStorage.getItem(PUSH_PROMPT_DISMISS_STORAGE_KEY);
    const value = raw ? Number(raw) : 0;
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

function writeDismissedUntil(until: number): void {
  try {
    window.localStorage.setItem(PUSH_PROMPT_DISMISS_STORAGE_KEY, String(until));
  } catch {
    /* ignore */
  }
}

export function PushPermissionBanner() {
  const pathname = usePathname();
  const { signedIn, user, isLoading } = useAuth();
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [iosInstall, setIosInstall] = useState(false);

  const evaluate = useCallback(async () => {
    if (isLoading || !signedIn || !user?.id || !isDashboardPath(pathname)) {
      setVisible(false);
      setIosInstall(false);
      return;
    }
    const capability = readBrowserPushCapability();
    const prefs = await loadNotificationPreferencesForUser(user.id);
    const pushEnabled = prefs.pushEnabled ?? readNotificationPreferences().pushEnabled;
    if (!pushEnabled) {
      setVisible(false);
      setIosInstall(false);
      return;
    }

    if (capability.iosRequiresStandalone) {
      setIosInstall(true);
      setVisible(readDismissedUntil() <= Date.now());
      return;
    }

    setIosInstall(false);
    if (!capability.canSubscribe) {
      setVisible(false);
      return;
    }
    if (currentNotificationPermission() !== "default") {
      setVisible(false);
      return;
    }
    const existing = await getExistingPushSubscription();
    if (existing) {
      setVisible(false);
      return;
    }
    setVisible(readDismissedUntil() <= Date.now());
  }, [isLoading, signedIn, user?.id, pathname]);

  useEffect(() => {
    void evaluate();
  }, [evaluate]);

  const onEnable = useCallback(async () => {
    setBusy(true);
    try {
      await enablePushFromUserGesture();
      setVisible(false);
    } finally {
      setBusy(false);
    }
  }, []);

  const onLater = useCallback(() => {
    writeDismissedUntil(Date.now() + PUSH_PROMPT_DISMISS_MS);
    setVisible(false);
  }, []);

  const copy = useMemo(() => {
    if (iosInstall) {
      return {
        title: "🔔 התראות באייפון",
        body: "כדי לקבל התראות באייפון, הוסיפו את AnyNanny למסך הבית דרך שיתוף → הוספה למסך הבית."
      };
    }
    return {
      title: "🔔 אל תפספסו עדכונים חשובים",
      body: "קבלו התראה גם כאשר AnyNanny סגורה על: פניות חדשות, הודעות, AnyNanny Now, אישורי משמרת, ביטולים, תשלומים ודירוגים."
    };
  }, [iosInstall]);

  if (!visible) return null;

  return (
    <div
      className="pointer-events-auto mx-auto mb-3 w-full max-w-md rounded-2xl border border-[#001F3F]/15 bg-white p-4 text-right shadow-[0_8px_24px_-12px_rgba(0,31,63,0.35)]"
      role="dialog"
      aria-labelledby="push-permission-title"
      dir="rtl"
    >
      <p id="push-permission-title" className="text-sm font-bold text-[#001F3F]">
        {copy.title}
      </p>
      <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{copy.body}</p>
      <div className="mt-3 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onLater}
          className="rounded-xl px-3 py-2 text-xs font-semibold text-slate-500"
        >
          לא עכשיו
        </button>
        {iosInstall ? null : (
          <button
            type="button"
            disabled={busy}
            onClick={() => void onEnable()}
            className="rounded-xl bg-[#001F3F] px-3 py-2 text-xs font-bold text-white disabled:opacity-60"
          >
            {busy ? "מפעילים…" : "הפעלת התראות"}
          </button>
        )}
      </div>
    </div>
  );
}
