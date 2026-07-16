"use client";

import type { User } from "@supabase/supabase-js";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { resetRedirectDedupe } from "@/lib/auth/redirect-after-sign-in";
import { resolveRoleForUser } from "@/lib/auth/supabase-profile";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { readSupabaseErrorMessage } from "@/lib/supabase/postgrest-schema";
import { isProfileRole, PROFILES_TABLE, type ProfileRole } from "@/lib/supabase/profiles";
import { sanitizeGreetingDisplayName } from "@/lib/user/greeting-display-name";

export type DashboardViewRole = "parent" | "sitter";

export type AuthUiState = {
  isLoading: boolean;
  signedIn: boolean;
  user: User | null;
  displayName: string | null;
  effectiveRole: ProfileRole | null;
  currentRole: DashboardViewRole;
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

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { user: null, displayName: null, effectiveRole: null };
  }

  const metaFirst = typeof user.user_metadata?.first_name === "string" ? user.user_metadata.first_name.trim() : "";
  const metaLast = typeof user.user_metadata?.last_name === "string" ? user.user_metadata.last_name.trim() : "";
  const metaName = `${metaFirst} ${metaLast}`.trim() || null;

  const { data: profile } = await supabase
    .from(PROFILES_TABLE)
    .select("role, first_name, last_name")
    .eq("id", user.id)
    .maybeSingle();

  const effectiveRole = await resolveRoleForUser(supabase, user);
  const displayName = sanitizeGreetingDisplayName(
    profile ? `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() : null, 
    user.email
  ) ?? sanitizeGreetingDisplayName(metaName, user.email);

  return { user, displayName, effectiveRole };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [effectiveRole, setEffectiveRole] = useState<ProfileRole | null>(null);

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

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    void (async () => {
      await refresh();
      if (!cancelled) setIsLoading(false);
    })();
    return () => { cancelled = true; };
  }, [refresh]);

  useEffect(() => {
    void refresh();
  }, [pathname, refresh]);

  const value = useMemo(
    (): AuthUiState => ({
      isLoading,
      signedIn: !!user,
      user,
      displayName,
      effectiveRole,
      currentRole: (pathname.startsWith("/sitter") || pathname.startsWith("/session")) ? "sitter" : "parent",
      refresh
    }),
    [isLoading, user, displayName, effectiveRole, pathname, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthUiState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}