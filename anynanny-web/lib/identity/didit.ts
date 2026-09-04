/**
 * Client-safe Didit config + status mapping.
 * Keep this file free of Node built-in imports — identity UI (personal area, badges) loads it.
 * HMAC verification lives in didit-signature.ts (server/webhook only).
 */
/** Per-session config — not a secret and not an env var. Console → Workflows → "Free KYC". */
export const DIDIT_WORKFLOW_ID = "3f1ec9f2-1722-4264-bb57-7fac9649256c";

export const DIDIT_SESSIONS_TABLE = "didit_sessions";
export const DIDIT_WEBHOOK_EVENTS_TABLE = "didit_webhook_events";

export const IDENTITY_VERIFICATION_METHOD_DIDIT = "didit";

export const DIDIT_SESSION_STATUSES = [
  "Not Started",
  "In Progress",
  "Awaiting User",
  "In Review",
  "Approved",
  "Declined",
  "Resubmitted",
  "Abandoned",
  "Expired",
  "Kyc Expired"
] as const;

export type DiditSessionStatus = (typeof DIDIT_SESSION_STATUSES)[number];

const KEEP_PENDING: ReadonlySet<string> = new Set([
  "Not Started",
  "In Progress",
  "Awaiting User",
  "In Review",
  "Resubmitted"
]);

const STICKY_PENDING: ReadonlySet<string> = new Set(["In Review", "Resubmitted"]);

const OPEN_SESSION_STALE_MS = 24 * 60 * 60 * 1000;

export function isDiditSessionStatus(raw: unknown): raw is DiditSessionStatus {
  return DIDIT_SESSION_STATUSES.includes(String(raw) as DiditSessionStatus);
}

export function readDiditApiKey(): string {
  return String(process.env.DIDIT_API_KEY ?? "").trim();
}

export function readDiditWebhookSecret(): string {
  return String(process.env.DIDIT_WEBHOOK_SECRET ?? "").trim();
}

/** Whole-number floats (1.0) → integers (1), recursively. Matches Didit's server canonicalisation. */
export function shortenFloats(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(shortenFloats);
  if (v && typeof v === "object") {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, shortenFloats(x)])
    );
  }
  if (typeof v === "number" && !Number.isInteger(v) && v % 1 === 0) return Math.trunc(v);
  return v;
}

/** Recursive lexicographic key sort (array order preserved). */
export function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") {
    return Object.keys(v as object)
      .sort()
      .reduce<Record<string, unknown>>((acc, k) => {
        acc[k] = sortKeys((v as Record<string, unknown>)[k]);
        return acc;
      }, {});
  }
  return v;
}

export function canonicalizeDiditWebhookBody(parsed: unknown): string {
  return JSON.stringify(sortKeys(shortenFloats(parsed)));
}

export function mapDiditStatusToProfile(
  diditStatus: string,
  current: "unverified" | "pending" | "verified" | "failed"
): "unverified" | "pending" | "verified" | "failed" {
  switch (diditStatus) {
    case "Approved":
      return "verified";
    case "Declined":
      return "failed";
    case "Kyc Expired":
      return "unverified";
    case "In Review":
    case "Resubmitted":
    case "In Progress":
    case "Awaiting User":
    case "Not Started":
      return current === "verified" ? "verified" : "pending";
    case "Abandoned":
    case "Expired":
      return current === "verified" ? "verified" : "unverified";
    default:
      return current;
  }
}

export function shouldKeepDiditPending(
  diditStatus: string,
  createdAtIso: string | null | undefined,
  nowMs = Date.now()
): boolean {
  if (STICKY_PENDING.has(diditStatus)) return true;
  if (!KEEP_PENDING.has(diditStatus)) return false;
  const createdMs = Date.parse(String(createdAtIso ?? ""));
  if (!Number.isFinite(createdMs)) return true;
  return nowMs - createdMs < OPEN_SESSION_STALE_MS;
}
