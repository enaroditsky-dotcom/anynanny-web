import { redirect } from "next/navigation";
import { onboardingUnreadableHref } from "@/lib/auth/onboarding-state";
import { getSitterOnboardingGateRedirect, SITTER_DASHBOARD_PATH } from "@/lib/auth/post-auth-destination";
import { classifyPortalAccess, readProductProfileOwnership, roleMismatchHref } from "@/lib/auth/product-profiles";
import { createServerClient } from "@/lib/supabase/server";

/** Sitter home — incomplete sitters go to onboarding; others to the dashboard. */
export default async function SitterPage() {
  const supabase = await createServerClient();
  if (!supabase) {
    redirect(SITTER_DASHBOARD_PATH);
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(SITTER_DASHBOARD_PATH);
  }

  const read = await readProductProfileOwnership(supabase, user.id);
  const access = classifyPortalAccess(read, "sitter");
  if (access === "unreadable") {
    redirect(onboardingUnreadableHref("sitter"));
  }
  if (access === "unowned") {
    redirect(roleMismatchHref("sitter"));
  }

  const dest = await getSitterOnboardingGateRedirect(supabase, user.id, SITTER_DASHBOARD_PATH);
  redirect(dest ?? SITTER_DASHBOARD_PATH);
}
