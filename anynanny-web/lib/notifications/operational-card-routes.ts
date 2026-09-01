/** Dashboard pages already show local payment/shift/booking status. */
const SUPPRESSED_OPERATIONAL_CARD_ROUTES = ["/parent/dashboard", "/sitter/dashboard"] as const;

export function normalizeOperationalCardPathname(pathname: string | null | undefined): string {
  const raw = String(pathname ?? "").trim();
  if (!raw) return "";
  let path = raw;
  try {
    path = decodeURIComponent(raw);
  } catch {
    path = raw;
  }
  const withoutSearch = path.split(/[?#]/, 1)[0] ?? "";
  if (withoutSearch.length > 1) {
    return withoutSearch.replace(/\/+$/, "") || "/";
  }
  return withoutSearch;
}

export function isOperationalCardsSuppressedRoute(pathname: string | null | undefined): boolean {
  const path = normalizeOperationalCardPathname(pathname);
  return (SUPPRESSED_OPERATIONAL_CARD_ROUTES as readonly string[]).includes(path);
}
