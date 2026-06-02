"use client";

/** Discriminated result for `chargeSession` — UI branches on `ok` without try/catch. */
export type ChargeSessionResult =
  | {
      ok: true;
      paymentIntentId: string | null;
      status: string;
      amountNis: number | null;
      amountMinorUnits: number | null;
      totalMinutes: number | null;
      hourlyRate: number | null;
      paidAt: string | null;
      alreadyPaid: boolean;
      raw: Record<string, unknown>;
    }
  | {
      ok: false;
      code: string;
      message: string;
      httpStatus: number;
      /** Stripe action required (e.g. 3DS) — present when API returned 402 with a client_secret. */
      clientSecret?: string | null;
      paymentIntentId?: string | null;
      paymentIntentStatus?: string | null;
      stripeCode?: string | null;
      declineCode?: string | null;
      raw?: unknown;
    };

type ApiErrorPayload = {
  error?: {
    code?: string;
    message?: string;
    clientSecret?: string | null;
    paymentIntentId?: string | null;
    paymentIntentStatus?: string | null;
    stripeCode?: string | null;
    declineCode?: string | null;
  };
};

type ApiSuccessPayload = {
  ok?: boolean;
  alreadyPaid?: boolean;
  paymentIntentId?: string | null;
  status?: string | null;
  amountNis?: number | null;
  amountMinorUnits?: number | null;
  totalMinutes?: number | null;
  hourlyRate?: number | null;
  paidAt?: string | null;
  amount?: number | null;
};

function pickString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function pickNumber(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** POST to `/api/stripe/charge-session` and return a discriminated result. Never throws. */
export async function chargeSession(sessionId: string): Promise<ChargeSessionResult> {
  const trimmed = String(sessionId ?? "").trim();
  if (!trimmed) {
    return {
      ok: false,
      code: "missing_session_id",
      message: "sessionId is required.",
      httpStatus: 0
    };
  }

  let res: Response;
  try {
    res = await fetch("/api/stripe/charge-session", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ sessionId: trimmed }),
      credentials: "same-origin",
      cache: "no-store"
    });
  } catch (err) {
    return {
      ok: false,
      code: "network_error",
      message: err instanceof Error ? err.message : "Network request failed.",
      httpStatus: 0,
      raw: err
    };
  }

  let body: unknown = null;
  try {
    const text = await res.text();
    body = text ? JSON.parse(text) : null;
  } catch (err) {
    return {
      ok: false,
      code: "invalid_response",
      message: "Could not parse server response.",
      httpStatus: res.status,
      raw: err
    };
  }

  if (!res.ok) {
    const payload = (body ?? {}) as ApiErrorPayload;
    const errBlock = payload.error ?? {};
    return {
      ok: false,
      code: pickString(errBlock.code, `http_${res.status}`),
      message: pickString(
        errBlock.message,
        res.status === 402
          ? "Card declined. Try a different payment method."
          : `Request failed (${res.status}).`
      ),
      httpStatus: res.status,
      clientSecret: errBlock.clientSecret ?? null,
      paymentIntentId: errBlock.paymentIntentId ?? null,
      paymentIntentStatus: errBlock.paymentIntentStatus ?? null,
      stripeCode: errBlock.stripeCode ?? null,
      declineCode: errBlock.declineCode ?? null,
      raw: body
    };
  }

  const payload = (body ?? {}) as ApiSuccessPayload;
  const alreadyPaid = payload.alreadyPaid === true;

  return {
    ok: true,
    paymentIntentId: payload.paymentIntentId ?? null,
    status: pickString(payload.status, alreadyPaid ? "succeeded" : "unknown"),
    amountNis: pickNumber(payload.amountNis ?? payload.amount),
    amountMinorUnits: pickNumber(payload.amountMinorUnits),
    totalMinutes: pickNumber(payload.totalMinutes),
    hourlyRate: pickNumber(payload.hourlyRate),
    paidAt: typeof payload.paidAt === "string" ? payload.paidAt : null,
    alreadyPaid,
    raw: (body ?? {}) as Record<string, unknown>
  };
}
