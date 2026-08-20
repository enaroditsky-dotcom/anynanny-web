"use client";

import { BellRing, Volume2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import {
  RetroToggle,
  SettingsModalSheet,
  SettingsRowGroup,
  SettingsSubRow
} from "@/components/settings/mobile-settings-ui";
import {
  currentNotificationPermission,
  pushSettingsStatusCopy,
  readBrowserPushCapability,
  resolveEffectivePush
} from "@/lib/push/capability";
import { PUSH_NOTIFICATION_KIND_LIST } from "@/lib/push/kind-list";
import { loadNotificationPreferencesForUser, saveNotificationPreferencesForUser } from "@/lib/push/preferences";
import {
  enablePushFromUserGesture,
  getExistingPushSubscription,
  unsubscribeCurrentPushSubscription
} from "@/lib/push/register-push";
import {
  readNotificationPreferences,
  type NotificationPreferences
} from "@/lib/settings/notification-preferences";

export function NotificationSettingsSection() {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<NotificationPreferences>(readNotificationPreferences());
  const [hydrated, setHydrated] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [kindsOpen, setKindsOpen] = useState(false);
  const [hasSubscription, setHasSubscription] = useState(false);
  const [permission, setPermission] = useState(currentNotificationPermission());

  const refreshDevice = useCallback(async () => {
    const sub = await getExistingPushSubscription();
    setHasSubscription(Boolean(sub));
    setPermission(currentNotificationPermission());
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const next = user?.id
        ? await loadNotificationPreferencesForUser(user.id)
        : readNotificationPreferences();
      if (cancelled) return;
      setPrefs(next);
      await refreshDevice();
      if (!cancelled) setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, refreshDevice]);

  const capability = readBrowserPushCapability();
  const effective = resolveEffectivePush({
    pushEnabled: prefs.pushEnabled,
    permission,
    hasSubscription,
    capable: capability.canSubscribe
  });
  const statusCopy =
    hint ??
    pushSettingsStatusCopy(effective, capability.iosRequiresStandalone);

  const handlePushChange = useCallback(
    async (next: boolean) => {
      setHint(null);
      setPrefs((prev) => ({ ...prev, pushEnabled: next }));
      if (user?.id) {
        await saveNotificationPreferencesForUser(user.id, { pushEnabled: next });
      }

      if (!next) {
        await unsubscribeCurrentPushSubscription();
        await refreshDevice();
        return;
      }

      if (capability.iosRequiresStandalone) {
        setHint(
          "כדי לקבל התראות באייפון, הוסיפו את AnyNanny למסך הבית דרך שיתוף → הוספה למסך הבית."
        );
        await refreshDevice();
        return;
      }

      const result = await enablePushFromUserGesture();
      await refreshDevice();
      if (result.ok) return;
      if (result.reason === "denied" || result.permission === "denied") {
        setHint("ההתראות חסומות בהגדרות המכשיר");
      } else if (result.reason === "unsupported" || result.permission === "unsupported") {
        setHint("התראות דחיפה אינן נתמכות בדפדפן זה.");
      } else if (result.reason === "ios-not-standalone") {
        setHint(
          "כדי לקבל התראות באייפון, הוסיפו את AnyNanny למסך הבית דרך שיתוף → הוספה למסך הבית."
        );
      } else if (result.reason === "missing-vapid" || result.reason === "invalid-vapid") {
        setHint("התראות דחיפה עדיין לא הוגדרו בשרת.");
      }
    },
    [user?.id, capability.iosRequiresStandalone, refreshDevice]
  );

  const handleSoundChange = useCallback(
    async (next: boolean) => {
      setHint(null);
      setPrefs((prev) => ({ ...prev, soundEnabled: next }));
      if (user?.id) {
        await saveNotificationPreferencesForUser(user.id, { soundEnabled: next });
      }
    },
    [user?.id]
  );

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
          hint="העדפה לקבלת התראות מערכת כאשר AnyNanny סגורה. פעיל רק אחרי אישור במכשיר."
          trailing={
            <span className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-sky-200 bg-sky-50 text-sky-700">
                <BellRing className="h-4 w-4" strokeWidth={2} aria-hidden />
              </span>
              <span className="flex items-center gap-1.5">
                <span
                  dir="ltr"
                  aria-hidden
                  className={`min-w-[2.25rem] text-center text-[11px] font-bold tracking-wide ${
                    prefs.pushEnabled ? "text-[#001F3F]" : "text-slate-400"
                  }`}
                >
                  {prefs.pushEnabled ? "ON" : "OFF"}
                </span>
                <RetroToggle
                  checked={prefs.pushEnabled}
                  onChange={(next) => void handlePushChange(next)}
                  label="התראות דחיפה"
                  disabled={!hydrated}
                />
              </span>
            </span>
          }
        />

        <SettingsSubRow
          label="אילו התראות אקבל?"
          hint="רשימת עדכונים שניתן לקבל כהתראת מערכת"
          onClick={() => setKindsOpen(true)}
        />

        <SettingsSubRow
          label="התראות קוליות"
          hint="שולט בצלילים וברטט בתוך האפליקציה בזמן ש-AnyNanny פתוחה. לא שולט בצליל התראת המערכת במסך הנעילה."
          trailing={
            <span className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700">
                <Volume2 className="h-4 w-4" strokeWidth={2} aria-hidden />
              </span>
              <RetroToggle
                checked={prefs.soundEnabled}
                onChange={(next) => void handleSoundChange(next)}
                label="התראות קוליות"
                disabled={!hydrated}
              />
            </span>
          }
        />
      </SettingsRowGroup>

      {hydrated && statusCopy ? (
        <p className="px-1 text-right text-[13px] leading-relaxed text-amber-700">{statusCopy}</p>
      ) : hydrated && effective.active ? (
        <p className="px-1 text-right text-[13px] leading-relaxed text-emerald-700">
          התראות המערכת פעילות במכשיר זה
        </p>
      ) : null}

      <SettingsModalSheet
        open={kindsOpen}
        title="אילו התראות אקבל?"
        onClose={() => setKindsOpen(false)}
      >
        <ul className="space-y-2 text-right text-sm text-[#001F3F]">
          {PUSH_NOTIFICATION_KIND_LIST.map((item) => (
            <li key={item} className="rounded-xl bg-slate-50 px-3 py-2">
              {item}
            </li>
          ))}
        </ul>
      </SettingsModalSheet>
    </section>
  );
}
