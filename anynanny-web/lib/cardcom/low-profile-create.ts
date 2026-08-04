export const CARDCOM_LOW_PROFILE_CREATE_URL =
  "https://secure.cardcom.solutions/api/v1/LowProfile/Create";

const LOW_PROFILE_CREATE_PATH = "LowProfile/Create";

function stripTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

/**
 * Accepts either a version base (`.../api/v1`) or the full Create endpoint.
 * Always returns `.../LowProfile/Create` without duplicated segments.
 */
export function resolveCardcomCreateUrl(configured?: string | null): string {
  const trimmed = configured?.trim();
  if (!trimmed) return CARDCOM_LOW_PROFILE_CREATE_URL;

  const url = stripTrailingSlashes(trimmed);

  if (/\/LowProfile\/Create$/i.test(url)) {
    return url;
  }

  if (/\/LowProfile$/i.test(url)) {
    return `${url}/Create`;
  }

  if (/\/api\/v\d+$/i.test(url)) {
    return `${url}/${LOW_PROFILE_CREATE_PATH}`;
  }

  return `${url}/${LOW_PROFILE_CREATE_PATH}`;
}

type CardcomCreateInput = {
  terminalNumber: string;
  apiName: string;
  apiPassword: string;
  apiUrl: string;
  sumToBill: number;
  description: string;
  successUrl: string;
  cancelUrl: string;
  returnValue: string;
  customerEmail?: string | null;
  customerName?: string | null;
  webhookUrl?: string | null;
};

export type CardcomCreateResult =
  | {
      ok: true;
      url: string;
      lowProfileId: string | null;
      raw: Record<string, unknown>;
    }
  | {
      ok: false;
      error: string;
      httpStatus?: number;
      raw?: Record<string, unknown>;
      rawText?: string;
    };

export function isCardcomV1ApiUrl(apiUrl: string): boolean {
  return /\/api\/v1\//i.test(apiUrl);
}

