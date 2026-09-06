/**
 * Internal in-app CTA routes for admin system messages.
 * Rejects protocol URLs, traversal, and admin/API surfaces.
 */

const ALLOWED_PREFIXES = [
  "/parent",
  "/sitter",
  "/settings",
  "/session",
  "/welcome",
  "/charter",
  "/privacy",
  "/terms",
  "/identity"
] as const;

const BLOCKED_PREFIXES = ["/admin", "/api"] as const;

export const BROADCAST_CTA_ROUTE_MAX_LENGTH = 120;
export const BROADCAST_CTA_LABEL_MAX_LENGTH = 40;

function stripQueryAndHash(route: string): { path: string; query: string; hash: string } {
  const hashIndex = route.indexOf("#");
  const withoutHash = hashIndex >= 0 ? route.slice(0, hashIndex) : route;
  const hash = hashIndex >= 0 ? route.slice(hashIndex + 1) : "";
  const queryIndex = withoutHash.indexOf("?");
  const path = queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash;
  const query = queryIndex >= 0 ? withoutHash.slice(queryIndex + 1) : "";
  return { path, query, hash };
}

function isSafePathSegment(path: string): boolean {
  if (!path.startsWith("/")) return false;
  if (path.startsWith("//")) return false;
  if (path.includes("..")) return false;
  if (path.includes("\\")) return false;
  if (path.includes("//")) return false;
  return /^\/[A-Za-z0-9/_-]*$/.test(path);
}

function isSafeQuery(query: string): boolean {
  if (!query) return true;
  return /^[A-Za-z0-9_.=&%-]*$/.test(query);
}

export function isInternalBroadcastCtaRoute(raw: string | null | undefined): boolean {
  const route = String(raw ?? "").trim();
  if (!route) return false;
  if (route.length > BROADCAST_CTA_ROUTE_MAX_LENGTH) return false;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(route)) return false;
  if (route.startsWith("//")) return false;

  const { path, query, hash } = stripQueryAndHash(route);
  if (hash) return false;
  if (!isSafePathSegment(path)) return false;
  if (!isSafeQuery(query)) return false;

  const blocked = BLOCKED_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`)
  );
  if (blocked) return false;

  return ALLOWED_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

export function normalizeBroadcastCtaRoute(raw: string | null | undefined): string | null {
  const route = String(raw ?? "").trim();
  if (!route) return null;
  if (!isInternalBroadcastCtaRoute(route)) return null;
  const { path, query } = stripQueryAndHash(route);
  return query ? `${path}?${query}` : path;
}
