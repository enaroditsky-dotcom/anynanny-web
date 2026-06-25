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
  return `P-${PUBLIC_DISPLAY_ID_BASE + Math.floor(Number(serialId))}`;
}

export function formatSitterPublicIdFromSerial(serialId: number | null | undefined): string | null {
  if (serialId == null || !Number.isFinite(Number(serialId)) || Number(serialId) < 1) return null;
  return `AN-${PUBLIC_DISPLAY_ID_BASE + Math.floor(Number(serialId))}`;
}

export function readCachedParentDisplayId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(PARENT_DISPLAY_ID_STORAGE_KEY);
    if (raw && /^P-\d+$/.test(raw)) return raw;
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
  full_name?: string | null;
};

type ProfileSerialRow = {
  serial_id?: number | null;
};

/** Loads safe profile columns first; optionally reads serial_id in a second query (no RPC). */
export async function fetchProfileSerialId(
  supabase: SupabaseClient,
  userId: string
): Promise<{ serialId: number | null; role: string | null; error: string | null }> {
  const { data: base, error: baseErr } = await supabase
    .from(PROFILES_TABLE)
    .select("id, role, full_name")
    .eq("id", userId)
    .maybeSingle();

  if (baseErr) {
    return { serialId: null, role: null, error: baseErr.message };
  }

  const baseRow = (base as ProfileBaseRow | null) ?? null;
  const role = baseRow?.role ?? null;

  const { data: serialRow, error: serialErr } = await supabase
    .from(PROFILES_TABLE)
    .select("serial_id")
    .eq("id", userId)
    .maybeSingle();

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
