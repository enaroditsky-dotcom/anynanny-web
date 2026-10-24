import "server-only";

import {
  isAuthBanActive,
  resolveAdminBroadcastTestRecipient,
  type BroadcastTestAccountSnapshot
} from "@/lib/admin/broadcast-test-recipient";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/admin";
import { PROFILES_TABLE } from "@/lib/supabase/profiles";

const UNAVAILABLE: BroadcastTestAccountSnapshot = {
  profileFound: false,
  role: null,
  parentSerial: null,
  suspended: true,
  authFound: false,
  banned: true,
  deleted: true
};

export async function loadBroadcastTestAccount(userId: string): Promise<BroadcastTestAccountSnapshot> {
  try {
    const supabase = getSupabaseServiceRoleClient();
    const profile = await supabase
      .from(PROFILES_TABLE)
      .select("id, role, parent_serial, suspended_at")
      .eq("id", userId)
      .maybeSingle();
    if (profile.error || !profile.data) return UNAVAILABLE;

    const row = profile.data as {
      id?: string | null;
      role?: string | null;
      parent_serial?: string | null;
      suspended_at?: string | null;
    };
    if (String(row.id ?? "").trim().toLowerCase() !== userId.toLowerCase()) {
      return UNAVAILABLE;
    }

    const auth = await supabase.auth.admin.getUserById(userId);
    const user = auth.data?.user as
      | { id?: string | null; banned_until?: string | null; deleted_at?: string | null }
      | null
      | undefined;
    if (auth.error || !user || String(user.id ?? "").trim().toLowerCase() !== userId.toLowerCase()) {
      return {
        profileFound: true,
        role: typeof row.role === "string" ? row.role : null,
        parentSerial: typeof row.parent_serial === "string" ? row.parent_serial : null,
        suspended: Boolean(row.suspended_at),
        authFound: false,
        banned: true,
        deleted: true
      };
    }

    return {
      profileFound: true,
      role: typeof row.role === "string" ? row.role : null,
      parentSerial: typeof row.parent_serial === "string" ? row.parent_serial : null,
      suspended: Boolean(row.suspended_at),
      authFound: true,
      banned: isAuthBanActive(user.banned_until),
      deleted: Boolean(user.deleted_at && String(user.deleted_at).trim())
    };
  } catch {
    return UNAVAILABLE;
  }
}

export async function resolveConfiguredBroadcastTestRecipient(): Promise<string> {
  return resolveAdminBroadcastTestRecipient({ load: loadBroadcastTestAccount });
}
