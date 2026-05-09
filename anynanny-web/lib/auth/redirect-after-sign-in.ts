import type { ProfileRole } from "@/lib/supabase/profiles";

export function redirectAfterSignIn(
  router: { replace: (href: string) => void },
  effectiveRole: ProfileRole,
  nextPath: string | null
) {
  if (typeof window !== "undefined") {
    localStorage.setItem("active_role", effectiveRole);
  }
  const allowedNext =
    nextPath &&
    ((effectiveRole === "parent" && nextPath.startsWith("/parent")) ||
      (effectiveRole === "sitter" && (nextPath === "/session" || nextPath.startsWith("/session/"))));
  if (allowedNext && nextPath) {
    router.replace(nextPath);
    return;
  }
  router.replace(effectiveRole === "parent" ? "/parent/dashboard" : "/session");
}
