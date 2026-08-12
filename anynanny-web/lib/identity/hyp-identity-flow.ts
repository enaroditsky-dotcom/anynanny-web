import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createHypTransaction,
  isHypConfigured
} from "@/lib/billing/hyp/create-transaction";
import {
  interpretHypIdStatus,
  type HypIdStatusOutcome
} from "@/lib/billing/hyp/id-status";
import {
  inquireHypTransaction,
  type HypInquiryLookup
} from "@/lib/billing/hyp/inquire-transactions";
import {
  parseHypReturnParams,
  type HypReturnParams
} from "@/lib/billing/hyp/parse-return-params";
import { fetchHypCardToken, inferCardBrand } from "@/lib/billing/hyp/token";
import {
  fetchIdentityVerification,
  IDENTITY_VERIFICATION_METHOD_CARD_ID_MATCH,
  maskIsraeliId,
  parseIdentityVerificationStatus,
  type IdentityVerificationRecord,
  type IdentityVerificationRole,
  type IdentityVerificationStatus
} from "@/lib/identity/identity-verification";
import { PROFILES_TABLE } from "@/lib/supabase/profiles";
import { isPostgrestSchemaDriftError } from "@/lib/supabase/postgrest-schema";
import { isValidIsraeliId, normalizeIsraeliId } from "@/lib/wallet/sitter-payout-methods";

export const HYP_IDENTITY_VERIFICATION_PREFIX = "IdentityVerification_" as const;
export const IDENTITY_VERIFICATION_CARDS_TABLE = "identity_verification_cards" as const;
export const IDENTITY_VERIFICATION_ATTEMPTS_TABLE = "identity_verification_attempts" as const;

/** J2 card-check still requires Amount on APISign; HYP Pay docs: J5=J2 does not charge. */
const IDENTITY_HYP_AMOUNT_NIS = 1;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type IdentityAttemptRow = {
  id: string;
  user_id: string;
  inquiry_user: string;
};

export function buildHypIdentityVerificationInfo(userId: string): string {
  return `${HYP_IDENTITY_VERIFICATION_PREFIX}${userId.trim()}`;
}

export function parseHypIdentityVerificationUserId(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const value = String(raw).trim();
  const match = /^identityverification[_:-]?([0-9a-f-]{36})$/i.exec(value);
  if (match?.[1] && UUID_RE.test(match[1])) return match[1].toLowerCase();
  for (const part of value.split(/[|,;]/)) {
    const nested = parseHypIdentityVerificationUserId(part.trim());
    if (nested) return nested;
  }
  return null;
}

/** Merchant `user` for inquireTransactions: 1–19 alphanumeric, unique per attempt. */
export function createIdentityInquiryUser(): string {
  const uuid =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
  return `i${uuid.replace(/-/g, "").slice(0, 18)}`;
}

function logIdentity(message: string, extra?: Record<string, unknown>) {
  console.info("[identity-verification]", message, extra ?? {});
}

function pickRaw(raw: Record<string, string>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = raw[key] ?? raw[key.toLowerCase()] ?? raw[key.toUpperCase()];
    if (value != null && String(value).trim()) return String(value).trim();
  }
  return null;
}

function isNumericId(value: string | null | undefined, maxLen = 20): value is string {
  const v = String(value ?? "").trim();
  return /^\d+$/.test(v) && v.length >= 1 && v.length <= maxLen;
}

/**
 * Prefer documented inquireTransactions lookup keys from the completion payload.
 * Never treat HYP Pay `Id` or 23-digit `UID` as Enterprise `cgUid`.
 */
export function resolveIdentityInquiryLookup(
  raw: Record<string, string>,
  inquiryUser: string | null
): HypInquiryLookup | null {
  const cgUid = pickRaw(raw, "cgUid", "CgUid", "CGUid", "cguid");
  if (isNumericId(cgUid, 20)) return { kind: "cgUid", value: cgUid };

  const txId = pickRaw(raw, "txId", "TxId", "txid", "mpiTransactionId", "mpitransactionid");
  if (isNumericId(txId, 20)) return { kind: "tranId", value: txId };

  const user = String(inquiryUser ?? "").trim();
  if (user && user.length <= 19) return { kind: "user", value: user };

  return null;
}

