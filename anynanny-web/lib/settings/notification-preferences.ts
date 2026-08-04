export type NotificationPreferences = {
  pushEnabled: boolean;
  soundEnabled: boolean;
};

export const NOTIFICATION_PREFERENCES_STORAGE_KEY = "anynanny_notification_preferences";

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  pushEnabled: true,
  soundEnabled: true
};

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

export function readNotificationPreferences(): NotificationPreferences {
  if (typeof window === "undefined") return { ...DEFAULT_NOTIFICATION_PREFERENCES };

  try {
    const raw = localStorage.getItem(NOTIFICATION_PREFERENCES_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_NOTIFICATION_PREFERENCES };

    const parsed = JSON.parse(raw) as Partial<NotificationPreferences>;
    return {
      pushEnabled: isBoolean(parsed.pushEnabled)
        ? parsed.pushEnabled
        : DEFAULT_NOTIFICATION_PREFERENCES.pushEnabled,
      soundEnabled: isBoolean(parsed.soundEnabled)
        ? parsed.soundEnabled
        : DEFAULT_NOTIFICATION_PREFERENCES.soundEnabled
    };
  } catch {
    return { ...DEFAULT_NOTIFICATION_PREFERENCES };
  }
}

export function writeNotificationPreferences(next: NotificationPreferences): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(NOTIFICATION_PREFERENCES_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota / private mode */
  }
}

export function updateNotificationPreferences(
  patch: Partial<NotificationPreferences>
): NotificationPreferences {
  const next = {
    ...readNotificationPreferences(),
    ...patch
  };
  writeNotificationPreferences(next);
  return next;
}

export function arePushNotificationsEnabled(): boolean {
  return readNotificationPreferences().pushEnabled;
}

export function areSoundAlertsEnabled(): boolean {
  return readNotificationPreferences().soundEnabled;
}

/** Ask the browser for notification permission when the user turns push on. */
export async function requestPushNotificationPermission(): Promise<NotificationPermission | "unsupported"> {
  if (typeof window === "undefined" || typeof Notification === "undefined") {
    return "unsupported";
  }

  if (Notification.permission === "granted" || Notification.permission === "denied") {
    return Notification.permission;
  }

  try {
    return await Notification.requestPermission();
  } catch {
    return "denied";
  }
}
