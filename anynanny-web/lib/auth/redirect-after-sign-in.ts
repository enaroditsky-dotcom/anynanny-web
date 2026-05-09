import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { ProfileRole } from "@/lib/supabase/profiles";

let lastRedirectTarget: string | null = null;
let lastRedirectAt = 0;

export function resetRedirectDedupe() {
  lastRedirectTarget = null;
  lastRedirectAt = 0;
}

export function redirectAfterSignIn(
  router: { push: (href: string) => void },
  effectiveRole: ProfileRole,
  nextPath: string | null
) {
  const allowedNext =
    nextPath &&
    ((effectiveRole === "parent" && nextPath.startsWith("/parent")) ||
      (effectiveRole === "sitter" && (nextPath === "/session" || nextPath.startsWith("/session/"))));
  const target =
    allowedNext && nextPath ? nextPath : effectiveRole === "parent" ? "/parent/dashboard" : "/session";

  if (typeof window !== "undefined") {
    try {
      localStorage.setItem("active_role", effectiveRole);
    } catch {
      /* ignore */
    }

    const path = window.location.pathname;
    /** Already at destination — skip (breaks redirect/useEffect loops). */
    if (path === target || path.startsWith(`${target}/`)) {
      console.log("[redirectAfterSignIn] skip — already on target", { path, target, effectiveRole });
      return;
    }
    /** Only auto-leave from auth routes (avoid fighting other navigations). */
    if (!path.startsWith("/auth")) {
      console.log("[redirectAfterSignIn] skip — not on /auth", { path, target, effectiveRole });
      return;
    }

    const now = Date.now();
    if (lastRedirectTarget === target && now - lastRedirectAt < 2500) {
      console.log("[redirectAfterSignIn] skip — debounced duplicate", { target, effectiveRole });
      return;
    }
    lastRedirectTarget = target;
    lastRedirectAt = now;

    const supabase = getSupabaseBrowserClient();
    void supabase?.auth.getSession().then(({ data: sessionData }) => {
      console.log("[redirectAfterSignIn]", {
        target,
        effectiveRole,
        pathBefore: path,
        sessionUserId: sessionData?.session?.user?.id ?? null,
        hasSession: !!sessionData?.session
      });
    });
  }

  router.push(target);

  /** If soft navigation does not leave `/auth`, one hard navigation so middleware sees cookies. */
  if (typeof window !== "undefined") {
    queueMicrotask(() => {
      if (window.location.pathname.startsWith("/auth")) {
        console.log("[redirectAfterSignIn] hard-assign — still on /auth after push", { target });
        window.location.assign(target);
      }
    });
  }
}
