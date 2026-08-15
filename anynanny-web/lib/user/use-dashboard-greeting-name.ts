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
export function buildDashboardGreetingTitle(firstName: string | null, nameLoading: boolean): string {
  if (nameLoading) return "שלום!";
  if (firstName) return `שלום, ${firstName}!`;
  return "שלום!";
}

/**
 * Resolves greeting first name from account-level `profiles.first_name`.
 * Falls back to sitter_profiles / auth metadata when needed.
 */
export function useDashboardGreetingName(
  role: DashboardRole,
  userId: string | null,
  refreshKey = 0
): { firstName: string | null; fullName: string | null; nameLoading: boolean } {
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
              .select("first_name, last_name")
              .eq(fk, userId)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        supabase.from(PROFILES_TABLE).select("first_name, last_name").eq("id", userId).maybeSingle()
      ]);

      if (cancelled) return;

      const sitterRow =
        roleProfileRes.data && typeof roleProfileRes.data === "object"
          ? (roleProfileRes.data as { first_name?: string | null; last_name?: string | null })
          : null;
      const sitterFirstName = sitterRow?.first_name?.trim() || null;

      const profileRow =
        profilesRes.data && typeof profilesRes.data === "object"
          ? (profilesRes.data as { first_name?: string | null; last_name?: string | null })
          : null;

      const profileFirstName = profileRow?.first_name?.trim() || null;

      const metaFirstName =
        typeof user?.user_metadata?.first_name === "string" ? user.user_metadata.first_name.trim() : null;

      const firstName =
        role === "sitter"
          ? pickGreetingDisplayName(userEmail, profileFirstName, sitterFirstName, metaFirstName)
          : pickGreetingDisplayName(userEmail, profileFirstName, metaFirstName);

      setResolvedName(firstName);
      setFetching(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, role, userEmail, user?.user_metadata?.first_name, refreshKey]);

  const nameLoading = authLoading || (!!userId && fetching);
  const firstName = resolvedName;
  const fullName = resolvedName;

  return { firstName, fullName, nameLoading };
}
