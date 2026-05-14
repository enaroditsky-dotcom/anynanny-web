import type { SupabaseClient } from "@supabase/supabase-js";
import { resolvePostAuthPath } from "@/lib/auth/post-auth-destination";

let lastRedirectTarget: string | null = null;
let lastRedirectAt = 0;

export function resetRedirectDedupe() {
  lastRedirectTarget = null;
  lastRedirectAt = 0;
}

function shouldAssignWindow(next: string): boolean {
  if (typeof window === "undefined") return false;
  const path = window.location.pathname;
  if (!path.startsWith("/auth")) return false;
  if (path === next || path.startsWith(`${next}/`)) return false;
  const now = Date.now();
  if (lastRedirectTarget === next && now - lastRedirectAt < 2500) return false;
  lastRedirectTarget = next;
  lastRedirectAt = now;
  return true;
}

/**
 * After login or registration: session is ready — compute destination (role selection,
 * onboarding, or dashboard) and hard-navigate so middleware sees cookies.
 */
export async function navigateAfterAuth(
  supabase: SupabaseClient,
  userId: string,
  nextPath: string | null,
  userEmail?: string | null
): Promise<void> {
  const target = await resolvePostAuthPath(
    supabase,
    userId,
    nextPath,
    userEmail !== undefined ? { userEmail } : undefined
  );
  if (!shouldAssignWindow(target)) return;
  window.location.assign(target);
}
