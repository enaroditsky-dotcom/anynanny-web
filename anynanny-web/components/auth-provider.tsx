"use client";

import type { User } from "@supabase/supabase-js";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { resetRedirectDedupe } from "@/lib/auth/redirect-after-sign-in";
import { resolveRoleForUser } from "@/lib/auth/supabase-profile";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { readSupabaseErrorMessage } from "@/lib/supabase/postgrest-schema";
import { isProfileRole, PROFILES_TABLE, type ProfileRole } from "@/lib/supabase/profiles";

export type DashboardViewRole = "parent" | "sitter";

export type AuthUiState = {
  isLoading: boolean;
  signedIn: boolean;
  user: User | null;
  displayName: string | null;
  effectiveRole: ProfileRole | null;
  /** Which dashboard shell the user is viewing (from URL); drives header toggle without profile writes. */
  currentRole: DashboardViewRole;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthUiState | undefined>(undefined);

async function loadAuthState(): Promise<{
  user: User | null;
  displayName: string | null;
  effectiveRole: ProfileRole | null;
}> {
  try {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      return { user: null, displayName: null, effectiveRole: null };
    }

    const {
      data: { user: validatedUser }
    } = await supabase.auth.getUser();

    const { data: sessionWrap } = await supabase.auth.getSession();
    const sessionUser = sessionWrap.session?.user ?? null;
    /** Prefer validated user; fall back to session user so brief token/network gaps don’t wipe UI (header flicker). */
    const user = validatedUser ?? sessionUser;

    if (!user) {
      try {
        localStorage.removeItem("active_role");
      } catch {
        /* ignore */
      }
      return { user: null, displayName: null, effectiveRole: null };
    }

    const metaRaw = user.user_metadata?.full_name;
    const metaName = typeof metaRaw === "string" && metaRaw.trim() ? metaRaw.trim() : null;

    const metaRoleRaw = user.user_metadata?.role;
    const metaRole = typeof metaRoleRaw === "string" && isProfileRole(metaRoleRaw) ? metaRoleRaw : null;
    if (metaRole) {
      try {
        localStorage.setItem("active_role", metaRole);
      } catch {
        /* ignore */
      }
    }

    const { data: profile } = await supabase
      .from(PROFILES_TABLE)
      .select("role, full_name")
      .eq("id", user.id)
      .maybeSingle();

    const r =
      profile?.role && isProfileRole(profile.role)
        ? profile.role
        : typeof user.user_metadata?.role === "string" && isProfileRole(user.user_metadata.role)
          ? user.user_metadata.role
          : null;

    if (isProfileRole(r)) {
      try {
        localStorage.setItem("active_role", r);
      } catch {
        /* ignore */
      }
    } else if (!metaRole) {
      try {
        localStorage.removeItem("active_role");
      } catch {
        /* ignore */
      }
    }

    const profileName =
      typeof profile?.full_name === "string" && profile.full_name.trim() ? profile.full_name.trim() : null;
    const displayName = profileName ?? metaName;

    const effectiveRole = await resolveRoleForUser(supabase, user);

    return { user, displayName, effectiveRole };
  } catch (error) {
    console.warn("[auth] loadAuthState failed:", readSupabaseErrorMessage(error));
    throw error;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [effectiveRole, setEffectiveRole] = useState<ProfileRole | null>(null);

  /** Mirror of `user` for use inside the auth listener (avoids re-subscribing on every change). */
  const hasUserRef = useRef(false);
  useEffect(() => {
    hasUserRef.current = !!user;
  }, [user]);

  const refresh = useCallback(async () => {
    try {
      const next = await loadAuthState();
      setUser(next.user);
      setDisplayName(next.displayName);
      setEffectiveRole(next.effectiveRole);
    } catch (error) {
      console.warn("[auth] refresh failed:", readSupabaseErrorMessage(error));
    }
  }, []);

  /** First paint only — avoids header/name disappearing on every route change. */
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    void (async () => {
      await refresh();
      if (!cancelled) setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  /** Keep auth in sync when navigating without toggling global loading (prevents AppShell jitter). */
  useEffect(() => {
    void refresh();
  }, [pathname, refresh]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "TOKEN_REFRESHED") {
        void refresh();
        return;
      }
      if (event === "SIGNED_IN" || event === "USER_UPDATED") {
        /**
         * Supabase re-emits SIGNED_IN whenever the tab regains focus. If we already
         * have a user, refresh silently — toggling `isLoading` here collapses dashboards
         * to a skeleton and forces data views (e.g. parent search) to re-run, causing
         * an aggressive re-hydration "blink" on every tab switch. Only show the global
         * loading state on the genuine first sign-in.
         */
        if (hasUserRef.current) {
          void refresh();
          return;
        }
        setIsLoading(true);
        void (async () => {
          await refresh();
          setIsLoading(false);
        })();
      }
      if (event === "SIGNED_OUT") {
        resetRedirectDedupe();
        try {
          localStorage.removeItem("active_role");
          localStorage.removeItem("anynanny_payer_session_v1");
          sessionStorage.removeItem("anynanny_auth_redirect_lock");
        } catch {
          /* ignore */
        }
        setUser(null);
        setDisplayName(null);
        setEffectiveRole(null);
        setIsLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [refresh]);

  const currentRole = useMemo((): DashboardViewRole => {
    if (pathname.startsWith("/sitter") || pathname.startsWith("/session")) return "sitter";
    return "parent";
  }, [pathname]);

  const value = useMemo(
    (): AuthUiState => ({
      isLoading,
      signedIn: !!user,
      user,
      displayName,
      effectiveRole,
      currentRole,
      refresh
    }),
    [isLoading, user, displayName, effectiveRole, currentRole, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthUiState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
