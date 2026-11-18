"use client";

import type { User } from "@supabase/supabase-js";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createAuthRetryScheduler, type AuthRetryScheduler } from "@/lib/auth/auth-retry";
import { clearNewBookingMarker } from "@/lib/bookings/new-booking-reset";
import { resolveRoleForUser } from "@/lib/auth/supabase-profile";
import {
  resolveValidAuthUser,
  retainedUserAfterAuthResolution,
  type ValidAuthUserResult
} from "@/lib/auth/valid-session";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { readSupabaseErrorMessage } from "@/lib/supabase/postgrest-schema";
import { PROFILES_TABLE, type ProfileRole } from "@/lib/supabase/profiles";
import { isPostgrestMissingColumnError } from "@/lib/supabase/postgrest-schema";
import { sanitizeGreetingDisplayName } from "@/lib/user/greeting-display-name";

export type DashboardViewRole = "parent" | "sitter";

export type AuthUiState = {
  isLoading: boolean;
  signedIn: boolean;
  user: User | null;
  displayName: string | null;
  effectiveRole: ProfileRole | null;
  currentRole: DashboardViewRole;
  suspendedAt: string | null;
  /** True after automatic auth retries are used up and the check is still unavailable. */
  authRetryExhausted: boolean;
  refresh: () => Promise<void>;
  /** Manual retry. Restarts the bounded sequence. */
  retryAuthentication: () => Promise<void>;
};

const AuthContext = createContext<AuthUiState | undefined>(undefined);

type LoadedAuthState =
  | {
      kind: "ready";
      user: User;
      displayName: string | null;
      effectiveRole: ProfileRole | null;
      suspendedAt: string | null;
    }
  | { kind: "profile_unavailable"; user: User }
  | { kind: "unavailable"; resolved: ValidAuthUserResult }
  | { kind: "signed_out"; resolved: ValidAuthUserResult };

