const stripTrailingSlash = (value: string) => value.replace(/\/$/, "");

export function resolveAppOrigin(request: Request): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (fromEnv) return stripTrailingSlash(fromEnv);
  return new URL(request.url).origin;
}

export function resolveCheckoutRedirectUrl(
  request: Request,
  candidate: string | undefined,
  fallbackPath: string
): string {
  const appOrigin = resolveAppOrigin(request);
  const requestOrigin = new URL(request.url).origin;
  const allowed = new Set([appOrigin, requestOrigin].filter(Boolean));

  const raw = candidate?.trim();
  if (!raw) {
    return `${appOrigin}${fallbackPath.startsWith("/") ? fallbackPath : `/${fallbackPath}`}`;
  }

  const url = raw.startsWith("http") ? new URL(raw) : new URL(raw, appOrigin);
  if (!allowed.has(url.origin)) {
    throw new Error("Redirect URL must use the app origin.");
  }
  return url.toString();
}
