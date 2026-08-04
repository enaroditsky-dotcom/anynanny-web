"use client";

import { BellRing, Volume2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  RetroToggle,
  SettingsRowGroup,
  SettingsSubRow
} from "@/components/settings/mobile-settings-ui";
import {
  readNotificationPreferences,
  requestPushNotificationPermission,
  updateNotificationPreferences,
  type NotificationPreferences
} from "@/lib/settings/notification-preferences";

export function NotificationSettingsSection() {
  const [prefs, setPrefs] = useState<NotificationPreferences>({
    pushEnabled: true,
    soundEnabled: true
  });
  const [hydrated, setHydrated] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    setPrefs(readNotificationPreferences());
    setHydrated(true);
  }, []);

  const handlePushChange = useCallback(async (next: boolean) => {
    setHint(null);
    setPrefs((prev) => ({ ...prev, pushEnabled: next }));
    updateNotificationPreferences({ pushEnabled: next });

    if (!next) return;

    const permission = await requestPushNotificationPermission();
    if (permission === "denied") {
      setHint("הדפדפן חוסם התראות דחיפה. אפשר לשנות זאת בהגדרות המכשיר.");
    } else if (permission === "unsupported") {
      setHint("התראות דחיפה אינן נתמכות בדפדפן זה.");
    }
  }, []);

  const handleSoundChange = useCallback((next: boolean) => {
    setHint(null);
    setPrefs((prev) => ({ ...prev, soundEnabled: next }));
    updateNotificationPreferences({ soundEnabled: next });
  }, []);

  return (
    <section className="space-y-2.5" aria-labelledby="notification-settings-title">
      <div className="px-1 text-right">
        <h2 id="notification-settings-title" className="text-sm font-bold text-[#001F3F]">
          הגדרות התראות
        </h2>
        <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
          בחרו אילו התראות תרצו לקבל בזמן משמרת ובהודעות חדשות
        </p>
      </div>

      <SettingsRowGroup>
        <SettingsSubRow
          label="התראות דחיפה"
          hint="קבלת התראות על משמרות, הודעות ועדכונים חשובים"
          trailing={
            <span className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-sky-200 bg-sky-50 text-sky-700">
                <BellRing className="h-4 w-4" strokeWidth={2} aria-hidden />
              </span>
              <RetroToggle
                checked={prefs.pushEnabled}
                onChange={(next) => void handlePushChange(next)}
                label="התראות דחיפה"
                disabled={!hydrated}
              />
            </span>
          }
        />

        <SettingsSubRow
          label="התראות קוליות"
          hint="צליל קצר כשמגיעה התראה חדשה באפליקציה"
          trailing={
            <span className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700">
                <Volume2 className="h-4 w-4" strokeWidth={2} aria-hidden />
              </span>
              <RetroToggle
                checked={prefs.soundEnabled}
                onChange={handleSoundChange}
                label="התראות קוליות"
                disabled={!hydrated}
              />
            </span>
          }
        />
      </SettingsRowGroup>

      {hint ? (
        <p className="px-1 text-right text-[11px] leading-relaxed text-amber-700">{hint}</p>
      ) : null}
    </section>
  );
}
