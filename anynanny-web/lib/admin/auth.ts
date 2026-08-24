import { createHmac, timingSafeEqual } from "node:crypto";

export const ADMIN_AUTH_COOKIE = "anynanny_admin_auth";

const ADMIN_SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const ADMIN_SESSION_PREFIX = "v1";

export function getAdminPassword(): string {
  return (process.env.ADMIN_DASHBOARD_PASSWORD ?? "change-me").trim();
}

export function isValidAdminPassword(password: string): boolean {
  return password.trim() === getAdminPassword();
}

/** Prefer ADMIN_SESSION_SECRET; fall back to the dashboard password. */
export function getAdminSessionSecret(): string {
  const dedicated = (process.env.ADMIN_SESSION_SECRET ?? "").trim();
  if (dedicated) return dedicated;
  return getAdminPassword();
}

function hmacSha256Hex(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

function timingSafeEqualHex(left: string, right: string): boolean {
  const a = Buffer.from(left, "hex");
  const b = Buffer.from(right, "hex");
  if (a.length === 0 || a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function createAdminSessionValue(now = Date.now()): string {
  const issued = String(now);
  const mac = hmacSha256Hex(getAdminSessionSecret(), `${ADMIN_SESSION_PREFIX}:${issued}`);
  return `${ADMIN_SESSION_PREFIX}.${issued}.${mac}`;
}

/**
 * Rejects the legacy spoofable value `"1"` and any unsigned cookie.
 */
export function isValidAdminSessionValue(raw: string | null | undefined, now = Date.now()): boolean {
  const value = String(raw ?? "").trim();
  if (!value || value === "1") return false;

  const parts = value.split(".");
  if (parts.length !== 3 || parts[0] !== ADMIN_SESSION_PREFIX) return false;

  const issuedRaw = parts[1];
  const presentedMac = parts[2];
  if (!/^\d+$/.test(issuedRaw) || !/^[0-9a-f]+$/i.test(presentedMac)) return false;

  const issued = Number(issuedRaw);
  if (!Number.isFinite(issued) || issued <= 0) return false;
  if (now < issued || now - issued > ADMIN_SESSION_TTL_MS) return false;

  const expectedMac = hmacSha256Hex(getAdminSessionSecret(), `${ADMIN_SESSION_PREFIX}:${issuedRaw}`);
  return timingSafeEqualHex(presentedMac.toLowerCase(), expectedMac.toLowerCase());
}

export function adminAuthCookieOptions(maxAgeSeconds: number): {
  name: string;
  value: string;
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  path: "/";
  maxAge: number;
} {
  return {
    name: ADMIN_AUTH_COOKIE,
    value: maxAgeSeconds > 0 ? createAdminSessionValue() : "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSeconds
  };
}
