import type { SupabaseClient } from "@supabase/supabase-js";
import { isPostgrestMissingColumnError, isPostgrestSchemaDriftError } from "@/lib/supabase/postgrest-schema";
import { PROFILES_TABLE } from "@/lib/supabase/profiles";

export const PUBLIC_DISPLAY_ID_BASE = 1000;
export const PARENT_DISPLAY_ID_STORAGE_KEY = "anynanny_parent_display_id";

export function pickProfileSerialId(row: unknown): number | null {
  if (!row || typeof row !== "object") return null;
  const raw = (row as Record<string, unknown>).serial_id ?? (row as Record<string, unknown>).serialId;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.floor(n);
}

export function formatParentPublicIdFromSerial(serialId: number | null | undefined): string | null {
  if (serialId == null || !Number.isFinite(Number(serialId)) || Number(serialId) < 1) return null;
  return `P_${PUBLIC_DISPLAY_ID_BASE + Math.floor(Number(serialId))}`;
}

export function formatSitterPublicIdFromSerial(serialId: number | null | undefined): string | null {
  if (serialId == null || !Number.isFinite(Number(serialId)) || Number(serialId) < 1) return null;
  return `AN_${PUBLIC_DISPLAY_ID_BASE + Math.floor(Number(serialId))}`;
}

export function pickProfilePublicId(row: unknown, role: "parent" | "sitter"): string | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;

  // Live DB uses unified `public_id`; role-scoped columns may be absent.
  const unified = r.public_id ?? r.publicId;
  if (typeof unified === "string" && unified.trim()) return unified.trim();

  if (role === "parent") {
    const legacy = r.parent_public_id ?? r.parentPublicId;
    if (typeof legacy === "string" && legacy.trim()) return legacy.trim();
    return formatParentPublicIdFromSerial(pickProfileSerialId(r));
  }

  const nannyLegacy = r.nanny_public_id ?? r.nannyPublicId;
  if (typeof nannyLegacy === "string" && nannyLegacy.trim()) return nannyLegacy.trim();
  return formatSitterPublicIdFromSerial(pickProfileSerialId(r));
}

/** Loads role-scoped public display id for dashboard badges. */
export async function fetchProfilePublicId(
  supabase: SupabaseClient,
  userId: string,
  expectedRole: "parent" | "sitter"
): Promise<{ publicId: string | null; error: string | null }> {
  // Production schema has unified `public_id` (+ optional `serial_id`).
  // Do not select `parent_public_id` / `nanny_public_id` — they are missing in live DB.
  const { data, error } = await supabase
    .from(PROFILES_TABLE)
    .select("public_id, serial_id, role")
    .eq("id", userId)
    .eq("role", expectedRole)
    .maybeSingle();

  if (error) {
    if (
      isPostgrestMissingColumnError(error.message, "serial_id") ||
      isPostgrestMissingColumnError(error.message, "public_id") ||
      isPostgrestSchemaDriftError(error.message)
    ) {
      const fallback = await fetchProfileSerialId(supabase, userId, expectedRole);
      if (fallback.error) return { publicId: null, error: fallback.error };
      const publicId =
        expectedRole === "parent"
          ? formatParentPublicIdFromSerial(fallback.serialId)
          : formatSitterPublicIdFromSerial(fallback.serialId);
      return { publicId, error: null };
    }
    return { publicId: null, error: error.message };
  }

  return {
    publicId: pickProfilePublicId(data, expectedRole),
    error: null
  };
}

export function readCachedParentDisplayId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(PARENT_DISPLAY_ID_STORAGE_KEY);
    if (raw && (/^P[_-]\d+$/.test(raw) || /^P-\d+$/.test(raw))) return raw;
  } catch {
    /* ignore */
  }
  return null;
}

export function cacheParentDisplayId(id: string | null | undefined): void {
  if (typeof window === "undefined") return;
  try {
    if (id) localStorage.setItem(PARENT_DISPLAY_ID_STORAGE_KEY, id);
    else localStorage.removeItem(PARENT_DISPLAY_ID_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** P- id for UI: cached dashboard value first, then optional serial from memory (no extra DB column). */
export function resolveParentPublicDisplayId(serialId?: number | null): string | null {
  const cached = readCachedParentDisplayId();
  if (cached) return cached;
  return formatParentPublicIdFromSerial(serialId ?? null);
}

type ProfileBaseRow = {
  id?: string;
  role?: string | null;
  first_name?: string | null;
  last_name?: string | null;
};

type ProfileSerialRow = {
  serial_id?: number | null;
};

/** Loads safe profile columns first; optionally reads serial_id in a second query (no RPC). */
export async function fetchProfileSerialId(
  supabase: SupabaseClient,
  userId: string,
  expectedRole?: "parent" | "sitter"
): Promise<{ serialId: number | null; role: string | null; error: string | null }> {
  let profileQuery = supabase
    .from(PROFILES_TABLE)
    .select("id, role, first_name, last_name")
    .eq("id", userId);

  if (expectedRole) {
    profileQuery = profileQuery.eq("role", expectedRole);
  }

  const { data: base, error: baseErr } = await profileQuery.maybeSingle();

  if (baseErr) {
    return { serialId: null, role: null, error: baseErr.message };
  }

  const baseRow = (base as ProfileBaseRow | null) ?? null;
  const role = baseRow?.role ?? null;

  let serialQuery = supabase.from(PROFILES_TABLE).select("serial_id").eq("id", userId);
  const serialRole = role ?? expectedRole;
  if (serialRole) {
    serialQuery = serialQuery.eq("role", serialRole);
  }

  const { data: serialRow, error: serialErr } = await serialQuery.maybeSingle();

  if (serialErr) {
    if (
      isPostgrestMissingColumnError(serialErr.message, "serial_id") ||
      isPostgrestSchemaDriftError(serialErr.message)
    ) {
      return { serialId: null, role, error: null };
    }
    return { serialId: null, role, error: serialErr.message };
  }

  return {
    serialId: pickProfileSerialId(serialRow as ProfileSerialRow | null),
    role,
    error: null
  };
}
