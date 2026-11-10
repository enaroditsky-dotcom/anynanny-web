/**
 * Host/path classification for the www / app / apex split.
 *
 * `DOMAIN_SEPARATION_ENABLED` is on. Middleware consults this module only
 * inside that flag. While it is off, every host keeps the combined site.
 *
 * `WWW_MARKETING_ROOT_ENABLED` is on. This module does not inspect the client.
 * Every client that opens www `/` — including an already-released iOS app —
 * receives the marketing homepage. Existing users continue through that
 * page's link to https://app.anynanny.org/. While the marketing-root flag is
 * off, www `/` remains the application entry even if domain separation is on.
 *
 * This module does not read environment variables or cookies.
 */

export const DOMAIN_SEPARATION_ENABLED = true;

/**
 * www `/` marketing switch. On for the approved marketing launch.
 * It shows the marketing homepage at www `/` to every client.
 * Already-released iOS clients are not detected or redirected elsewhere.
 */
export const WWW_MARKETING_ROOT_ENABLED = true;

/** Permanent redirect that keeps the original method, path, and query. */
export const DOMAIN_SEPARATION_REDIRECT_STATUS = 308;

export const SITE_HOSTS = {
  www: "www.anynanny.org",
  app: "app.anynanny.org",
  apex: "anynanny.org"
} as const;

export type SiteHostRole = "www" | "app" | "apex" | "unknown";

/** `/` is the shared entry. API routes never redirect off the incoming host. */
export type SitePathKind = "entry" | "marketing" | "auth" | "api" | "app" | "other";

export type SiteServing =
  | { mode: "combined" }
  | { mode: "marketing" }
  | { mode: "application" }
  | { mode: "auth" }
  | { mode: "api" }
  | { mode: "redirect-to-www"; location: string };

export type SiteClassification = {
  host: string;
  hostRole: SiteHostRole;
  pathname: string;
  search: string;
  pathKind: SitePathKind;
  authCallback: boolean;
  domainSeparationEnabled: boolean;
  serving: SiteServing;
};

export type ClassifySiteRequestInput = {
  host?: string | null;
  pathname?: string | null;
  search?: string | null;
  domainSeparationEnabled?: boolean;
  /**
   * Test-only preview of the www marketing root. Middleware must not set this.
   * Defaults to `WWW_MARKETING_ROOT_ENABLED`.
   */
  wwwMarketingRootEnabled?: boolean;
};

const MARKETING_EXACT_PATHS = new Set([
  "/parents",
  "/babysitter",
  "/jobs/students",
  "/app",
  "/privacy",
  "/terms",
  "/delete-account"
]);

const AUTH_PREFIXES = ["/auth", "/login", "/register", "/reset-password"] as const;

const APP_PREFIXES = [
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

const CITY_SLUG = /^[a-z0-9-]+$/;

/**
 * Public hostname for middleware and server components.
 *
 * Vercel documents `x-forwarded-host` as identical to `host`. Middleware's
 * request host is that same value. When the two headers disagree, `host`
 * wins so a forwarded value cannot select a different site.
 * `x-forwarded-host` is used only when `host` is absent; a list uses its
 * first entry.
 */
export function resolvePublicSiteHost(input: {
  host?: string | null;
  forwardedHost?: string | null;
} = {}): string {
  const host = (input.host ?? "").trim();
  if (host) return normalizeSiteHost(host);
  const forwarded = (input.forwardedHost ?? "").split(",")[0]?.trim() ?? "";
  return normalizeSiteHost(forwarded);
}

export function normalizeSiteHost(raw: string | null | undefined): string {
  if (!raw) return "";
  let host = raw.trim().toLowerCase();
  if (!host) return "";

  if (host.includes("://")) {
    try {
      host = new URL(raw.trim()).host.toLowerCase();
    } catch {
      return "";
    }
  }

  const slash = host.indexOf("/");
  if (slash >= 0) host = host.slice(0, slash);
  if (host.endsWith(".")) host = host.slice(0, -1);

  if (host.startsWith("[")) {
    const end = host.indexOf("]");
    return end >= 0 ? host.slice(0, end + 1) : host;
  }

  const colon = host.lastIndexOf(":");
  if (colon > -1 && /^\d+$/.test(host.slice(colon + 1))) {
    host = host.slice(0, colon);
  }
  return host;
}

export function classifySiteHost(raw: string | null | undefined): SiteHostRole {
  const host = normalizeSiteHost(raw);
  if (host === SITE_HOSTS.www) return "www";
  if (host === SITE_HOSTS.app) return "app";
  if (host === SITE_HOSTS.apex) return "apex";
  return "unknown";
}

export function normalizeSitePathname(raw: string | null | undefined): string {
  let path = (raw ?? "").trim();
  if (!path) return "/";
  if (!path.startsWith("/")) path = `/${path}`;
  path = path.replace(/\/{2,}/g, "/");
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  return path;
}

export function normalizeSiteSearch(raw: string | null | undefined): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "?") return "";
  return trimmed.startsWith("?") ? trimmed : `?${trimmed}`;
}

