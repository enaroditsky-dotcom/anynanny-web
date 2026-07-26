/**
 * One-off Hyp Pay sandbox smoke: APISign → pay URL (10 NIS).
 * Run: npx tsx scripts/hyp-sandbox-smoke.ts
 *
 * Credentials come from getHypCredentials() (dashboard defaults + process env).
 * No dotenv dependency — set HYP_* in the shell or rely on baked-in demo Masof.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvLocal() {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

async function main() {
  loadEnvLocal();

  const { createHypTransaction, isHypSandboxMode, getHypCredentials } = await import(
    "../lib/billing/hyp/create-transaction"
  );
  const { HYP_SANDBOX_SUCCESS_CARD, HYP_SANDBOX_FAILURE_CARD } = await import(
    "../lib/billing/hyp/sandbox-test-cards"
  );

  const creds = getHypCredentials();
  console.log(
    JSON.stringify({
      sandboxMode: isHypSandboxMode(creds),
      masof: creds.masof,
      successCard: HYP_SANDBOX_SUCCESS_CARD.number,
      failureCardDoNotUse: HYP_SANDBOX_FAILURE_CARD.number
    })
  );

  const result = await createHypTransaction({
    amountNis: 10,
    bookingId: "11111111-2222-4333-8444-555555555555",
    shiftSessionId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    description: "AnyNanny sandbox smoke",
    paymentMethod: "credit_card",
    pageLang: "HEB"
  });

  console.log(
    JSON.stringify({
      ok: true,
      order: result.order,
      hasSignature: /signature=/i.test(result.signedQuery),
      hasUserId: result.signedQuery.includes(HYP_SANDBOX_SUCCESS_CARD.israeliId),
      actionPay: /action=pay/i.test(result.signedQuery),
      urlLen: result.checkoutUrl.length
    })
  );
  console.log("CHECKOUT_URL=" + result.checkoutUrl);
}

main().catch((err) => {
  console.error("SMOKE_FAILED", err instanceof Error ? err.message : err);
  process.exit(1);
});
