import { notFound, redirect } from "next/navigation";
import { SESSIONS_TABLE } from "@/lib/session/protocol";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CheckoutClient } from "./checkout-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CheckoutPageProps = {
  params: Promise<{ sessionId: string }>;
};

type SessionOwnershipRow = {
  id: string;
  parent_id: string | null;
};

export default async function CheckoutPage({ params }: CheckoutPageProps) {
  const { sessionId: rawSessionId } = await params;
  const sessionId = String(rawSessionId ?? "").trim();
  if (!sessionId) {
    notFound();
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  // Not authenticated → send to login and come back here afterwards.
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/checkout/${sessionId}`)}`);
  }

  const { data: session, error } = await supabase
    .from(SESSIONS_TABLE)
    .select("id, parent_id")
    .eq("id", sessionId)
    .maybeSingle();

  // Treat a missing session as 404 (don't leak existence to anyone).
  if (error || !session) {
    notFound();
  }

  const row = session as SessionOwnershipRow;

  // Ownership gate: only the parent who owns this session may pay for it.
  if (String(row.parent_id) !== user.id) {
    return (
      <main
        className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-3 bg-[#FDFBF6] p-6 text-center"
        dir="rtl"
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-rose-700/70">403</p>
        <h1 className="text-xl font-bold text-[#001F3F]">אין לך הרשאה לעמוד זה</h1>
        <p className="text-sm text-navy-800/75">התשלום זמין רק להורה שפתח את המשמרת.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-5 bg-[#FDFBF6] p-4" dir="rtl">
      <header className="space-y-1 text-right">
        <h1 className="text-xl font-bold text-[#001F3F]">תשלום עבור המשמרת</h1>
        <p className="text-sm text-navy-800/75">השלמת התשלום מאובטחת באמצעות Stripe.</p>
      </header>

      <CheckoutClient sessionId={sessionId} />
    </main>
  );
}
