import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AUTH_RETRY_MESSAGE, AUTH_SERVICE_UNAVAILABLE_MESSAGE } from "@/lib/auth/auth-retry";
import { protectedScreenGate, resolveValidAuthUser } from "@/lib/auth/valid-session";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function AuthHold({ message }: { message: string }) {
  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-md items-center justify-center px-4" dir="rtl">
      <p className="text-center text-sm text-slate-600">{message}</p>
    </main>
  );
}

/** Same server gate as the parent dashboard. Onboarding stays on the sitter portal gate. */
export default async function SitterDashboardLayout({ children }: { children: ReactNode }) {
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
    redirect("/auth/login?next=/sitter/dashboard");
  }

  return children;
}
