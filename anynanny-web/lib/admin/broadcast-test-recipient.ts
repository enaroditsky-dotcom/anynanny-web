import { isSafetyUuid } from "@/lib/safety/constants";

/** Public parent id of the dedicated Broadcast question test account. */
export const ADMIN_BROADCAST_TEST_PUBLIC_ID = "P-1002";

/** Server-only env var. The value is an auth.users UUID, never the public id. */
export const ADMIN_BROADCAST_TEST_USER_ID_ENV = "ADMIN_BROADCAST_TEST_USER_ID";

export const ADMIN_BROADCAST_TEST_UNAVAILABLE_MESSAGE = "חשבון הבדיקה P-1002 אינו זמין.";

export class BroadcastTestRecipientError extends Error {
  readonly code = "unavailable" as const;

  constructor() {
    super("Broadcast test recipient is unavailable.");
    this.name = "BroadcastTestRecipientError";
  }
}

export type BroadcastTestAccountSnapshot = {
  profileFound: boolean;
  role: string | null;
  parentSerial: string | null;
  suspended: boolean;
  authFound: boolean;
  banned: boolean;
  deleted: boolean;
};

export function isAuthBanActive(bannedUntil: string | null | undefined, now = new Date()): boolean {
  if (bannedUntil == null || String(bannedUntil).trim() === "") return false;
  const at = Date.parse(String(bannedUntil));
  if (!Number.isFinite(at)) return true;
  return at > now.getTime();
}

export function readConfiguredBroadcastTestUserId(
  env: Record<string, string | undefined>
): string {
  const raw = String(env[ADMIN_BROADCAST_TEST_USER_ID_ENV] ?? "").trim();
  if (!isSafetyUuid(raw)) {
    throw new BroadcastTestRecipientError();
  }
  return raw.toLowerCase();
}

function isDedicatedTestParentSerial(raw: string | null): boolean {
  return typeof raw === "string" && raw.trim().toUpperCase() === ADMIN_BROADCAST_TEST_PUBLIC_ID;
}

export function evaluateBroadcastTestAccount(snapshot: BroadcastTestAccountSnapshot): "ok" | "invalid" {
  if (!snapshot.profileFound || !snapshot.authFound) return "invalid";
  if (snapshot.suspended || snapshot.banned || snapshot.deleted) return "invalid";
  if (snapshot.role !== "parent") return "invalid";
  if (!isDedicatedTestParentSerial(snapshot.parentSerial)) return "invalid";
  return "ok";
}

/** Confirms a resolved id is a UUID. A public id such as P-1002 is rejected. */
export function requireDedicatedBroadcastTestUserId(userId: string): string {
  const id = String(userId ?? "").trim().toLowerCase();
  if (!isSafetyUuid(id)) {
    throw new BroadcastTestRecipientError();
  }
  return id;
}

export async function resolveAdminBroadcastTestRecipient(input: {
  env?: Record<string, string | undefined>;
  load: (userId: string) => Promise<BroadcastTestAccountSnapshot>;
}): Promise<string> {
  const userId = readConfiguredBroadcastTestUserId(input.env ?? process.env);
  const snapshot = await input.load(userId);
  if (evaluateBroadcastTestAccount(snapshot) !== "ok") {
    throw new BroadcastTestRecipientError();
  }
  return requireDedicatedBroadcastTestUserId(userId);
}
