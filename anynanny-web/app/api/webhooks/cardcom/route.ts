import { handleCardcomPaymentWebhook } from "@/lib/cardcom/handle-payment-webhook";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleCardcomPaymentWebhook(request);
}