async function loadClientName(
  supabase: SupabaseClient,
  userId: string
): Promise<{ first: string; last: string }> {
  const { data } = await supabase
    .from(PROFILES_TABLE)
    .select("first_name, last_name")
    .eq("id", userId)
    .maybeSingle();
  const first = String((data as { first_name?: unknown } | null)?.first_name ?? "").trim();
  const last = String((data as { last_name?: unknown } | null)?.last_name ?? "").trim();
  return {
    first: first || "AnyNanny",
    last: last || "User"
  };
}

async function insertAttempt(
  supabase: SupabaseClient,
  input: {
    userId: string;
    role: IdentityVerificationRole;
    inquiryUser: string;
    hypInfo: string;
    hypOrder: string;
  }
): Promise<string | null> {
  const { data, error } = await supabase
    .from(IDENTITY_VERIFICATION_ATTEMPTS_TABLE)
    .insert({
      user_id: input.userId,
      role: input.role,
      inquiry_user: input.inquiryUser,
      hyp_info: input.hypInfo,
      hyp_order: input.hypOrder
    })
    .select("id")
    .maybeSingle();
  if (error) {
    const missing =
      isPostgrestSchemaDriftError(error.message) ||
      /Could not find the table/i.test(error.message) ||
      /PGRST205/i.test(error.message);
    logIdentity("attempt insert skipped", {
      userId: input.userId,
      missingTable: missing,
      error: missing ? undefined : error.message
    });
    return null;
  }
  return String((data as { id?: string } | null)?.id ?? "") || null;
}

async function findAttempt(
  supabase: SupabaseClient,
  input: { userId: string; inquiryUser: string | null }
): Promise<IdentityAttemptRow | null> {
  if (input.inquiryUser) {
    const byUser = await supabase
      .from(IDENTITY_VERIFICATION_ATTEMPTS_TABLE)
      .select("id, user_id, inquiry_user")
      .eq("user_id", input.userId)
      .eq("inquiry_user", input.inquiryUser)
      .maybeSingle();
    if (!byUser.error && byUser.data) return byUser.data as IdentityAttemptRow;
  }

  const latest = await supabase
    .from(IDENTITY_VERIFICATION_ATTEMPTS_TABLE)
    .select("id, user_id, inquiry_user")
    .eq("user_id", input.userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latest.error || !latest.data) return null;
  return latest.data as IdentityAttemptRow;
}

async function updateAttempt(
  supabase: SupabaseClient,
  attemptId: string,
  patch: Record<string, unknown>
): Promise<void> {
  const { error } = await supabase
    .from(IDENTITY_VERIFICATION_ATTEMPTS_TABLE)
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", attemptId);
  if (error) {
    logIdentity("attempt update skipped", { error: error.message });
  }
}

