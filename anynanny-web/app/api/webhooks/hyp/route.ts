import { handleHypPaymentWebhook } from "@/lib/billing/hyp-payment-webhook";

export const runtime = "nodejs";

/**
 * Hyp (YaadPay) Webhook / IPN Handler (legacy path).
 * Prefer /api/payments/webhook for new Hyp dashboard configuration.
 */
export async function POST(request: Request) {
  return handleHypPaymentWebhook(request);
}
