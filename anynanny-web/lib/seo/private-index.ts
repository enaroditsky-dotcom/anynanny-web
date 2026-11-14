/**
 * HTML responses for application and auth screens.
 * Marketing pages are not in this list.
 * robots.txt stays open so a crawler can see the noindex header.
 */

export const NOINDEX_ROBOTS_VALUE = "noindex, nofollow";

/** Exact prefixes. `/sitter` must not cover `/babysitter`, and `/parent` must not cover `/parents`. */
export const NOINDEX_PREFIXES = [
  "/auth",
  "/login",
  "/register",
  "/reset-password",
  "/parent",
  "/sitter",
  "/admin",
  "/welcome",
  "/charter",
  "/session",
  "/billing",
  "/verify",
  "/identity",
  "/broadcast",
  "/gett-mock"
] as const;

export const NOINDEX_METADATA = {
  index: false,
  follow: false,
  googleBot: {
    index: false,
    follow: false
  }
} as const;

export function isNoindexPath(pathname: string): boolean {
  const path = (pathname.split("?")[0] || "/").replace(/\/+$/, "") || "/";
  return NOINDEX_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

export function noindexHeaderRoutes(): Array<{
  source: string;
  headers: Array<{ key: string; value: string }>;
}> {
  const headers = [{ key: "X-Robots-Tag", value: NOINDEX_ROBOTS_VALUE }];
  return NOINDEX_PREFIXES.flatMap((prefix) => [
    { source: prefix, headers },
    { source: `${prefix}/:path*`, headers }
  ]);
}