export async function startHypIdentityVerification(
  supabase: SupabaseClient,
  input: {
    userId: string;
    role: IdentityVerificationRole;
    successUrl: string;
    cancelUrl: string;
  }
): Promise<{ url: string } | { error: string; status: number }> {
  if (!isHypConfigured()) {
    return { error: "HYP אינו מוגדר בשרת. לא ניתן להתחיל אימות זהות.", status: 503 };
  }

  const loaded = await fetchIdentityVerification(supabase, input.userId, {
    role: input.role
  });
  if (loaded.missingSchema) {
    return { error: "עמודות האימות חסרות במסד הנתונים.", status: 503 };
  }
  if (loaded.error) {
    return { error: loaded.error, status: 400 };
  }

  const idNumber = normalizeIsraeliId(loaded.record.idNumber);
  if (!isValidIsraeliId(idNumber)) {
    return {
      error: "יש לשמור מספר תעודת זהות תקין לפני האימות מול HYP.",
      status: 400
    };
  }

  const name = await loadClientName(supabase, input.userId);
  const info = buildHypIdentityVerificationInfo(input.userId);
  const inquiryUser = createIdentityInquiryUser();

  await insertAttempt(supabase, {
    userId: input.userId,
    role: input.role,
    inquiryUser,
    hypInfo: info,
    hypOrder: inquiryUser
  });

  let hyp: Awaited<ReturnType<typeof createHypTransaction>>;
  try {
    hyp = await createHypTransaction({
      amountNis: IDENTITY_HYP_AMOUNT_NIS,
      bookingId: info,
      orderOverride: inquiryUser,
      fild2: inquiryUser,
      description: "אימות זהות — AnyNanny (HYP/SHVA)",
      paymentMethod: "credit_card",
      pageLang: "HEB",
      userId: idNumber,
      clientName: name.first.slice(0, 50),
      clientLastName: name.last.slice(0, 50),
      successUrl: input.successUrl,
      cancelUrl: input.cancelUrl,
      shiftSessionId: null,
      j5: "J2",
      includeMoreData: true
    });
  } catch (error) {
    logIdentity("APISign failed", {
      userId: input.userId,
      error: error instanceof Error ? error.message : "unknown"
    });
    return {
      error: error instanceof Error ? error.message : "פתיחת אימות HYP נכשלה.",
      status: 502
    };
  }

  const pending = await supabase
    .from(PROFILES_TABLE)
    .update({
      identity_verification_status: "pending",
      updated_at: new Date().toISOString()
    })
    .eq("id", input.userId);

  if (pending.error) {
    return { error: pending.error.message, status: 400 };
  }

  logIdentity("HYP verification initiated", {
    userId: input.userId,
    role: input.role,
    idMasked: maskIsraeliId(idNumber),
    inquiryUser,
    order: hyp.order
  });

  return { url: hyp.checkoutUrl };
}

async function saveIdentityCardToken(
  supabase: SupabaseClient,
  input: {
    userId: string;
    transId: string | null;
    brandHint: string | null;
    idStatusRaw: string | null;
  }
): Promise<void> {
  const transId = String(input.transId ?? "").trim();
  if (!transId) return;

  try {
    const token = await fetchHypCardToken({ transId, allowFalse: true });
    const { error } = await supabase.from(IDENTITY_VERIFICATION_CARDS_TABLE).upsert(
      {
        user_id: input.userId,
        hyp_token: token.token,
        tokef: token.tokef,
        last4: token.last4,
        brand: inferCardBrand(token.last4, input.brandHint),
        hyp_trans_id: token.transId,
        id_status: input.idStatusRaw,
        updated_at: new Date().toISOString()
      },
      { onConflict: "user_id" }
    );
    if (error) {
      const missing =
        isPostgrestSchemaDriftError(error.message) ||
        /Could not find the table/i.test(error.message) ||
        /PGRST205/i.test(error.message);
      logIdentity("token metadata save skipped", {
        userId: input.userId,
        missingTable: missing,
        error: missing ? undefined : error.message
      });
    }
  } catch (error) {
    logIdentity("getToken skipped", {
      userId: input.userId,
      error: error instanceof Error ? error.message : "unknown"
    });
  }
}

function statusFromInquiryOutcome(
  outcome: HypIdStatusOutcome,
  previous: IdentityVerificationRecord
): {
  nextStatus: IdentityVerificationStatus;
  verifiedAt: string | null;
  method: string | null;
} {
  const previouslyVerified = previous.status === "verified" || Boolean(previous.verifiedAt);

  if (outcome === "valid") {
    return {
      nextStatus: "verified",
      verifiedAt: new Date().toISOString(),
      method: IDENTITY_VERIFICATION_METHOD_CARD_ID_MATCH
    };
  }
  if (outcome === "invalid") {
    return {
      nextStatus: "failed",
      verifiedAt: null,
      method: null
    };
  }
  if (previouslyVerified) {
    return {
      nextStatus: "verified",
      verifiedAt: previous.verifiedAt,
      method: previous.method
    };
  }
  return {
    nextStatus: "unverified",
    verifiedAt: null,
    method: null
  };
}

