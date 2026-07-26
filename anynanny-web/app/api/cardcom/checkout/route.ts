import { handleParentCheckout } from "@/lib/billing/parent-checkout-handler";
import { createServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** Cardcom checkout alias — same handler as `/api/checkout` (Hyp-aware with mock fallback). */
export async function POST(request: Request) {
  try {
    const supabase = createServerClient();
    if (!supabase) {
      return NextResponse.json({ error: "Server client initialization failed." }, { status: 500 });
    }

    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    return await handleParentCheckout(request, supabase, user);
  } catch (error) {
    console.error("[cardcom checkout] unhandled error:", error);
    const message = error instanceof Error ? error.message : "Checkout failed.";
    return NextResponse.json({ error: message, gateway: "cardcom" }, { status: 500 });
  }
}
