import { readExpectedCardcomTerminalNumber } from "@/lib/cardcom/config";
import { creditParentWalletDeposit } from "@/lib/wallet/billing-transactions";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

type CardcomWebhookPayload = Record<string, unknown>;

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function pickString(raw: CardcomWebhookPayload, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

function pickAmount(raw: CardcomWebhookPayload): number {
  const rawAmount = pickString(raw, "Sum", "Amount", "amount", "SumToBill");
  const amount = rawAmount != null ? parseFloat(rawAmount) : NaN;
  return Number.isFinite(amount) ? amount : 0;
}

function isSuccessfulResponseCode(responseCode: string | null): boolean {
  return responseCode === "0" || responseCode === "00";
}

export async function parseCardcomWebhookPayload(request: Request): Promise<CardcomWebhookPayload> {
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return (await request.json().catch(() => ({}))) as CardcomWebhookPayload;
  }

  const text = await request.text();
  if (!text.trim()) return {};

  try {
    return JSON.parse(text) as CardcomWebhookPayload;
  } catch {
    return Object.fromEntries(new URLSearchParams(text).entries()) as CardcomWebhookPayload;
  }
}

async function creditParentWallet(params: {
  parentId: string;
  amount: number;
  transactionId: string | null;
}): Promise<NextResponse> {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const credit = await creditParentWalletDeposit(supabaseAdmin, {
    parentId: params.parentId,
    amount: params.amount,
    description: `טעינת ארנק מוצלח (Cardcom #${params.transactionId ?? "0"})`
  });

  if (credit.error) {
    console.error("[Cardcom Webhook] Failed to credit wallet:", credit.error);
    return NextResponse.json({ error: "Update failed." }, { status: 500 });
  }

  return NextResponse.json({ status: "success", message: "Wallet updated successfully." }, { status: 200 });
}

/** Processes Cardcom LowProfile WebHookUrl callbacks. Does not mark bookings paid. */
export async function handleCardcomPaymentWebhook(request: Request): Promise<NextResponse> {
  try {
    const rawData = await parseCardcomWebhookPayload(request);
    console.log("[Cardcom Webhook] Received payload:", rawData);

    const terminalNumber = pickString(rawData, "TerminalNumber", "terminalNumber", "terminalnumber");
    const responseCode = pickString(rawData, "ResponseCode", "responseCode");
    const amount = pickAmount(rawData);
    const transactionId = pickString(
      rawData,
      "InternalDealNumber",
      "TransactionId",
      "LowProfileId",
      "DealNumber"
    );
    const returnValue = pickString(rawData, "ReturnValue", "returnValue");
    const customFieldParentId =
      pickString(rawData, "customField1") ??
      (rawData.customFields && typeof rawData.customFields === "object"
        ? pickString(rawData.customFields as CardcomWebhookPayload, "customField1")
        : null);

    const expectedTerminal = readExpectedCardcomTerminalNumber();
    if (!expectedTerminal) {
      console.error("[Cardcom Webhook] CARDCOM_TERMINAL_NUMBER is not configured.");
      return NextResponse.json({ error: "Cardcom is not configured." }, { status: 503 });
    }

    if (terminalNumber !== expectedTerminal) {
      console.error(
        `[Cardcom Webhook] Terminal mismatch. Got ${terminalNumber}, expected ${expectedTerminal}`
      );
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    if (!isSuccessfulResponseCode(responseCode)) {
      console.warn(`[Cardcom Webhook] Transaction failed with response code: ${responseCode ?? "unknown"}`);
      return NextResponse.json({ message: "Transaction failure logged." }, { status: 200 });
    }

    if (amount <= 0) {
      console.error("[Cardcom Webhook] Missing or invalid amount:", amount);
      return NextResponse.json({ error: "Incomplete data." }, { status: 400 });
    }

    if (returnValue && isUuid(returnValue)) {
      // V1 shift checkout is Hyp. An unverified Cardcom webhook must not mark a booking paid.
      console.warn("[Cardcom Webhook] Ignoring booking-shaped ReturnValue; booking paid is Hyp-only.", {
        returnValue
      });
      return NextResponse.json(
        { status: "ignored", message: "Cardcom webhook does not mark bookings paid." },
        { status: 200 }
      );
    }

    const parentId = customFieldParentId ?? (returnValue && isUuid(returnValue) ? returnValue : null);
    if (!parentId) {
      console.error("[Cardcom Webhook] Missing parent linkage.", { returnValue });
      return NextResponse.json({ error: "Incomplete data." }, { status: 400 });
    }

    return creditParentWallet({ parentId, amount, transactionId });
  } catch (error) {
    console.error("[Cardcom Webhook] Critical error:", error);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
