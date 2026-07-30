import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isMissingRpcError,
  isRpcKnownMissing,
  markRpcMissing,
  getCachedWorkingSelect,
  setCachedWorkingSelect
} from "@/lib/supabase/rpc-availability";
import { isPostgrestMissingColumnError, isPostgrestSchemaDriftError } from "@/lib/supabase/postgrest-schema";
import { PROFILES_TABLE } from "@/lib/supabase/profiles";
import { SITTER_PROFILES_TABLE, SITTER_PROFILES_USER_COLUMN } from "@/lib/sitter/sitter-profile";

export const PUBLIC_DISPLAY_ID_BASE = 1000;
export const PARENT_DISPLAY_ID_STORAGE_KEY = "anynanny_parent_display_id";
export const SITTER_DISPLAY_ID_STORAGE_KEY = "anynanny_sitter_display_id";

const PARENT_SERIAL_RE = /^P-\d+$/i;
const SITTER_SERIAL_RE = /^AN-\d+$/i;

export function pickProfileSerialId(row: unknown): number | null {
  if (!row || typeof row !== "object") return null;
  const raw = (row as Record<string, unknown>).serial_id ?? (row as Record<string, unknown>).serialId;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.floor(n);
}

/** Canonical parent display id: P-1001 */
export function formatParentPublicIdFromSerial(serialId: number | null | undefined): string | null {
  if (serialId == null || !Number.isFinite(Number(serialId)) || Number(serialId) < 1) return null;
  return `P-${PUBLIC_DISPLAY_ID_BASE + Math.floor(Number(serialId))}`;
}

/** Canonical sitter display id: AN-1001 */
export function formatSitterPublicIdFromSerial(serialId: number | null | undefined): string | null {
  if (serialId == null || !Number.isFinite(Number(serialId)) || Number(serialId) < 1) return null;
  return `AN-${PUBLIC_DISPLAY_ID_BASE + Math.floor(Number(serialId))}`;
}

function normalizeParentSerial(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  if (!v) return null;
  if (PARENT_SERIAL_RE.test(v)) return `P-${v.slice(2)}`;
  if (/^P_\d+$/i.test(v)) return `P-${v.slice(2)}`;
  if (/^\d+$/.test(v)) return `P-${v}`;
  return null;
}

function normalizeSitterSerial(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  if (!v) return null;
  if (SITTER_SERIAL_RE.test(v)) return `AN-${v.slice(3)}`;
  if (/^AN_\d+$/i.test(v)) return `AN-${v.slice(3)}`;
  if (/^\d+$/.test(v)) return `AN-${v}`;
  return null;
}

export function pickProfilePublicId(row: unknown, role: "parent" | "sitter"): string | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;

  if (role === "parent") {
    return (
      normalizeParentSerial(r.parent_public_id) ||
      normalizeParentSerial(r.parent_serial) ||
      normalizeParentSerial(r.parentSerial) ||
      normalizeParentSerial(r.public_id) ||
      normalizeParentSerial(r.publicId) ||
      formatParentPublicIdFromSerial(pickProfileSerialId(r))
    );
  }

  return (
    normalizeSitterSerial(r.nanny_serial) ||
    normalizeSitterSerial(r.nanny_id_number) ||
    normalizeSitterSerial(r.nanny_public_id) ||
    normalizeSitterSerial(r.nannyPublicId) ||
    normalizeSitterSerial(r.public_id) ||
    normalizeSitterSerial(r.publicId) ||
    formatSitterPublicIdFromSerial(pickProfileSerialId(r))
  );
}

async function rpcText(supabase: SupabaseClient, fn: string): Promise<string | null> {
  if (isRpcKnownMissing(fn)) return null;

  const { data, error } = await supabase.rpc(fn);
  if (error) {
    if (isMissingRpcError(error)) {
      markRpcMissing(fn);
    }
    return null;
  }
  if (typeof data === "string" && data.trim()) return data.trim();
  return null;
}

async function readParentPublicIdFromProfiles(
  supabase: SupabaseClient,
  userId: string
): Promise<{ publicId: string | null; error: string | null }> {
  const cacheKey = `profiles:parent-public-id`;
  const cached = getCachedWorkingSelect(cacheKey);
  const selectAttempts = [
    ...(cached ? [cached] : []),
    "parent_public_id, parent_serial, public_id, serial_id, role",
    "parent_public_id, parent_serial, serial_id, role",
    "parent_serial, serial_id, role",
    "public_id, serial_id, role",
    "serial_id, role",
    "role"
  ].filter((s, i, arr) => arr.indexOf(s) === i);

  let lastError: string | null = null;
  for (const select of selectAttempts) {
    const { data, error } = await supabase
      .from(PROFILES_TABLE)
      .select(select)
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      lastError = error.message;
      if (
        isPostgrestMissingColumnError(error.message, "parent_public_id") ||
        isPostgrestMissingColumnError(error.message, "parent_serial") ||
        isPostgrestMissingColumnError(error.message, "public_id") ||
        isPostgrestMissingColumnError(error.message, "serial_id") ||
        isPostgrestSchemaDriftError(error.message)
      ) {
        continue;
      }
      return { publicId: null, error: error.message };
    }

    setCachedWorkingSelect(cacheKey, select);
    const publicId = pickProfilePublicId(data, "parent");
    if (publicId) cacheParentDisplayId(publicId);
    return { publicId, error: null };
  }

  return { publicId: null, error: lastError };
}