function splitPathAndSearch(pathname: string | null | undefined): { pathname: string; search: string } {
  const value = (pathname ?? "").trim();
  const hashAt = value.indexOf("#");
  const withoutHash = hashAt >= 0 ? value.slice(0, hashAt) : value;
  const queryAt = withoutHash.indexOf("?");
  const pathPart = queryAt >= 0 ? withoutHash.slice(0, queryAt) : withoutHash;
  const searchPart = queryAt >= 0 ? withoutHash.slice(queryAt) : "";
  return {
    pathname: normalizeSitePathname(pathPart),
    search: normalizeSiteSearch(searchPart)
  };
}

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function classifySitePath(pathname: string | null | undefined): SitePathKind {
  const path = normalizeSitePathname(pathname);
  if (path === "/") return "entry";
  if (matchesPrefix(path, "/api")) return "api";
  if (MARKETING_EXACT_PATHS.has(path) || matchesPrefix(path, "/marketing")) return "marketing";

  const babysitter = path.match(/^\/babysitter\/([^/]+)$/);
  if (babysitter && CITY_SLUG.test(babysitter[1])) return "marketing";

  if (AUTH_PREFIXES.some((prefix) => matchesPrefix(path, prefix))) return "auth";
  if (APP_PREFIXES.some((prefix) => matchesPrefix(path, prefix))) return "app";
  return "other";
}

function searchParam(search: string, name: string): string | null {
  return new URLSearchParams(search.startsWith("?") ? search.slice(1) : search).get(name);
}

/** Supabase callback markers. A campaign query string is not a callback. */
export function isSiteAuthCallback(pathname: string, search: string): boolean {
  const path = normalizeSitePathname(pathname);
  const type = (searchParam(search, "type") ?? "").toLowerCase();
  if (type === "recovery") return true;

  const onCallbackPath = path === "/auth/verified" || path === "/auth/reset-password";
  if (!onCallbackPath) return false;

  if (searchParam(search, "code") || searchParam(search, "token_hash")) return true;
  if (searchParam(search, "error") || searchParam(search, "error_code")) return true;
  return type === "signup" || type === "email" || type === "email_change" || type === "invite";
}

export function wwwLocationForPath(pathname: string, search: string): string {
  const path = normalizeSitePathname(pathname);
  const query = normalizeSiteSearch(search);
  return `https://${SITE_HOSTS.www}${path}${query}`;
}

function intendedServing(input: {
  hostRole: SiteHostRole;
  pathKind: SitePathKind;
  authCallback: boolean;
  pathname: string;
  search: string;
  wwwMarketingRootEnabled: boolean;
}): SiteServing {
  if (input.hostRole === "unknown") return { mode: "combined" };

  if (input.pathKind === "api") return { mode: "api" };
  if (input.authCallback || input.pathKind === "auth") return { mode: "auth" };

  if (input.hostRole === "apex") {
    return {
      mode: "redirect-to-www",
      location: wwwLocationForPath(input.pathname, input.search)
    };
  }

  if (input.hostRole === "app") {
    if (input.pathKind === "marketing") {
      return {
        mode: "redirect-to-www",
        location: wwwLocationForPath(input.pathname, input.search)
      };
    }
    return { mode: "application" };
  }

  if (input.pathKind === "entry") {
    return input.wwwMarketingRootEnabled ? { mode: "marketing" } : { mode: "application" };
  }
  if (input.pathKind === "marketing") return { mode: "marketing" };
  if (input.pathKind === "app") return { mode: "application" };
  return { mode: "combined" };
}

export function classifySiteRequest(input: ClassifySiteRequestInput = {}): SiteClassification {
  const fromPath = splitPathAndSearch(input.pathname);
  const search = normalizeSiteSearch(input.search) || fromPath.search;
  const domainSeparationEnabled = input.domainSeparationEnabled ?? DOMAIN_SEPARATION_ENABLED;
  const wwwMarketingRootEnabled = input.wwwMarketingRootEnabled ?? WWW_MARKETING_ROOT_ENABLED;
  const host = normalizeSiteHost(input.host);
  const hostRole = classifySiteHost(host);
  const pathKind = classifySitePath(fromPath.pathname);
  const authCallback = isSiteAuthCallback(fromPath.pathname, search);

  return {
    host,
    hostRole,
    pathname: fromPath.pathname,
    search,
    pathKind,
    authCallback,
    domainSeparationEnabled,
    serving: domainSeparationEnabled
      ? intendedServing({
          hostRole,
          pathKind,
          authCallback,
          pathname: fromPath.pathname,
          search,
          wwwMarketingRootEnabled
        })
      : { mode: "combined" }
  };
}

/** Absolute www URL when this request should leave its incoming host. Otherwise null. */
export function domainSeparationRedirectTarget(input: ClassifySiteRequestInput = {}): string | null {
  const decision = classifySiteRequest(input);
  if (!decision.domainSeparationEnabled) return null;
  if (decision.serving.mode !== "redirect-to-www") return null;
  return decision.serving.location;
}
