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

async function markBookingPaid(params: {
  bookingId: string;
  terminalNumber: string | null;
  transactionId: string | null;
  amount: number;
}): Promise<NextResponse> {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: booking, error: bookingErr } = await supabaseAdmin
    .from("bookings")
    .select("id, status, payment_status, paid_at")
    .eq("id", params.bookingId)
    .maybeSingle();

  if (bookingErr || !booking) {
    console.error(`[Cardcom Webhook] Booking not found for ID: ${params.bookingId}`);
    return NextResponse.json({ error: "Booking linkage not found." }, { status: 404 });
  }

  const row = booking as { payment_status?: string | null; paid_at?: string | null };
  if (row.payment_status === "paid" || row.paid_at) {
    return NextResponse.json({ status: "success", message: "Booking already paid." }, { status: 200 });
  }

  const { error: updateErr } = await supabaseAdmin
    .from("bookings")
    .update({
      payment_status: "paid",
      paid_at: new Date().toISOString(),
      metadata: {
        gateway: "cardcom",
        cardcom_terminal_number: params.terminalNumber,
        cardcom_transaction_id: params.transactionId,
        amount_paid: params.amount
      }
    })
    .eq("id", params.bookingId);

  if (updateErr) {
    console.error("[Cardcom Webhook] Failed to update booking payment state:", updateErr.message);
    return NextResponse.json({ error: "Database transaction update failed." }, { status: 500 });
  }

  console.log(
    `[Cardcom Webhook] Successfully processed booking payment: ${params.bookingId}, transaction: ${params.transactionId ?? "n/a"}`
  );

  return NextResponse.json({ status: "success", message: "Booking payment recorded." }, { status: 200 });
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

/** Processes Cardcom LowProfile WebHookUrl callbacks for shift payments and wallet deposits. */
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
      const bookingPayment = await markBookingPaid({
        bookingId: returnValue,
        terminalNumber,
        transactionId,
        amount
      });
      if (bookingPayment.status !== 404) {
        return bookingPayment;
      }
    }

    const parentId = customFieldParentId ?? (returnValue && isUuid(returnValue) ? returnValue : null);
    if (!parentId) {
      console.error("[Cardcom Webhook] Missing booking or parent linkage.", { returnValue });
      return NextResponse.json({ error: "Incomplete data." }, { status: 400 });
    }

    return creditParentWallet({ parentId, amount, transactionId });
  } catch (error) {
    console.error("[Cardcom Webhook] Critical error:", error);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
