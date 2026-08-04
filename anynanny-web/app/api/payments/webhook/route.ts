import { handleHypPaymentWebhook } from "@/lib/billing/hyp-payment-webhook";

export const runtime = "nodejs";

/**
 * Public payment-gateway webhook endpoint (HYP / YaadPay IPN).
 * Prefer configuring Hyp dashboard NotifyUrl to this path.
 * Also available at /api/webhooks/hyp for backward compatibility.
 */
export async function POST(request: Request) {
  return handleHypPaymentWebhook(request);
}
