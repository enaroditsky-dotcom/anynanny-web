export const MARKETING_CUSTOM_ANALYTICS_ENABLED =
  process.env.NEXT_PUBLIC_MARKETING_CUSTOM_ANALYTICS === "1";

/** Custom events stay off unless a paid Vercel Analytics plan is enabled. */
export function maybeTrackMarketingCustomEvent(_name: string): void {
  if (!MARKETING_CUSTOM_ANALYTICS_ENABLED) return;
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function isLocalOrPreviewHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (LOCAL_HOSTS.has(host)) return true;
  if (host.endsWith(".local")) return true;
  if (host.includes("localhost")) return true;
  // Vercel preview deployments, not a custom production domain.
  if (host.endsWith(".vercel.app")) return true;
  return false;
}

function isRecoveryOrAuthCallback(url: URL): boolean {
  const type = (url.searchParams.get("type") || "").toLowerCase();
  if (type === "recovery") return true;
  if (url.searchParams.has("code")) return true;
  if (url.hash.includes("type=recovery")) return true;
  if (url.hash.includes("error")) return true;
  return false;
}

export function prepareMarketingAnalyticsUrl(rawUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  if (isLocalOrPreviewHost(url.hostname)) return null;
  if (url.pathname !== "/") return null;
  if (isRecoveryOrAuthCallback(url)) return null;

  url.search = "";
  url.hash = "";
  return url.toString();
}

export function filterMarketingAnalyticsEvent<T extends { url: string }>(
  event: T
): T | null {
  const url = prepareMarketingAnalyticsUrl(event.url);
  if (!url) return null;
  return { ...event, url };
}