function pickString(raw: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function pickResponseCode(raw: Record<string, unknown>): number | null {
  const value = raw.ResponseCode ?? raw.responseCode;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

type CardcomResponseBody = {
  parsed: Record<string, unknown>;
  rawText: string;
};

async function readCardcomResponseBody(response: Response): Promise<CardcomResponseBody> {
  const rawText = await response.text();
  if (!rawText.trim()) {
    return { parsed: {}, rawText };
  }

  try {
    return { parsed: JSON.parse(rawText) as Record<string, unknown>, rawText };
  } catch {
    return { parsed: { Description: rawText.slice(0, 500) }, rawText };
  }
}

function logCardcomFailure(params: {
  apiUrl: string;
  httpStatus: number;
  rawText: string;
  parsed: Record<string, unknown>;
  payloadShape: "v1" | "v11";
}): void {
  console.error("[Cardcom] LowProfile/Create failed", {
    apiUrl: params.apiUrl,
    httpStatus: params.httpStatus,
    payloadShape: params.payloadShape,
    responseCode: params.parsed.ResponseCode ?? params.parsed.responseCode ?? null,
    description: params.parsed.Description ?? params.parsed.description ?? null,
    rawText: params.rawText
  });
}

/** Cardcom REST v1 — nested authentication + transaction blocks (camelCase). */
function buildCardcomV1Payload(input: CardcomCreateInput): Record<string, unknown> {
  const terminalNumber = Number(input.terminalNumber);
  const sumToBill = Math.round(input.sumToBill * 100) / 100;
  const description = input.description.slice(0, 500);
  const returnValue = input.returnValue.slice(0, 250);

  const payload: Record<string, unknown> = {
    authentication: {
      apiName: input.apiName,
      apiPassword: input.apiPassword,
      terminalNumber
    },
    operation: "ChargeOnly",
    returnValue,
    transaction: {
      sumToBill,
      description,
      successUrl: input.successUrl,
      cancelUrl: input.cancelUrl
    }
  };

  if (input.webhookUrl) {
    payload.webHookUrl = input.webhookUrl;
  }

  return payload;
}

/** Cardcom REST v11 — flat PascalCase root fields per official swagger schema. */
function buildCardcomV11Payload(input: CardcomCreateInput): Record<string, unknown> {
  const terminalNumber = Number(input.terminalNumber);
  const amount = Math.round(input.sumToBill * 100) / 100;
  const description = input.description.slice(0, 500);
  const returnValue = input.returnValue.slice(0, 250);

  const payload: Record<string, unknown> = {
    TerminalNumber: terminalNumber,
    ApiName: input.apiName,
    Operation: "ChargeOnly",
    ReturnValue: returnValue,
    Amount: amount,
    SuccessRedirectUrl: input.successUrl,
    FailedRedirectUrl: input.cancelUrl,
    Language: "he",
    ISOCoinId: 1,
    ProductName: description.slice(0, 50)
  };

  if (input.webhookUrl) {
    payload.WebHookUrl = input.webhookUrl;
  }

  const uiDefinition: Record<string, string> = {};
  if (input.customerEmail) uiDefinition.CardOwnerEmailValue = input.customerEmail;
  if (input.customerName) uiDefinition.CardOwnerNameValue = input.customerName.slice(0, 50);
  if (Object.keys(uiDefinition).length > 0) {
    payload.UIDefinition = uiDefinition;
  }

  if (input.apiPassword) {
    payload.AdvancedDefinition = { ApiPassword: input.apiPassword };
  }

  return payload;
}

function buildCardcomPayload(input: CardcomCreateInput, apiUrl: string): Record<string, unknown> {
  return isCardcomV1ApiUrl(apiUrl) ? buildCardcomV1Payload(input) : buildCardcomV11Payload(input);
}

export async function createCardcomLowProfile(input: CardcomCreateInput): Promise<CardcomCreateResult> {
  const configuredUrl = input.apiUrl?.trim() || null;
  const apiUrl = resolveCardcomCreateUrl(input.apiUrl);
  const payloadShape = isCardcomV1ApiUrl(apiUrl) ? "v1" : "v11";
  const payload = buildCardcomPayload(input, apiUrl);

  if (configuredUrl && configuredUrl !== apiUrl) {
    console.info("[Cardcom] Resolved LowProfile/Create URL:", {
      configured: configuredUrl,
      resolved: apiUrl
    });
  }

  let response: Response;
  try {
    response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload),
      cache: "no-store"
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Cardcom request failed.";
    console.error("[Cardcom] LowProfile/Create network error:", message);
    return { ok: false, error: message };
  }

  const { parsed: raw, rawText } = await readCardcomResponseBody(response);

  if (!response.ok) {
    logCardcomFailure({
      apiUrl,
      httpStatus: response.status,
      rawText,
      parsed: raw,
      payloadShape
    });
    const error =
      pickString(raw, "Description", "description", "message", "error", "title") ??
      (response.status === 404
        ? `Cardcom payment endpoint was not found (${apiUrl}). Set CARDCOM_API_URL to the v1 base or full /LowProfile/Create URL.`
        : `Cardcom HTTP ${response.status}.`);
    return { ok: false, error, httpStatus: response.status, raw, rawText };
  }

  const responseCode = pickResponseCode(raw);
  if (responseCode != null && responseCode !== 0) {
    logCardcomFailure({
      apiUrl,
      httpStatus: response.status,
      rawText,
      parsed: raw,
      payloadShape
    });
    const error =
      pickString(raw, "Description", "description", "message") ??
      `Cardcom declined the request (code ${responseCode}).`;
    return { ok: false, error, httpStatus: response.status, raw, rawText };
  }

  const url = pickString(raw, "Url", "url", "PaymentUrl", "paymentUrl", "LowProfileUrl");
  if (!url) {
    logCardcomFailure({
      apiUrl,
      httpStatus: response.status,
      rawText,
      parsed: raw,
      payloadShape
    });
    return {
      ok: false,
      error: "Cardcom did not return a payment page URL.",
      httpStatus: response.status,
      raw,
      rawText
    };
  }

  return {
    ok: true,
    url,
    lowProfileId: pickString(raw, "LowProfileId", "lowProfileId", "LowProfileCode"),
    raw
  };
}
