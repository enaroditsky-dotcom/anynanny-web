import type { ProfileRole } from "@/lib/supabase/profiles";

export function redirectAfterSignIn(
  router: { push: (href: string) => void },
  effectiveRole: ProfileRole,
  nextPath: string | null
) {
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem("active_role", effectiveRole);
    } catch {
      /* ignore */
    }
  }
  const allowedNext =
    nextPath &&
    ((effectiveRole === "parent" && nextPath.startsWith("/parent")) ||
      (effectiveRole === "sitter" && (nextPath === "/session" || nextPath.startsWith("/session/"))));
  const target =
    allowedNext && nextPath ? nextPath : effectiveRole === "parent" ? "/parent/dashboard" : "/session";

  router.push(target);

  /** If soft navigation does not leave `/auth` (stale RSC / cookie timing), force a full load so middleware sees the session. */
  if (typeof window !== "undefined") {
    queueMicrotask(() => {
      if (window.location.pathname.startsWith("/auth")) {
        window.location.assign(target);
      }
    });
  }
}
