import { getHypCredentials } from "@/lib/billing/hyp/create-transaction";
import {
  parseIdStatusFromInquiryXml,
  type HypIdStatusInterpretation
} from "@/lib/billing/hyp/id-status";

const HYP_FETCH_TIMEOUT_MS = 20_000;

export type HypInquiryLookup =
  | { kind: "cgUid"; value: string }
  | { kind: "tranId"; value: string }
  | { kind: "user"; value: string };

export type HypEnterpriseInquiryCredentials = {
  relayUrl: string;
  user: string;
  password: string;
  terminalNumber: string;
};

function trimEnv(name: string): string {
  return String(process.env[name] ?? "").trim();
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function getHypEnterpriseInquiryCredentials(): HypEnterpriseInquiryCredentials | null {
  const relayUrl = trimEnv("HYP_ENTERPRISE_RELAY_URL");
  let payUser = "";
  let payPass = "";
  let payMasof = "";
  try {
    const payCreds = getHypCredentials();
    payUser = payCreds.user;
    payPass = payCreds.passP;
    payMasof = payCreds.masof;
  } catch {
    // Enterprise-specific env can stand alone.
  }
  const user = trimEnv("HYP_ENTERPRISE_USER") || payUser;
  const password = trimEnv("HYP_ENTERPRISE_PASSWORD") || payPass;
  const terminalNumber = trimEnv("HYP_ENTERPRISE_TERMINAL") || payMasof;
  if (!relayUrl || !user || !password || !terminalNumber) return null;
  return { relayUrl, user, password, terminalNumber };
}

export function isHypEnterpriseInquiryConfigured(): boolean {
  return getHypEnterpriseInquiryCredentials() != null;
}

function extractXmlTag(xml: string, tag: string): string | null {
  const match = xml.match(new RegExp(`<${tag}\\b[^>]*>([^<]*)</${tag}>`, "i"));
  const value = match?.[1]?.trim();
  return value || null;
}

function extractTransactions(xml: string): string[] {
  const blocks: string[] = [];
  const re = /<transaction\b[\s\S]*?<\/transaction>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml))) {
    blocks.push(match[0]);
  }
  return blocks;
}

export type HypInquireTransactionsResult = {
  ok: boolean;
  lookup: HypInquiryLookup;
  resultCode: string | null;
  idStatus: HypIdStatusInterpretation;
  transactionCount: number;
  error?: string;
};

function buildInquireXml(
  terminalNumber: string,
  lookup: HypInquiryLookup
): string {
  const criterion =
    lookup.kind === "cgUid"
      ? `<cgUid>${xmlEscape(lookup.value)}</cgUid>`
      : lookup.kind === "tranId"
        ? `<tranId>${xmlEscape(lookup.value)}</tranId>`
        : `<user>${xmlEscape(lookup.value)}</user>`;

  return [
    "<ashrait>",
    "<request>",
    "<version>2000</version>",
    "<language>ENG</language>",
    "<command>inquireTransactions</command>",
    "<inquireTransactions>",
    `<terminalNumber>${xmlEscape(terminalNumber)}</terminalNumber>`,
    criterion,
    "</inquireTransactions>",
    "</request>",
    "</ashrait>"
  ].join("");
}

function pickMatchingTransaction(
  blocks: string[],
  lookup: HypInquiryLookup
): string | null {
  if (blocks.length === 0) return null;
  if (blocks.length === 1) return blocks[0];

  const needle = lookup.value.toLowerCase();
  const matched = blocks.find((block) => {
    if (lookup.kind === "user") {
      return extractXmlTag(block, "user")?.toLowerCase() === needle;
    }
    if (lookup.kind === "cgUid") {
      return extractXmlTag(block, "cgUid") === lookup.value;
    }
    return extractXmlTag(block, "tranId") === lookup.value;
  });
  return matched ?? blocks[0];
}

/**
 * Server-side HYP Enterprise inquireTransactions.
 * Looks up one identity-verification transaction — never a date-range search.
 */
export async function inquireHypTransaction(
  lookup: HypInquiryLookup
): Promise<HypInquireTransactionsResult> {
  const creds = getHypEnterpriseInquiryCredentials();
  if (!creds) {
    return {
      ok: false,
      lookup,
      resultCode: null,
      idStatus: { raw: null, code: null, outcome: "inconclusive" },
      transactionCount: 0,
      error:
        "HYP Enterprise inquiry is not configured. Set HYP_ENTERPRISE_RELAY_URL plus inquiry user/password/terminal."
    };
  }

  const xml = buildInquireXml(creds.terminalNumber, lookup);
  const body = new URLSearchParams({
    user: creds.user,
    password: creds.password,
    int_in: xml
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), HYP_FETCH_TIMEOUT_MS);
  let responseText = "";
  try {
    const response = await fetch(creds.relayUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/xml,text/xml,text/plain,*/*"
      },
      body: body.toString(),
      signal: controller.signal,
      cache: "no-store"
    });
    responseText = await response.text();
    if (!response.ok) {
      return {
        ok: false,
        lookup,
        resultCode: null,
        idStatus: { raw: null, code: null, outcome: "inconclusive" },
        transactionCount: 0,
        error: `HYP inquireTransactions HTTP ${response.status}`
      };
    }
  } catch (error) {
    return {
      ok: false,
      lookup,
      resultCode: null,
      idStatus: { raw: null, code: null, outcome: "inconclusive" },
      transactionCount: 0,
      error: error instanceof Error ? error.message : "HYP inquireTransactions network error"
    };
  } finally {
    clearTimeout(timeoutId);
  }

  const resultCode = extractXmlTag(responseText, "result");
  const blocks = extractTransactions(responseText);
  const matched = pickMatchingTransaction(blocks, lookup);
  const idStatus = matched
    ? parseIdStatusFromInquiryXml(matched)
    : { raw: null, code: null, outcome: "inconclusive" as const };

  if (resultCode && resultCode !== "000") {
    return {
      ok: false,
      lookup,
      resultCode,
      idStatus,
      transactionCount: blocks.length,
      error: extractXmlTag(responseText, "userMessage") || `HYP inquireTransactions result=${resultCode}`
    };
  }

  if (!matched) {
    return {
      ok: false,
      lookup,
      resultCode,
      idStatus,
      transactionCount: 0,
      error: "HYP inquireTransactions returned no matching transaction."
    };
  }

  return {
    ok: true,
    lookup,
    resultCode,
    idStatus,
    transactionCount: blocks.length
  };
}
