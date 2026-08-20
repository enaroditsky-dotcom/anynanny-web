import type { NotificationPreferences } from "@/lib/settings/notification-preferences";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  readNotificationPreferences,
  writeNotificationPreferences
} from "@/lib/settings/notification-preferences";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { isPostgrestMissingColumnError, readSupabaseErrorMessage } from "@/lib/supabase/postgrest-schema";
import { PROFILES_TABLE } from "@/lib/supabase/profiles";

export async function loadNotificationPreferencesForUser(
  userId: string
): Promise<NotificationPreferences> {
  const cached = readNotificationPreferences();
  const supabase = getSupabaseBrowserClient();
  const uid = userId.trim();
  if (!supabase || !uid) return cached;

  const { data, error } = await supabase
    .from(PROFILES_TABLE)
    .select("push_enabled, sound_enabled")
    .eq("id", uid)
    .maybeSingle();

  if (error) {
    const message = readSupabaseErrorMessage(error);
    if (
      !isPostgrestMissingColumnError(message, "push_enabled") &&
      !isPostgrestMissingColumnError(message, "sound_enabled")
    ) {
      console.warn("[push-prefs] load:", message);
    }
    return cached;
  }

  const next: NotificationPreferences = {
    pushEnabled:
      typeof data?.push_enabled === "boolean"
        ? data.push_enabled
        : DEFAULT_NOTIFICATION_PREFERENCES.pushEnabled,
    soundEnabled:
      typeof data?.sound_enabled === "boolean"
        ? data.sound_enabled
        : DEFAULT_NOTIFICATION_PREFERENCES.soundEnabled
  };
  writeNotificationPreferences(next);
  return next;
}

export async function saveNotificationPreferencesForUser(
  userId: string,
  patch: Partial<NotificationPreferences>
): Promise<NotificationPreferences> {
  const current = readNotificationPreferences();
  const next: NotificationPreferences = {
    pushEnabled: patch.pushEnabled ?? current.pushEnabled,
    soundEnabled: patch.soundEnabled ?? current.soundEnabled
  };
  writeNotificationPreferences(next);

  const supabase = getSupabaseBrowserClient();
  const uid = userId.trim();
  if (!supabase || !uid) return next;

  const dbPatch: { push_enabled?: boolean; sound_enabled?: boolean } = {};
  if (typeof patch.pushEnabled === "boolean") dbPatch.push_enabled = patch.pushEnabled;
  if (typeof patch.soundEnabled === "boolean") dbPatch.sound_enabled = patch.soundEnabled;
  if (Object.keys(dbPatch).length === 0) return next;

  const { error } = await supabase.from(PROFILES_TABLE).update(dbPatch).eq("id", uid);
  if (error) {
    const message = readSupabaseErrorMessage(error);
    if (
      !isPostgrestMissingColumnError(message, "push_enabled") &&
      !isPostgrestMissingColumnError(message, "sound_enabled")
    ) {
      console.warn("[push-prefs] save:", message);
    }
  }
  return next;
}
