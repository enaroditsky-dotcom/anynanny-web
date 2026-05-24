"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import {
  SITTER_PROFILES_TABLE,
  SITTER_PROFILES_USER_COLUMN
} from "@/lib/sitter/sitter-profile";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { PROFILES_TABLE } from "@/lib/supabase/profiles";

export type DashboardRole = "parent" | "sitter";

function pickName(...candidates: (string | null | undefined)[]): string | null {
  for (const c of candidates) {
    const t = (c ?? "").trim();
    if (t) return t;
  }
  return null;
}

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
 * Resolves display name: role profile table → `profiles.full_name` → auth metadata → AuthProvider cache.
 */
export function useDashboardGreetingName(
  role: DashboardRole,
  userId: string | null,
  refreshKey = 0
): { fullName: string | null; nameLoading: boolean } {
  const { displayName, isLoading: authLoading, user } = useAuth();
  const [resolvedName, setResolvedName] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);

  const metaName =
    typeof user?.user_metadata?.full_name === "string" ? user.user_metadata.full_name.trim() : null;
  const cachedName = pickName(displayName, metaName, resolvedName);

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
          ? pickName((roleProfileRes.data as { full_name?: string | null }).full_name)
          : null;

      const profileFullName =
        profilesRes.data && typeof profilesRes.data === "object"
          ? pickName((profilesRes.data as { full_name?: string | null }).full_name)
          : null;

      const name =
        role === "sitter"
          ? pickName(sitterFullName, profileFullName, metaName, displayName)
          : pickName(profileFullName, metaName, displayName);

      setResolvedName(name);
      setFetching(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, role, metaName, displayName, refreshKey]);

  const nameLoading = authLoading || (!!userId && fetching && !cachedName);
  const fullName = pickName(resolvedName, displayName, metaName);

  return { fullName, nameLoading };
}
