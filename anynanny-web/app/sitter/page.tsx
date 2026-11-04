import { redirect } from "next/navigation";
import { AUTH_RETRY_MESSAGE, AUTH_SERVICE_UNAVAILABLE_MESSAGE } from "@/lib/auth/auth-retry";
import { getSitterOnboardingGateRedirect, SITTER_DASHBOARD_PATH } from "@/lib/auth/post-auth-destination";
import { loadProductProfileOwnership, roleMismatchHref } from "@/lib/auth/product-profiles";
import { protectedScreenGate, resolveValidAuthUser } from "@/lib/auth/valid-session";
import { createServerClient } from "@/lib/supabase/server";

function AuthHold({ message }: { message: string }) {
  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-md items-center justify-center px-4" dir="rtl">
      <p className="text-center text-sm text-slate-600">{message}</p>
    </main>
  );
}

/** Sitter home — incomplete sitters go to onboarding; others to the dashboard. */
export default async function SitterPage() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return <AuthHold message={AUTH_SERVICE_UNAVAILABLE_MESSAGE} />;
  }

  const supabase = await createServerClient();
  if (!supabase) {
    return <AuthHold message={AUTH_SERVICE_UNAVAILABLE_MESSAGE} />;
  }

  const gate = protectedScreenGate(await resolveValidAuthUser(supabase));
  if (gate.status === "unavailable") {
    return <AuthHold message={`${AUTH_RETRY_MESSAGE} רעננו את הדף כדי לנסות שוב.`} />;
  }
  if (gate.status !== "verified") {
    redirect("/auth/login?next=/sitter");
  }

  const user = gate.user;
  const ownership = await loadProductProfileOwnership(supabase, user.id);
  if (!ownership?.hasSitter) {
    redirect(roleMismatchHref("sitter"));
  }

  const dest = await getSitterOnboardingGateRedirect(supabase, user.id, SITTER_DASHBOARD_PATH);
  redirect(dest ?? SITTER_DASHBOARD_PATH);
}
