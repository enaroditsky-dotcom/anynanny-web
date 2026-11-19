import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { clearDeviceAuthHints } from "@/lib/auth/returning-user";
import { clearNewBookingMarker } from "@/lib/bookings/new-booking-reset";
import { setBroadcastMinimized } from "@/lib/broadcast/broadcast-minimize-preference";
import {
  unsubscribeCurrentPushSubscription,
  type PushReleaseResult
} from "@/lib/push/register-push";
import { clearParentDisplayIdCache } from "@/lib/public/sequential-display-id";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

/** Shown when this device's push row may still belong to the previous account. */
export const LOGOUT_PUSH_CLEANUP_FAILED_MESSAGE =
  "ייתכן שהמכשיר עדיין רשום להתראות של החשבון הקודם. לא ניתן להבטיח ניתוק התראות כשאין חיבור.";

/** Shown only when Supabase did not clear the local session. */
export const LOGOUT_SIGN_OUT_FAILED_MESSAGE =
  "לא הצלחנו לסיים את ההתנתקות. אתם עדיין מחוברים. נסו שוב.";

export const LOGOUT_PUSH_CLEANUP_QUERY = "pushCleanup";
export const LOGOUT_PUSH_CLEANUP_QUERY_VALUE = "failed";

export type LogoutResult =
  | { ok: true; pushCleanupFailed: boolean }
  | { ok: false; reason: "sign_out" };

export type LogoutSessionClient = {
  auth: {
    getUser: () => Promise<{ data: { user: { id?: string } | null } }>;
    signOut: (options?: {
      scope?: "local" | "global" | "others";
    }) => Promise<{ error: { message?: string } | null }>;
    getSession: () => Promise<{ data: { session: unknown }; error?: unknown }>;
  };
};

export type LogoutDependencies = {
  releasePush?: () => Promise<PushReleaseResult>;
  getClient?: () => LogoutSessionClient | null;
};

/**
 * Records a current-device push cleanup failure and lets the caller continue.
 * A failed cleanup is not proof the server row is gone, and it must not block
 * explicit logout, password reset, or account deletion.
 */
export function notePushCleanupResult(push: PushReleaseResult, context: string): boolean {
  if (push.ok) return false;
  console.warn(
    `[${context}] push cleanup failed. Continuing. This device may keep a stale server subscription until a later signed-in cleanup:`,
    push.reason,
    "endpoint" in push ? push.endpoint : ""
  );
  return true;
}

export function logoutRedirectPath(path: string, pushCleanupFailed: boolean): string {
  if (!pushCleanupFailed) return path;
  const hashIndex = path.indexOf("#");
  const hash = hashIndex >= 0 ? path.slice(hashIndex) : "";
  const withoutHash = hashIndex >= 0 ? path.slice(0, hashIndex) : path;
  const splitAt = withoutHash.indexOf("?");
  const pathname = splitAt >= 0 ? withoutHash.slice(0, splitAt) : withoutHash;
  const query = splitAt >= 0 ? withoutHash.slice(splitAt + 1) : "";
  const params = new URLSearchParams(query);
  params.set(LOGOUT_PUSH_CLEANUP_QUERY, LOGOUT_PUSH_CLEANUP_QUERY_VALUE);
  const qs = params.toString();
  return `${pathname}${qs ? `?${qs}` : ""}${hash}`;
}

/**
 * Confirms the browser session is gone. This read does not authorize any action.
 * Success is reported only when no local session remains.
 */
async function localSessionCleared(supabase: LogoutSessionClient): Promise<boolean> {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) return false;
    return !data.session;
  } catch {
    return false;
  }
}

/** Attempts current-device push cleanup, then signs out this browser only. Push failure does not block sign-out. */
export async function logoutAndRedirect(
  router: AppRouterInstance,
  redirectPath = "/login",
  deps?: LogoutDependencies
): Promise<LogoutResult> {
  const releasePush = deps?.releasePush ?? unsubscribeCurrentPushSubscription;
  const push = await releasePush();
  const pushCleanupFailed = notePushCleanupResult(push, "logout");

  const supabase = deps?.getClient ? deps.getClient() : (getSupabaseBrowserClient() as LogoutSessionClient | null);
  if (!supabase) {
    console.warn("[logout] sign-out failed: no auth client");
    return { ok: false, reason: "sign_out" };
  }

  let userId: string | undefined;
  try {
    const { data } = await supabase.auth.getUser();
    userId = data.user?.id;
  } catch {
    /* still sign out */
  }

  try {
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) {
      console.warn("[logout] signOut reported:", error.message ?? error);
    }
  } catch (signOutError) {
    console.warn("[logout] signOut threw:", signOutError);
  }

  if (!(await localSessionCleared(supabase))) {
    return { ok: false, reason: "sign_out" };
  }

  clearParentDisplayIdCache(userId);
  clearNewBookingMarker();
  clearDeviceAuthHints();
  // UI preference only — does not cancel or mutate an active broadcast.
  setBroadcastMinimized(false);
  router.replace(logoutRedirectPath(redirectPath, pushCleanupFailed));
  router.refresh();
  return { ok: true, pushCleanupFailed };
}
