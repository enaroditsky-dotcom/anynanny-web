/**
 * Session-scoped cache for PostgREST RPCs that are missing (404 / PGRST202).
 * Prevents repeated network 404 spam in DevTools after the first soft failure.
 */

const missingRpcs = new Set<string>();

export function isRpcKnownMissing(fn: string): boolean {
  return missingRpcs.has(fn);
}

export function markRpcMissing(fn: string): void {
  if (fn.trim()) missingRpcs.add(fn);
}

export function clearRpcMissingCache(): void {
  missingRpcs.clear();
}

/** True when an error indicates the RPC is not deployed on this project. */
export function isMissingRpcError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  const msg = (error.message ?? "").toLowerCase();
  const code = String(error.code ?? "").toUpperCase();
  return (
    code === "PGRST202" ||
    code === "42883" ||
    msg.includes("could not find the function") ||
    msg.includes("function public.") ||
    (msg.includes("404") && (msg.includes("rpc") || msg.includes("function"))) ||
    /pgrst202/.test(msg)
  );
}

/**
 * Session cache for a working PostgREST select string per table+context key.
 * Avoids retrying selects that 400 on missing columns after the first success.
 */
const workingSelectByKey = new Map<string, string>();

export function getCachedWorkingSelect(key: string): string | null {
  return workingSelectByKey.get(key) ?? null;
}

export function setCachedWorkingSelect(key: string, select: string): void {
  if (key.trim() && select.trim()) workingSelectByKey.set(key, select);
}
