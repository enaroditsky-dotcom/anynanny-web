/**
 * Parse Hyp Pay success/error return (query string or form body).
 * Hyp echoes Info / Order / MoreData from the original APISign request.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COMPACT_UUID_RE = /^[0-9a-f]{32}$/i;

export type HypReturnParams = {
  cCode: string | null;
  isSuccess: boolean;
  bookingId: string | null;
  sessionId: string | null;
  approvalId: string | null;
  amount: string | null;
  order: string | null;
  /**
   * Raw HYP/SHVA Israeli-ID field when present on a redirect.
   * Diagnostic only — identity verification must not treat this as source of truth.
   */
  idStatus: string | null;
  raw: Record<string, string>;
};

function pick(params: URLSearchParams | Record<string, string>, ...keys: string[]): string | null {
  for (const key of keys) {
    if (params instanceof URLSearchParams) {
      const v = params.get(key) ?? params.get(key.toLowerCase()) ?? params.get(key.toUpperCase());
      if (v != null && String(v).trim()) return String(v).trim();
    } else {
      const v = params[key] ?? params[key.toLowerCase()] ?? params[key.toUpperCase()];
      if (v != null && String(v).trim()) return String(v).trim();
    }
  }
  return null;
}

/** Expand 32-char hex (no dashes) back to a UUID string. */
export function expandCompactUuid(value: string): string | null {
  const compact = value.replace(/[^a-f0-9]/gi, "");
  if (!COMPACT_UUID_RE.test(compact)) return null;
  return [
    compact.slice(0, 8),
    compact.slice(8, 12),
    compact.slice(12, 16),
    compact.slice(16, 20),
    compact.slice(20, 32)
  ].join("-");
}

export function normalizeHypUuidCandidate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let v = String(raw).trim();
  if (!v) return null;

  // Info may be "Booking_<uuid>" or bare uuid.
  const bookingPrefixed = /^booking[_:-]?/i.exec(v);
  if (bookingPrefixed) v = v.slice(bookingPrefixed[0].length).trim();

  if (UUID_RE.test(v)) return v.toLowerCase();

  const expanded = expandCompactUuid(v);
  if (expanded) return expanded.toLowerCase();

  return null;
}

export function normalizeHypSessionCandidate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let v = String(raw).trim();
  if (!v) return null;

  const sessionPrefixed = /^session[_:-]?/i.exec(v);
  if (sessionPrefixed) v = v.slice(sessionPrefixed[0].length).trim();

  if (UUID_RE.test(v)) return v.toLowerCase();
  const expanded = expandCompactUuid(v);
  if (expanded) return expanded.toLowerCase();
  return null;
}

/**
 * Hyp Pay captured-charge success.
 * Official status codes: `0` = Approved.
 * `00` is not listed as approved. `600`/`700`/`800` are not captures.
 */
export function isHypCapturedChargeCCode(cCode: string | null | undefined): boolean {
  return String(cCode ?? "").trim() === "0";
}

/** @deprecated Use isHypCapturedChargeCCode. Missing CCode is not success. */
export function isHypSuccessCCode(cCode: string | null | undefined): boolean {
  return isHypCapturedChargeCCode(cCode);
}

export function parseHypReturnParams(
  source: URLSearchParams | Record<string, string> | string
): HypReturnParams {
  let params: URLSearchParams;
  if (typeof source === "string") {
    params = new URLSearchParams(source.replace(/^\?/, ""));
  } else if (source instanceof URLSearchParams) {
    params = source;
  } else {
    params = new URLSearchParams(source);
  }

  const raw: Record<string, string> = {};
  params.forEach((value, key) => {
    raw[key] = value;
  });

  const cCode = pick(params, "CCode", "ccode", "ResponseCode", "responsecode");
  const info = pick(params, "Info", "info");
  const moreData = pick(params, "MoreData", "moredata", "UserData", "userdata");
  const order = pick(params, "Order", "order");
  const bookingIdParam = pick(params, "bookingId", "BookingId", "booking_id");
  const sessionIdParam = pick(params, "shiftSessionId", "sessionId", "SessionId", "session_id");

  const bookingId =
    normalizeHypUuidCandidate(bookingIdParam) ||
    normalizeHypUuidCandidate(info) ||
    normalizeHypUuidCandidate(order);

  const sessionId =
    normalizeHypSessionCandidate(sessionIdParam) ||
    normalizeHypSessionCandidate(moreData) ||
    // MoreData may be "Session_<uuid>|Booking_<uuid>"
    normalizeHypSessionCandidate(
      moreData?.split(/[|,;]/).find((part) => /^session/i.test(part.trim())) ?? null
    );

  return {
    cCode,
    isSuccess: isHypSuccessCCode(cCode),
    bookingId,
    sessionId,
    approvalId: pick(params, "Id", "id", "TransactionId", "ACode"),
    amount: pick(params, "Amount", "amount", "Sum"),
    order,
    idStatus: pick(params, "idStatus", "IdStatus", "IDStatus", "idstatus"),
    raw
  };
}
