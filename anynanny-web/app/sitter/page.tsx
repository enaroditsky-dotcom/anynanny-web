import { redirect } from "next/navigation";
import { getSitterOnboardingGateRedirect, SITTER_DASHBOARD_PATH } from "@/lib/auth/post-auth-destination";
import { loadProductProfileOwnership, roleMismatchHref } from "@/lib/auth/product-profiles";
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

  const ownership = await loadProductProfileOwnership(supabase, user.id);
  if (!ownership?.hasSitter) {
    redirect(roleMismatchHref("sitter"));
  }

  const dest = await getSitterOnboardingGateRedirect(supabase, user.id, SITTER_DASHBOARD_PATH);
  redirect(dest ?? SITTER_DASHBOARD_PATH);
}
