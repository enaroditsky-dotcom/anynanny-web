import { handleParentCheckout } from "@/lib/billing/parent-checkout-handler";
import { createServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Parent shift checkout.
 * Uses Hyp Pay APISign (`https://pay.hyp.co.il/p/`) with HYP_TERMINAL_ID / HYP_API_KEY / HYP_PASSP.
 * Session is finalized only after a successful Hyp redirect/webhook — not on button click.
 */
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

    const response = await handleParentCheckout(request, supabase, user);

    if (!response.ok) {
      try {
        const body = (await response.clone().json()) as { error?: string };
        console.error("[checkout] checkout rejected:", {
          status: response.status,
          error: body.error
        });
      } catch (logError) {
        console.error("[checkout] checkout rejected with non-JSON response:", logError);
      }
    }

    return response;
  } catch (error) {
    console.error("[checkout] unhandled error:", error);
    const message = error instanceof Error ? error.message : "Checkout failed.";
    return NextResponse.json({ error: message, gateway: "checkout" }, { status: 500 });
  }
}
