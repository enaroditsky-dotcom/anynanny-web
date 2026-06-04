"use client";

import { useEffect } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { readSupabaseErrorMessage } from "@/lib/supabase/postgrest-schema";

/**
 * Best-effort session + auth listener bootstrap for the shell.
 * Failures are logged and swallowed so header/layout never remount from thrown promises.
 */
export function AppShellSessionHydration() {
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    let cancelled = false;
    let authSubscription: { unsubscribe: () => void } | null = null;

    void (async () => {
      try {
        await supabase.auth.getSession();
      } catch (error) {
        console.warn("[app-shell] session hydrate failed:", readSupabaseErrorMessage(error));
      }
    })();

    try {
      const {
        data: { subscription }
      } = supabase.auth.onAuthStateChange(() => {
        /* AuthProvider owns UI state; this listener only keeps the client channel warm. */
      });
      if (!cancelled) authSubscription = subscription;
    } catch (error) {
      console.warn("[app-shell] auth realtime subscription failed:", readSupabaseErrorMessage(error));
    }

    return () => {
      cancelled = true;
      try {
        authSubscription?.unsubscribe();
      } catch {
        /* ignore */
      }
    };
  }, []);

  return null;
}
