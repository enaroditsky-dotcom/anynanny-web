import { handleParentCheckout } from "@/lib/billing/parent-checkout-handler";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Parent shift checkout — mock gateway mode.
 * Cardcom/Hyp integrations are frozen; this route validates the parent session,
 * applies the 10% platform fee split, and returns a simulated success payload.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient(request);
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
        console.error("[checkout] mock checkout rejected:", {
          status: response.status,
          error: body.error
        });
      } catch (logError) {
        console.error("[checkout] mock checkout rejected with non-JSON response:", logError);
      }
    }

    return response;
  } catch (error) {
    console.error("[checkout] unhandled error:", error);
    const message = error instanceof Error ? error.message : "Checkout failed.";
    return NextResponse.json({ error: message, gateway: "mock" }, { status: 500 });
  }
}
