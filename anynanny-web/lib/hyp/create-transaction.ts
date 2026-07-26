/**
 * Re-export canonical Hyp APISign helper.
 * Prefer importing from `@/lib/billing/hyp/create-transaction`.
 */
export {
  buildHypApiSignEntries as buildHypApiSignParams,
  buildHypApiSignEntries,
  createHypTransaction,
  getHypCredentials,
  isHypConfigured,
  type HypCreateTransactionInput,
  type HypCreateTransactionResult,
  type HypCredentials
} from "@/lib/billing/hyp/create-transaction";

import { createHypTransaction as createHypApiSignTransaction } from "@/lib/billing/hyp/create-transaction";

export type HypCreateInput = {
  sumToBill: number;
  description: string;
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string | null;
  bookingId?: string | null;
};

export type HypCreateResult = { ok: true; url: string } | { ok: false; error: string };

/** Legacy adapter kept for older call sites. */
export async function createHypTransactionCompat(
  input: HypCreateInput
): Promise<HypCreateResult> {
  try {
    const session = await createHypApiSignTransaction({
      bookingId: input.bookingId?.trim() || `legacy_${Date.now()}`,
      amountNis: input.sumToBill,
      successUrl: input.successUrl,
      cancelUrl: input.cancelUrl,
      paymentMethod: "credit_card",
      description: input.description
    });
    return { ok: true, url: session.checkoutUrl };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Hyp connection failed"
    };
  }
}
