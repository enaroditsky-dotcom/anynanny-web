import { DOMAIN_SEPARATION_ENABLED, SITE_HOSTS } from "@/lib/hosts/site-classifier";

/** Application origin. Marketing pages stay on www once separation is enabled. */
export const WEB_APP_ORIGIN = `https://${SITE_HOSTS.app}`;

/**
 * Application URL for a same-site path and query.
 * While domain separation is off, the current relative path is unchanged.
 * In-app `next` values stay relative so the welcome hop accepts them.
 */
export function toAppEntryHref(
  relativePathAndQuery: string,
  domainSeparationEnabled: boolean = DOMAIN_SEPARATION_ENABLED
): string {
  const relative = relativePathAndQuery.startsWith("/")
    ? relativePathAndQuery
    : `/${relativePathAndQuery}`;
  if (!domainSeparationEnabled) return relative;
  const url = new URL(relative, WEB_APP_ORIGIN);
  if (url.origin !== WEB_APP_ORIGIN) return `${WEB_APP_ORIGIN}/`;
  return url.toString();
}