async function loadAuthState(): Promise<LoadedAuthState> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    return {
      kind: "signed_out",
      resolved: { ok: false, user: null, clearedStaleSession: false, reason: "no_client" }
    };
  }

  const resolved = await resolveValidAuthUser(supabase);
  if (!resolved.ok) {
    return resolved.reason === "unavailable"
      ? { kind: "unavailable", resolved }
      : { kind: "signed_out", resolved };
  }
  const user = resolved.user;

  try {
    const metaFirst = typeof user.user_metadata?.first_name === "string" ? user.user_metadata.first_name.trim() : "";
    const metaLast = typeof user.user_metadata?.last_name === "string" ? user.user_metadata.last_name.trim() : "";
    const metaName = `${metaFirst} ${metaLast}`.trim() || null;

    let profileQuery = await supabase
      .from(PROFILES_TABLE)
      .select("role, first_name, last_name, suspended_at")
      .eq("id", user.id)
      .maybeSingle();

    if (profileQuery.error && isPostgrestMissingColumnError(profileQuery.error.message, "suspended_at")) {
      profileQuery = await supabase
        .from(PROFILES_TABLE)
        .select("role, first_name, last_name")
        .eq("id", user.id)
        .maybeSingle();
    }

    const { data: profile } = profileQuery;
    const effectiveRole = await resolveRoleForUser(supabase, user);
    const displayName = sanitizeGreetingDisplayName(
      profile ? `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() : null,
      user.email
    ) ?? sanitizeGreetingDisplayName(metaName, user.email);

    return {
      kind: "ready",
      user,
      displayName,
      effectiveRole,
      suspendedAt:
        profile && typeof profile === "object" && "suspended_at" in profile
          ? String((profile as { suspended_at?: string | null }).suspended_at ?? "") || null
          : null
    };
  } catch (error) {
    console.warn("[auth] profile lookup failed:", readSupabaseErrorMessage(error));
    return { kind: "profile_unavailable", user };
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [effectiveRole, setEffectiveRole] = useState<ProfileRole | null>(null);
  const [suspendedAt, setSuspendedAt] = useState<string | null>(null);
  const [authRetryExhausted, setAuthRetryExhausted] = useState(false);
  const userRef = useRef<User | null>(null);
  const requestGenRef = useRef(0);
  const refreshRef = useRef<() => Promise<void>>(async () => {});
  const schedulerRef = useRef<AuthRetryScheduler | null>(null);

  if (schedulerRef.current == null) {
    schedulerRef.current = createAuthRetryScheduler({
      setTimer: (delayMs, fn) => window.setTimeout(fn, delayMs),
      clearTimer: (id) => window.clearTimeout(id),
      onRetry: () => {
        void refreshRef.current();
      },
      onExhausted: () => setAuthRetryExhausted(true)
    });
  }

  const markSettled = useCallback(() => {
    schedulerRef.current?.noteSettled();
    setAuthRetryExhausted(false);
  }, []);

  const refresh = useCallback(async () => {
    const generation = ++requestGenRef.current;
    try {
      const next = await loadAuthState();
      if (generation !== requestGenRef.current) return;

      if (next.kind === "unavailable") {
        const retained = retainedUserAfterAuthResolution(userRef.current, next.resolved);
        userRef.current = retained;
        schedulerRef.current?.noteUnavailable();
        return;
      }

      if (next.kind === "profile_unavailable") {
        userRef.current = next.user;
        setUser(next.user);
        setIsLoading(false);
        schedulerRef.current?.noteUnavailable();
        return;
      }

      markSettled();

      if (next.kind === "signed_out") {
        const retained = retainedUserAfterAuthResolution(userRef.current, next.resolved);
        userRef.current = retained;
        setUser(retained);
        setDisplayName(null);
        setEffectiveRole(null);
        setSuspendedAt(null);
        setIsLoading(false);
        return;
      }

      userRef.current = next.user;
      setUser(next.user);
      setDisplayName(next.displayName);
      setEffectiveRole(next.effectiveRole);
      setSuspendedAt(next.suspendedAt);
      setIsLoading(false);
    } catch (error) {
      if (generation !== requestGenRef.current) return;
      console.warn("[auth] refresh failed:", readSupabaseErrorMessage(error));
      const retained = retainedUserAfterAuthResolution(userRef.current, {
        ok: false,
        user: null,
        clearedStaleSession: false,
        reason: "unavailable"
      });
      userRef.current = retained;
      schedulerRef.current?.noteUnavailable();
    }
  }, [markSettled]);

  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    setIsLoading(true);
    void refresh();
  }, [refresh]);

  useEffect(() => {
    void refresh();
  }, [pathname, refresh]);

  const retryAuthentication = useCallback(async () => {
    schedulerRef.current?.retryNow();
    setAuthRetryExhausted(false);
    await refreshRef.current();
  }, []);

  useEffect(() => {
    const onOnline = () => {
      schedulerRef.current?.retryNow();
      setAuthRetryExhausted(false);
      void refresh();
    };
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("online", onOnline);
    };
  }, [refresh]);

  useEffect(() => {
    const scheduler = schedulerRef.current;
    return () => scheduler?.dispose();
  }, []);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_OUT") return;
      requestGenRef.current += 1;
      userRef.current = null;
      schedulerRef.current?.noteSettled();
      clearNewBookingMarker();
      setUser(null);
      setDisplayName(null);
      setEffectiveRole(null);
      setSuspendedAt(null);
      setAuthRetryExhausted(false);
      setIsLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  const value = useMemo(
    (): AuthUiState => ({
      isLoading,
      signedIn: !!user,
      user,
      displayName,
      effectiveRole,
      suspendedAt,
      currentRole: (pathname.startsWith("/sitter") || pathname.startsWith("/session")) ? "sitter" : "parent",
      authRetryExhausted,
      refresh,
      retryAuthentication
    }),
    [isLoading, user, displayName, effectiveRole, suspendedAt, pathname, authRetryExhausted, refresh, retryAuthentication]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthUiState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}