"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import {
  SITTER_PROFILES_TABLE,
  SITTER_PROFILES_USER_COLUMN
} from "@/lib/sitter/sitter-profile";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { PROFILES_TABLE } from "@/lib/supabase/profiles";
import { pickGreetingDisplayName } from "@/lib/user/greeting-display-name";

export type DashboardRole = "parent" | "sitter";

/** Greeting line for dashboard headers. */
export function buildDashboardGreetingLine(fullName: string | null, nameLoading: boolean): string {
  if (nameLoading) return "שלום!";
  if (fullName) return `שלום, ${fullName}! מה תרצה לעשות היום?`;
  return "שלום! מה תרצה לעשות היום?";
}

/** Title only (sitter header splits subtitle). */
export function buildDashboardGreetingTitle(fullName: string | null, nameLoading: boolean): string {
  if (nameLoading) return "שלום!";
  if (fullName) return `שלום, ${fullName}!`;
  return "שלום!";
}

/**
 * Resolves greeting name from Supabase `profiles.full_name` (and sitter_profiles for sitters).
 * Never falls back to email or email local-parts.
 */
export function useDashboardGreetingName(
  role: DashboardRole,
  userId: string | null,
  refreshKey = 0
): { fullName: string | null; nameLoading: boolean } {
  const { isLoading: authLoading, user } = useAuth();
  const [resolvedName, setResolvedName] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);

  const userEmail = user?.email ?? null;

  useEffect(() => {
    if (!userId) {
      setResolvedName(null);
      setFetching(false);
      return;
    }

    let cancelled = false;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setFetching(false);
      return;
    }

    setFetching(true);

    void (async () => {
      const fk = SITTER_PROFILES_USER_COLUMN;

      const [roleProfileRes, profilesRes] = await Promise.all([
        role === "sitter"
          ? supabase
              .from(SITTER_PROFILES_TABLE)
              .select("full_name")
              .eq(fk, userId)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        supabase.from(PROFILES_TABLE).select("full_name").eq("id", userId).maybeSingle()
      ]);

      if (cancelled) return;

      const sitterFullName =
        roleProfileRes.data && typeof roleProfileRes.data === "object"
          ? (roleProfileRes.data as { full_name?: string | null }).full_name
          : null;

      const profileFullName =
        profilesRes.data && typeof profilesRes.data === "object"
          ? (profilesRes.data as { full_name?: string | null }).full_name
          : null;

      const metaFullName =
        typeof user?.user_metadata?.full_name === "string" ? user.user_metadata.full_name : null;

      const name =
        role === "sitter"
          ? pickGreetingDisplayName(userEmail, sitterFullName, profileFullName, metaFullName)
          : pickGreetingDisplayName(userEmail, profileFullName, metaFullName);

      setResolvedName(name);
      setFetching(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, role, userEmail, user?.user_metadata?.full_name, refreshKey]);

  const nameLoading = authLoading || (!!userId && fetching);
  const fullName = resolvedName;

  return { fullName, nameLoading };
}