async function readSitterPublicIdFromProfiles(
  supabase: SupabaseClient,
  userId: string
): Promise<{ publicId: string | null; error: string | null }> {
  const cacheKey = `sitter_profiles:nanny-serial`;
  const cached = getCachedWorkingSelect(cacheKey);
  const fk = SITTER_PROFILES_USER_COLUMN;
  const selectAttempts = [
    ...(cached ? [cached] : []),
    "nanny_serial, nanny_id_number",
    "nanny_serial",
    "nanny_id_number"
  ].filter((s, i, arr) => arr.indexOf(s) === i);

  let lastError: string | null = null;
  for (const select of selectAttempts) {
    const { data, error } = await supabase
      .from(SITTER_PROFILES_TABLE)
      .select(select)
      .eq(fk, userId)
      .maybeSingle();

    if (error) {
      lastError = error.message;
      if (
        isPostgrestMissingColumnError(error.message, "nanny_serial") ||
        isPostgrestMissingColumnError(error.message, "nanny_id_number") ||
        isPostgrestSchemaDriftError(error.message)
      ) {
        continue;
      }
      return { publicId: null, error: error.message };
    }

    setCachedWorkingSelect(cacheKey, select);
    const id =
      normalizeSitterSerial((data as { nanny_serial?: string } | null)?.nanny_serial) ||
      normalizeSitterSerial((data as { nanny_id_number?: string } | null)?.nanny_id_number) ||
      pickProfilePublicId(data, "sitter");
    if (id) cacheSitterDisplayId(id);
    return { publicId: id, error: null };
  }

  return { publicId: null, error: lastError };
}

/** Loads role-scoped public display id for dashboard badges (AN-#### / P-####). */
export async function fetchProfilePublicId(
  supabase: SupabaseClient,
  userId: string,
  expectedRole: "parent" | "sitter"
): Promise<{ publicId: string | null; error: string | null }> {
  if (!userId.trim()) return { publicId: null, error: null };

  // Prefer local cache to avoid repeat network probes while navigating.
  if (expectedRole === "parent") {
    const cached = readCachedParentDisplayId();
    if (cached) return { publicId: cached, error: null };
  } else {
    const cached = readCachedSitterDisplayId();
    if (cached) return { publicId: cached, error: null };
  }

  // Table reads first — never lead with ensure_* RPCs (they 404 when undeployed).
  if (expectedRole === "sitter") {
    const fromTable = await readSitterPublicIdFromProfiles(supabase, userId);
    if (fromTable.publicId) return fromTable;

    const ensured = normalizeSitterSerial(await rpcText(supabase, "ensure_sitter_nanny_serial"));
    if (ensured) {
      cacheSitterDisplayId(ensured);
      return { publicId: ensured, error: null };
    }
    return fromTable;
  }

  const fromTable = await readParentPublicIdFromProfiles(supabase, userId);
  if (fromTable.publicId) return fromTable;

  const ensured = normalizeParentSerial(await rpcText(supabase, "ensure_parent_public_id"));
  if (ensured) {
    cacheParentDisplayId(ensured);
    return { publicId: ensured, error: null };
  }

  return fromTable;
}

export function readCachedParentDisplayId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(PARENT_DISPLAY_ID_STORAGE_KEY);
    return normalizeParentSerial(raw);
  } catch {
    return null;
  }
}

export function cacheParentDisplayId(id: string | null | undefined): void {
  if (typeof window === "undefined") return;
  try {
    const normalized = normalizeParentSerial(id);
    if (normalized) localStorage.setItem(PARENT_DISPLAY_ID_STORAGE_KEY, normalized);
    else localStorage.removeItem(PARENT_DISPLAY_ID_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function readCachedSitterDisplayId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SITTER_DISPLAY_ID_STORAGE_KEY);
    return normalizeSitterSerial(raw);
  } catch {
    return null;
  }
}

export function cacheSitterDisplayId(id: string | null | undefined): void {
  if (typeof window === "undefined") return;
  try {
    const normalized = normalizeSitterSerial(id);
    if (normalized) localStorage.setItem(SITTER_DISPLAY_ID_STORAGE_KEY, normalized);
    else localStorage.removeItem(SITTER_DISPLAY_ID_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

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

  // Avoid a second round-trip that 400s when serial_id is absent — try once, soft-fail.
  const cacheKey = "profiles:serial_id-only";
  if (getCachedWorkingSelect(cacheKey) === "__missing__") {
    return { serialId: null, role, error: null };
  }

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
      setCachedWorkingSelect(cacheKey, "__missing__");
      return { serialId: null, role, error: null };
    }
    return { serialId: null, role, error: serialErr.message };
  }

  setCachedWorkingSelect(cacheKey, "serial_id");
  return {
    serialId: pickProfileSerialId(serialRow as ProfileSerialRow | null),
    role,
    error: null
  };
}
