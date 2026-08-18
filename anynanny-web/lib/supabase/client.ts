"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { markPasswordRecoveryEvent } from "@/lib/auth/password-recovery-state";
import {
  forwardToResetPasswordNow,
  isPasswordRecoveryDestinationPath
} from "@/lib/auth/password-reset";

let browserClient: SupabaseClient | null = null;
let authListenerBound = false;

export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

/**
 * Cookie-backed browser client via `@supabase/ssr`.
 * Uses default cookie encoding (`base64url`) so session cookies match the
 * server/middleware clients — do not JSON.parse those cookie strings manually;
 * use `safeParseSupabaseCookieJson` from `@/lib/supabase/cookie-value` if needed.
 *
 * Also keeps Realtime JWT in sync on token refresh so postgres_changes channels
 * do not drop with CHANNEL_ERROR / WebSocket 1006 after session rotation.
 */
export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (browserClient) return browserClient;

  browserClient = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      realtime: {
        params: {
          eventsPerSecond: 10
        }
      }
    }
  );

  if (!authListenerBound) {
    authListenerBound = true;
    browserClient.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        markPasswordRecoveryEvent();
        if (typeof window !== "undefined" && !isPasswordRecoveryDestinationPath(window.location.pathname)) {
          forwardToResetPasswordNow();
        }
      }
      const token = session?.access_token;
      if (!token) return;
      // TOKEN_REFRESHED / SIGNED_IN — push JWT to the Realtime socket.
      if (event === "TOKEN_REFRESHED" || event === "SIGNED_IN" || event === "INITIAL_SESSION") {
        try {
          browserClient?.realtime.setAuth(token);
        } catch (err) {
          console.warn("[supabase] realtime.setAuth failed:", err);
        }
      }
    });
  }

  return browserClient;
}

export async function reloadPostgrestSchema(client: SupabaseClient): Promise<boolean> {
  try {
    const { isRpcKnownMissing, isMissingRpcError, markRpcMissing } = await import(
      "@/lib/supabase/rpc-availability"
    );
    if (isRpcKnownMissing("reload_schema")) return false;
    const { error } = await client.rpc("reload_schema");
    if (error && isMissingRpcError(error)) {
      markRpcMissing("reload_schema");
      return false;
    }
    return !error;
  } catch {
    return false;
  }
}
