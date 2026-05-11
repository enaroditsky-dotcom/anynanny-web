import type { ProfileRole } from "@/lib/supabase/profiles";

let lastRedirectTarget: string | null = null;
let lastRedirectAt = 0;

export function resetRedirectDedupe() {
  lastRedirectTarget = null;
  lastRedirectAt = 0;
}

/**
 * Full-page navigation only — no Next router.push (avoids fighting middleware).
 * Middleware runs again on the new document request with cookies applied.
 */
export function redirectAfterSignIn(effectiveRole: ProfileRole, nextPath: string | null): void {
  const allowedNext =
    nextPath &&
    ((effectiveRole === "parent" && nextPath.startsWith("/parent")) ||
      (effectiveRole === "sitter" &&
        (nextPath === "/session" ||
          nextPath.startsWith("/session/") ||
          nextPath === "/sitter" ||
          nextPath.startsWith("/sitter/"))));
  const target =
    allowedNext && nextPath ? nextPath : effectiveRole === "parent" ? "/parent/dashboard" : "/sitter/dashboard";

  if (typeof window === "undefined") return;

  try {
    localStorage.setItem("active_role", effectiveRole);
  } catch {
    /* ignore */
  }

  const path = window.location.pathname;
  if (path === target || path.startsWith(`${target}/`)) {
    return;
  }
  if (!path.startsWith("/auth")) {
    return;
  }

  const now = Date.now();
  if (lastRedirectTarget === target && now - lastRedirectAt < 2500) {
    return;
  }
  lastRedirectTarget = target;
  lastRedirectAt = now;

  window.location.assign(target);
}
