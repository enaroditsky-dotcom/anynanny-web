import { getHypCredentials, type HypCredentials } from "@/lib/billing/hyp/create-transaction";
import { isHypCapturedChargeCCode } from "@/lib/billing/hyp/parse-return-params";

const HYP_FETCH_TIMEOUT_MS = 20_000;

export type OrderedHypParam = { key: string; encodedValue: string };

export type HypVerifyFields = {
  cCode: string | null;
  transId: string | null;
  amount: string | null;
  order: string | null;
  info: string | null;
  moreData: string | null;
  coin: string | null;
  masof: string | null;
  sign: string | null;
};

export type HypVerifyResult =
  | {
      ok: true;
      fields: HypVerifyFields;
      originalQuery: string;
      originalParams: OrderedHypParam[];
      verifyResponse: string;
    }
  | {
      ok: false;
      error: string;
      fields: HypVerifyFields;
      originalQuery: string;
    };

function decodePlus(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, " "));
  } catch {
    return value.replace(/\+/g, " ");
  }
}

/** Parse a Hyp return/IPN query while preserving original parameter order and encodings. */
export function parseOrderedHypQuery(raw: string | null | undefined): OrderedHypParam[] {
  const text = String(raw ?? "")
    .trim()
    .replace(/^\?/, "");
  if (!text) return [];

  const params: OrderedHypParam[] = [];
  for (const part of text.split("&")) {
    if (!part) continue;
    const eq = part.indexOf("=");
    const encodedKey = eq >= 0 ? part.slice(0, eq) : part;
    const encodedValue = eq >= 0 ? part.slice(eq + 1) : "";
    params.push({
      key: decodePlus(encodedKey),
      encodedValue
    });
  }
  return params;
}

export function orderedQueryString(params: OrderedHypParam[]): string {
  return params
    .map((param) => `${encodeURIComponent(param.key)}=${param.encodedValue}`)
    .join("&");
}

function pickOrdered(params: OrderedHypParam[], ...keys: string[]): string | null {
  const wanted = new Set(keys.map((key) => key.toLowerCase()));
  for (const param of params) {
    if (!wanted.has(param.key.toLowerCase())) continue;
    const value = decodePlus(param.encodedValue).trim();
    if (value) return value;
  }
  return null;
}

export function readHypVerifyFields(params: OrderedHypParam[]): HypVerifyFields {
  return {
    cCode: pickOrdered(params, "CCode", "ccode"),
    transId: pickOrdered(params, "Id", "id", "TransId", "TransactionId"),
    amount: pickOrdered(params, "Amount", "amount", "Sum"),
    order: pickOrdered(params, "Order", "order"),
    info: pickOrdered(params, "Info", "info"),
    moreData: pickOrdered(params, "MoreData", "moredata"),
    coin: pickOrdered(params, "Coin", "coin"),
    masof: pickOrdered(params, "Masof", "masof"),
    sign: pickOrdered(params, "Sign")
  };
}

export function hasSufficientHypVerifyPayload(rawQuery: string | null | undefined): boolean {
  const params = parseOrderedHypQuery(rawQuery);
  const fields = readHypVerifyFields(params);
  return Boolean(
    fields.sign &&
      fields.transId &&
      fields.amount &&
      fields.cCode != null &&
      String(fields.cCode).trim() !== ""
  );
}

/**
 * Official Hyp Pay VERIFY prefix, then the complete original success-return query
 * in its original order (including Sign). Credentials are never taken from the payload.
 */
export function buildHypVerifyQuery(
  creds: Pick<HypCredentials, "masof" | "key" | "passP">,
  originalParams: OrderedHypParam[]
): string {
  const prefix: OrderedHypParam[] = [
    { key: "action", encodedValue: "APISign" },
    { key: "What", encodedValue: "VERIFY" },
    { key: "Masof", encodedValue: encodeURIComponent(creds.masof) },
    { key: "KEY", encodedValue: encodeURIComponent(creds.key) },
    { key: "PassP", encodedValue: encodeURIComponent(creds.passP) }
  ];
  return [...prefix, ...originalParams]
    .map((param) => `${encodeURIComponent(param.key)}=${param.encodedValue}`)
    .join("&");
}

function parseCCodeFromBody(body: string): string | null {
  const match = String(body ?? "")
    .trim()
    .replace(/^\?/, "")
    .match(/(?:^|&)CCode=([^&]*)/i);
  if (!match) return null;
  return decodePlus(match[1] ?? "").trim() || null;
}

export type VerifyHypTransactionDeps = {
  fetchImpl?: typeof fetch;
  credentials?: HypCredentials;
};

/**
 * Server-only Hyp Pay APISign What=VERIFY.
 * Original return parameters are appended in their original order.
 */
export async function verifyHypTransaction(
  originalQuery: string,
  deps?: VerifyHypTransactionDeps
): Promise<HypVerifyResult> {
  const originalParams = parseOrderedHypQuery(originalQuery);
  const fields = readHypVerifyFields(originalParams);
  const originalQueryNormalized = originalParams
    .map((param) => `${encodeURIComponent(param.key)}=${param.encodedValue}`)
    .join("&");

  if (!hasSufficientHypVerifyPayload(originalQueryNormalized)) {
    return {
      ok: false,
      error: "Hyp return payload is missing Sign, Id, Amount, or CCode required for VERIFY.",
      fields,
      originalQuery: originalQueryNormalized
    };
  }

  let creds: HypCredentials;
  try {
    creds = deps?.credentials ?? getHypCredentials();
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Hyp credentials are not configured.",
      fields,
      originalQuery: originalQueryNormalized
    };
  }

  const verifyQuery = buildHypVerifyQuery(creds, originalParams);
  const fetchImpl = deps?.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), HYP_FETCH_TIMEOUT_MS);

  let responseText = "";
  try {
    const response = await fetchImpl(`${creds.payBaseUrl}?${verifyQuery}`, {
      method: "GET",
      headers: { Accept: "text/plain,*/*" },
      signal: controller.signal,
      cache: "no-store"
    });
    responseText = await response.text();
    if (!response.ok) {
      return {
        ok: false,
        error: `Hyp VERIFY HTTP ${response.status}`,
        fields,
        originalQuery: originalQueryNormalized
      };
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Hyp VERIFY network error",
      fields,
      originalQuery: originalQueryNormalized
    };
  } finally {
    clearTimeout(timeoutId);
  }

  const verifyCCode = parseCCodeFromBody(responseText);
  if (!isHypCapturedChargeCCode(verifyCCode)) {
    return {
      ok: false,
      error: verifyCCode
        ? `Hyp VERIFY rejected the payload (CCode=${verifyCCode}).`
        : "Hyp VERIFY response missing CCode=0.",
      fields,
      originalQuery: originalQueryNormalized
    };
  }

  if (!isHypCapturedChargeCCode(fields.cCode)) {
    return {
      ok: false,
      error: `Hyp transaction is not a captured charge (CCode=${fields.cCode ?? "missing"}).`,
      fields,
      originalQuery: originalQueryNormalized
    };
  }

  if (!fields.transId) {
    return {
      ok: false,
      error: "Verified Hyp payload is missing transaction Id.",
      fields,
      originalQuery: originalQueryNormalized
    };
  }

  if (!fields.amount) {
    return {
      ok: false,
      error: "Verified Hyp payload is missing Amount.",
      fields,
      originalQuery: originalQueryNormalized
    };
  }

  return {
    ok: true,
    fields,
    originalQuery: originalQueryNormalized,
    originalParams,
    verifyResponse: responseText
  };
}
