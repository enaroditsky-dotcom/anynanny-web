import type { SupabaseClient } from "@supabase/supabase-js";
import { resolvePostAuthPath } from "@/lib/auth/post-auth-destination";
import {
  protectedScreenGate,
  resolveValidAuthUser
} from "@/lib/auth/valid-session";
import type { ProfileRole } from "@/lib/supabase/profiles";

export type HomeRestoreResult =
  | { status: "manual" }
  | { status: "no_client" }
  | { status: "unavailable" }
  | { status: "welcome" }
  | { status: "login"; role: ProfileRole }
  | { status: "navigate"; href: string; activeRole: ProfileRole | null };

function savedPortal(value: string | null): ProfileRole | null {
  return value === "parent" || value === "sitter" ? value : null;
}

/** Role implied by a restored in-app path. Role selection and mismatch write nothing. */
export function activeRoleForRestoredPath(href: string): ProfileRole | null {
  let url: URL;
  try {
    url = new URL(href, "https://anynanny.local");
  } catch {
    return null;
  }
  if (url.origin !== "https://anynanny.local") return null;

  const path = url.pathname;
  const queryRole = url.searchParams.get("role");
  if (
    (path === "/charter" || path.startsWith("/charter/") || path === "/welcome" || path.startsWith("/welcome/")) &&
    (queryRole === "parent" || queryRole === "sitter")
  ) {
    return queryRole;
  }
  if (path === "/parent" || path.startsWith("/parent/") || path === "/checkout" || path.startsWith("/checkout/")) {
    return "parent";
  }
  if (path === "/sitter" || path.startsWith("/sitter/") || path === "/session" || path.startsWith("/session/")) {
    return "sitter";
  }
  return null;
}

/**
 * Cold start at `/`. A missing active_role still validates the Supabase session.
 * Unavailable keeps the session. Manual mode does not read it.
 */
export async function restoreHomeSession(input: {
  manual: boolean;
  supabase: Parameters<typeof resolveValidAuthUser>[0];
  savedRole: string | null;
}): Promise<HomeRestoreResult> {
  if (input.manual) return { status: "manual" };
  if (!input.supabase) return { status: "no_client" };

  const gate = protectedScreenGate(await resolveValidAuthUser(input.supabase));
  if (gate.status === "unavailable") return { status: "unavailable" };
  if (gate.status !== "verified") {
    const role = savedPortal(input.savedRole);
    return role ? { status: "login", role } : { status: "welcome" };
  }

  const requestedRole = savedPortal(input.savedRole);
  const href = await resolvePostAuthPath(input.supabase as SupabaseClient, gate.user.id, null, {
    userEmail: gate.user.email ?? null,
    ...(requestedRole ? { requestedRole } : {})
  });
  return {
    status: "navigate",
    href,
    activeRole: activeRoleForRestoredPath(href)
  };
}