export async function applyHypIdentityVerificationResult(
  supabase: SupabaseClient,
  input: {
    userId: string;
    role?: IdentityVerificationRole;
    parsed: HypReturnParams;
    cancelled?: boolean;
  }
): Promise<{
  record: IdentityVerificationRecord;
  idStatusRaw: string | null;
  idStatusOutcome: HypIdStatusOutcome;
  lookupKind: string | null;
  error?: string;
}> {
  const loaded = await fetchIdentityVerification(supabase, input.userId, {
    role: input.role
  });
  const previous = loaded.record;
  const inquiryUser =
    pickRaw(input.parsed.raw, "Fild2", "fild2", "Order", "order") || null;
  const attempt = await findAttempt(supabase, {
    userId: input.userId,
    inquiryUser
  });
  const resolvedInquiryUser = attempt?.inquiry_user || inquiryUser;
  const lookup = resolveIdentityInquiryLookup(input.parsed.raw, resolvedInquiryUser);

  if (attempt) {
    await updateAttempt(supabase, attempt.id, {
      hyp_pay_id: pickRaw(input.parsed.raw, "Id", "id"),
      hyp_uid: pickRaw(input.parsed.raw, "UID", "uid"),
      hyp_cg_uid: pickRaw(input.parsed.raw, "cgUid", "CgUid", "cguid"),
      hyp_tx_id: pickRaw(input.parsed.raw, "txId", "TxId", "txid"),
      hyp_mpi_transaction_id: pickRaw(input.parsed.raw, "mpiTransactionId", "mpitransactionid"),
      lookup_kind: lookup?.kind ?? null
    });
  }

  let inquiryOutcome: HypIdStatusOutcome = "inconclusive";
  let inquiryRaw: string | null = null;

  if (lookup) {
    const inquiry = await inquireHypTransaction(lookup);
    inquiryOutcome = inquiry.idStatus.outcome;
    inquiryRaw = inquiry.idStatus.raw;
    logIdentity("inquireTransactions result", {
      userId: input.userId,
      lookupKind: lookup.kind,
      ok: inquiry.ok,
      transactionCount: inquiry.transactionCount,
      outcome: inquiryOutcome,
      error: inquiry.error
    });
    if (attempt) {
      await updateAttempt(supabase, attempt.id, {
        id_status: inquiryRaw,
        inquiry_ok: inquiry.ok,
        completed_at: new Date().toISOString()
      });
    }
  } else {
    logIdentity("no inquiry lookup identifier", {
      userId: input.userId,
      cancelled: Boolean(input.cancelled)
    });
  }

  const mapped = statusFromInquiryOutcome(inquiryOutcome, previous);

  const { error } = await supabase
    .from(PROFILES_TABLE)
    .update({
      identity_verification_status: mapped.nextStatus,
      identity_verified_at: mapped.verifiedAt,
      identity_verification_method: mapped.method,
      updated_at: new Date().toISOString()
    })
    .eq("id", input.userId);

  if (error) {
    return {
      record: previous,
      idStatusRaw: inquiryRaw,
      idStatusOutcome: inquiryOutcome,
      lookupKind: lookup?.kind ?? null,
      error: error.message
    };
  }

  if (inquiryOutcome === "valid" || inquiryOutcome === "invalid") {
    await saveIdentityCardToken(supabase, {
      userId: input.userId,
      transId: pickRaw(input.parsed.raw, "Id", "id"),
      brandHint: input.parsed.raw.Brand ?? input.parsed.raw.CardName ?? null,
      idStatusRaw: inquiryRaw
    });
  }

  logIdentity("HYP verification result applied", {
    userId: input.userId,
    idStatusRaw: inquiryRaw,
    outcome: inquiryOutcome,
    nextStatus: mapped.nextStatus,
    lookupKind: lookup?.kind ?? null,
    redirectIdStatusIgnored: interpretHypIdStatus(input.parsed.idStatus ?? input.parsed.raw).raw
  });

  const refreshed = await fetchIdentityVerification(supabase, input.userId, {
    role: input.role
  });

  return {
    record: {
      ...refreshed.record,
      status: parseIdentityVerificationStatus(mapped.nextStatus)
    },
    idStatusRaw: inquiryRaw,
    idStatusOutcome: inquiryOutcome,
    lookupKind: lookup?.kind ?? null
  };
}

export function parseIdentityHypReturnSource(
  source: string | Record<string, string>
): HypReturnParams {
  return parseHypReturnParams(source);
}
