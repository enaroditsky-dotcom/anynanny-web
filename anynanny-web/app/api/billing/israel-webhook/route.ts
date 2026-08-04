import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { creditParentWalletDeposit } from "@/lib/wallet/billing-transactions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type WebhookPayload = Record<string, unknown>;

function getStringValue(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

function getSupabaseAdmin(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not configured.");
  }

  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

async function readWebhookPayload(request: Request): Promise<WebhookPayload> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const body = await request.json();
    return body && typeof body === "object"
      ? (body as WebhookPayload)
      : {};
  }

  const formData = await request.formData();
  return Object.fromEntries(formData.entries());
}

export async function POST(request: Request) {
  try {
    const rawData = await readWebhookPayload(request);

    console.log("=== Received Cardcom Webhook ===", rawData);

    const terminalNumber =
      getStringValue(rawData.TerminalNumber) ||
      getStringValue(rawData.terminalNumber);

    const responseCode =
      getStringValue(rawData.ResponseCode) ||
      getStringValue(rawData.responseCode);

    const amount = Number.parseFloat(
      getStringValue(rawData.Sum) ||
        getStringValue(rawData.Amount) ||
        getStringValue(rawData.amount) ||
        "0"
    );

    const cardcomInvoiceNumber =
      getStringValue(rawData.InternalDealNumber) ||
      getStringValue(rawData.DocNumber) ||
      "0";

    const customFields =
      rawData.customFields &&
      typeof rawData.customFields === "object"
        ? (rawData.customFields as Record<string, unknown>)
        : null;

    const parentId =
      getStringValue(rawData.customField1) ||
      getStringValue(customFields?.customField1) ||
      getStringValue(rawData.ReturnValue);

    const expectedTerminal = process.env.CARDCOM_TERMINAL_NUMBER;

    if (!expectedTerminal) {
      console.error("CARDCOM_TERMINAL_NUMBER is not configured.");
      return NextResponse.json(
        { error: "Webhook configuration error." },
        { status: 500 }
      );
    }

    if (terminalNumber !== expectedTerminal) {
      console.error(
        `Unauthorized webhook source: terminal mismatch. Got ${terminalNumber}, expected ${expectedTerminal}`
      );

      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    if (responseCode !== "0" && responseCode !== "00") {
      console.warn(
        `Cardcom transaction failed with response code: ${responseCode}`
      );

      return NextResponse.json(
        { message: "Transaction failure logged" },
        { status: 200 }
      );
    }

    if (!parentId || !Number.isFinite(amount) || amount <= 0) {
      console.error("Missing critical webhook data:", {
        parentId,
        amount
      });

      return NextResponse.json(
        { error: "Incomplete data" },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();

    console.log(
      `Processing successful Israeli payment. Parent: ${parentId}, Amount: ₪${amount}`
    );

    const credit = await creditParentWalletDeposit(supabaseAdmin, {
      parentId,
      amount,
      description: `טעינת ארנק מוצלחת (Hyp #${cardcomInvoiceNumber})`
    });

    if (credit.error) {
      console.error(
        "Failed to credit wallet during webhook:",
        credit.error
      );

      return NextResponse.json(
        { error: "Update failed" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        status: "success",
        message: "Wallet updated successfully"
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown webhook error.";

    console.error(
      "Critical error in Israel webhook handler:",
      message
    );

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}