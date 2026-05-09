"use client";

import type { User } from "@supabase/supabase-js";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { resolveRoleForUser } from "@/lib/auth/supabase-profile";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { isProfileRole, PROFILES_TABLE, type ProfileRole } from "@/lib/supabase/profiles";

export type AuthUiState = {
  isLoading: boolean;
  signedIn: boolean;
  user: User | null;
  displayName: string | null;
  effectiveRole: ProfileRole | null;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthUiState | undefined>(undefined);

async function loadAuthState(): Promise<{
  user: User | null;
  displayName: string | null;
  effectiveRole: ProfileRole | null;
}> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    return { user: null, displayName: null, effectiveRole: null };
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();

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
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [effectiveRole, setEffectiveRole] = useState<ProfileRole | null>(null);

  const refresh = useCallback(async () => {
    const next = await loadAuthState();
    setUser(next.user);
    setDisplayName(next.displayName);
    setEffectiveRole(next.effectiveRole);
  }, []);

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
  }, [refresh, pathname]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
        setIsLoading(true);
        void (async () => {
          await refresh();
          setIsLoading(false);
        })();
      }
      if (event === "SIGNED_OUT") {
        try {
          localStorage.removeItem("active_role");
          localStorage.removeItem("anynanny_payer_session_v1");
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

  const value = useMemo(
    (): AuthUiState => ({
      isLoading,
      signedIn: !!user,
      user,
      displayName,
      effectiveRole,
      refresh
    }),
    [isLoading, user, displayName, effectiveRole, refresh]
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
