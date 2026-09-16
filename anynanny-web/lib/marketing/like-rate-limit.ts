type Bucket = number[];

const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS = 20;

const buckets = new Map<string, Bucket>();

export function resetMarketingLikeRateLimit(): void {
  buckets.clear();
}

export function allowMarketingLikeRequest(
  key: string,
  now = Date.now(),
  max = MAX_REQUESTS,
  windowMs = WINDOW_MS
): boolean {
  const cutoff = now - windowMs;
  const previous = (buckets.get(key) || []).filter((stamp) => stamp > cutoff);
  if (previous.length >= max) {
    buckets.set(key, previous);
    return false;
  }
  previous.push(now);
  buckets.set(key, previous);
  return true;
}

export function marketingLikeClientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip")?.trim() || "anonymous";
}
