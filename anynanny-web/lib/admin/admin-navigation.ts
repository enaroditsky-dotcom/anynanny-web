import { isBroadcastAudienceType } from "@/lib/admin/broadcast-audience";

export const ADMIN_LANDING_HREF = "/admin/reports";
export const ADMIN_FOCUS_HASH_KEY = "anynanny.admin.focus-hash";

const ADMIN_PATHS = new Set([
  "/admin/reports",
  "/admin/shift-reviews",
  "/admin/chat-logs",
  "/admin/broadcast"
]);

const QUERY_KEYS = ["composer", "audience", "results", "resultsAudience", "platform"] as const;

export type AdminNavEntry = {
  href: string;
  scrollY: number;
};

export type AdminNavState = {
  stack: AdminNavEntry[];
  current: string | null;
  /** Destination already chosen by Back. Ignore location events until it arrives. */
  pendingHref: string | null;
  pendingScroll: number | null;
};

const listeners = new Set<() => void>();

export function subscribeAdminLocation(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifyAdminLocation(): void {
  for (const listener of listeners) listener();
}

export function emptyAdminNavState(): AdminNavState {
  return { stack: [], current: null, pendingHref: null, pendingScroll: null };
}

function adminPathAndQuery(href: string): string {
  return href.split("#")[0] ?? href;
}

export function adminLandingFallback(currentHref: string | null): string | null {
  const current = currentHref ? canonicalAdminHref(currentHref) : null;
  const path = current?.split(/[?#]/)[0] ?? "";
  if (path === ADMIN_LANDING_HREF) return null;
  return ADMIN_LANDING_HREF;
}

export function canonicalAdminHref(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return null;

  let url: URL;
  try {
    url = new URL(trimmed, "https://admin.invalid");
  } catch {
    return null;
  }
  if (url.origin !== "https://admin.invalid" || url.username || url.password) return null;
  if (!ADMIN_PATHS.has(url.pathname)) return null;

  const params = new URLSearchParams();
  for (const key of QUERY_KEYS) {
    const safe = sanitizeAdminQuery(key, url.searchParams.get(key));
    if (safe) params.set(key, safe);
  }
  const hash = /^#[a-z0-9-]+$/.test(url.hash) ? url.hash : "";
  const qs = params.toString();
  return `${url.pathname}${qs ? `?${qs}` : ""}${hash}`;
}

export function sanitizeAdminQuery(key: string, value: string | null): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 80) return null;
  if (key === "composer") return trimmed === "message" || trimmed === "question" ? trimmed : null;
  if (key === "audience" || key === "resultsAudience") return isBroadcastAudienceType(trimmed) ? trimmed : null;
  if (key === "results") return trimmed === "real" || trimmed === "test" ? trimmed : null;
  if (key === "platform") return trimmed === "whatsapp" || trimmed === "telegram" ? trimmed : null;
  return null;
}

function clampScroll(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(Math.round(value), 100_000);
}

export function recordAdminVisit(state: AdminNavState, rawHref: string, leavingScrollY: number): AdminNavState {
  const next = canonicalAdminHref(rawHref);
  if (!next) return state;
  if (state.pendingHref) {
    const arrived =
      next === state.pendingHref ||
      (adminPathAndQuery(next) === adminPathAndQuery(state.pendingHref) && next !== state.current);
    if (!arrived) return state;
    return { ...state, current: next, pendingHref: null };
  }
  if (state.current == null) {
    return { ...state, current: next, pendingScroll: null };
  }
  if (state.current === next) return state;
  const top = state.stack[state.stack.length - 1];
  if (top?.href === next) {
    return { ...state, stack: state.stack.slice(0, -1), current: next, pendingScroll: null };
  }
  const stack = [...state.stack, { href: state.current, scrollY: clampScroll(leavingScrollY) }].slice(-40);
  return { ...state, stack, current: next, pendingScroll: null };
}

export function prepareAdminBack(state: AdminNavState): {
  state: AdminNavState;
  target: string | null;
  scrollY: number | null;
} {
  const stack = [...state.stack];
  let target: AdminNavEntry | null = null;
  while (stack.length > 0) {
    const entry = stack.pop();
    if (!entry) break;
    const href = canonicalAdminHref(entry.href);
    if (!href || href === state.current) continue;
    target = { href, scrollY: clampScroll(entry.scrollY) };
    break;
  }
  if (!target) {
    return { state: { ...state, stack }, target: null, scrollY: null };
  }
  return {
    state: {
      ...state,
      stack,
      pendingHref: target.href,
      pendingScroll: target.scrollY
    },
    target: target.href,
    scrollY: target.scrollY
  };
}

export function markAdminFallback(state: AdminNavState): AdminNavState {
  return { ...state, pendingHref: ADMIN_LANDING_HREF, pendingScroll: 0 };
}

export function parseAdminNavState(value: unknown): AdminNavState {
  if (!value || typeof value !== "object") return emptyAdminNavState();
  const record = value as Partial<AdminNavState>;
  const stack = Array.isArray(record.stack)
    ? record.stack.flatMap((entry) => {
        if (!entry || typeof entry !== "object") return [];
        const href = canonicalAdminHref(String((entry as AdminNavEntry).href ?? ""));
        const scrollY = clampScroll(Number((entry as AdminNavEntry).scrollY));
        return href ? [{ href, scrollY }] : [];
      })
    : [];
  const current = typeof record.current === "string" ? canonicalAdminHref(record.current) : null;
  const pendingHref = typeof record.pendingHref === "string" ? canonicalAdminHref(record.pendingHref) : null;
  return {
    stack: stack.slice(-40),
    current,
    pendingHref,
    pendingScroll:
      typeof record.pendingScroll === "number" && Number.isFinite(record.pendingScroll)
        ? clampScroll(record.pendingScroll)
        : null
  };
}
