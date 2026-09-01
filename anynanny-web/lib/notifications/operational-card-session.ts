const HIDDEN_KEY_PREFIX = "anynanny_operational_cards_hidden_v1_";
const MINIMIZED_KEY_PREFIX = "anynanny_operational_cards_minimized_v1_";
const ID_CAP = 80;

export function parseOperationalCardIdSet(raw: string | null | undefined): Set<string> {
  if (!raw) return new Set();
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    const ids = parsed
      .map((value) => String(value ?? "").trim())
      .filter(Boolean)
      .slice(-ID_CAP);
    return new Set(ids);
  } catch {
    return new Set();
  }
}

export function serializeOperationalCardIdSet(ids: ReadonlySet<string>): string {
  return JSON.stringify([...ids].slice(-ID_CAP));
}

function readSet(key: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    return parseOperationalCardIdSet(window.sessionStorage.getItem(key));
  } catch {
    return new Set();
  }
}

function writeSet(key: string, ids: ReadonlySet<string>): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(key, serializeOperationalCardIdSet(ids));
  } catch {
    /* ignore quota / private mode */
  }
}

export function operationalCardHiddenStorageKey(userId: string): string {
  return `${HIDDEN_KEY_PREFIX}${userId.trim()}`;
}

export function operationalCardMinimizedStorageKey(userId: string): string {
  return `${MINIMIZED_KEY_PREFIX}${userId.trim()}`;
}

export function readOperationalCardHiddenIds(userId: string): Set<string> {
  const uid = userId.trim();
  if (!uid) return new Set();
  return readSet(operationalCardHiddenStorageKey(uid));
}

export function readOperationalCardMinimizedIds(userId: string): Set<string> {
  const uid = userId.trim();
  if (!uid) return new Set();
  return readSet(operationalCardMinimizedStorageKey(uid));
}

export function writeOperationalCardHiddenIds(userId: string, ids: ReadonlySet<string>): void {
  const uid = userId.trim();
  if (!uid) return;
  writeSet(operationalCardHiddenStorageKey(uid), ids);
}

export function writeOperationalCardMinimizedIds(userId: string, ids: ReadonlySet<string>): void {
  const uid = userId.trim();
  if (!uid) return;
  writeSet(operationalCardMinimizedStorageKey(uid), ids);
}

export function withOperationalCardId(ids: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(ids);
  const trimmed = id.trim();
  if (trimmed) next.add(trimmed);
  return next;
}

export function withoutOperationalCardId(ids: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(ids);
  next.delete(id.trim());
  return next;
}
