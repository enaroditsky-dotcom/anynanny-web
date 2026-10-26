import "server-only";

import {
  effectiveManualPaymentMethods,
  enabledMethodsFromLegacyPreferred,
  isManualPaymentMethodUsable,
  parsePayoutEnabledMethods,
  sanitizeManualPaymentDestinations
} from "@/lib/billing/payment-method-availability";
import {
  parentMayReadManualPaymentDestinations,
  parentMayResolveManualPaymentDispute,
  type ManualPaymentDestinations
} from "@/lib/billing/manual-payment-ui";
import {
  parseManualPaymentMethod,
  type ManualPaymentMethod
} from "@/lib/billing/manual-payment-lifecycle";
import { notifySitterManualPaymentResolvedReported } from "@/lib/notifications/create-notification";
import { RATINGS_TABLE } from "@/lib/ratings/constants";
import { SITTER_PROFILES_TABLE, SITTER_PROFILES_USER_COLUMN } from "@/lib/sitter/sitter-profile";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/admin";
import {
  formatIsraeliMobileDisplay,
  isValidIsraeliMobile
} from "@/lib/wallet/sitter-payout-methods";
import type { SupabaseClient } from "@supabase/supabase-js";

export function tryGetSupabaseServiceRoleClient(): SupabaseClient | null {
  try {
    return getSupabaseServiceRoleClient();
  } catch {
    return null;
  }
}

export async function parentHasRatedOwnedBooking(
  supabase: SupabaseClient,
  input: { bookingId: string; parentId: string; sitterId: string }
): Promise<boolean> {
  const bookingId = input.bookingId.trim();
  const parentId = input.parentId.trim();
  const sitterId = input.sitterId.trim();
  if (!bookingId || !parentId || !sitterId) return false;

  const sessions = await supabase
    .from("sessions")
    .select("id")
    .eq("booking_id", bookingId)
    .eq("parent_id", parentId);

  if (sessions.error) {
    console.warn("[parentHasRatedOwnedBooking] sessions", sessions.error.message);
    return false;
  }

  const sessionIds = (sessions.data ?? [])
    .map((row) => String((row as { id?: string }).id ?? "").trim())
    .filter(Boolean);
  if (sessionIds.length === 0) return false;

  const ratings = await supabase
    .from(RATINGS_TABLE)
    .select("id")
    .eq("from_user_id", parentId)
    .eq("to_user_id", sitterId)
    .in("session_id", sessionIds)
    .limit(1)
    .maybeSingle();

  if (ratings.error) {
    console.warn("[parentHasRatedOwnedBooking] ratings", ratings.error.message);
    return false;
  }

  return Boolean(ratings.data?.id);
}

function cashDestination(acceptsCash: boolean): ManualPaymentDestinations["cash"] {
  return { available: acceptsCash };
}

function isMissingEnabledMethodsColumn(message: string): boolean {
  return /payout_enabled_methods/i.test(message);
}

async function loadStoredEnabledMethods(
  admin: SupabaseClient | null,
  sitterId: string
): Promise<{ known: boolean; enabled: ManualPaymentMethod[] | null }> {
  if (!admin || !sitterId) return { known: false, enabled: null };
  const withEnabled = await admin
    .from(SITTER_PROFILES_TABLE)
    .select("payout_enabled_methods, payout_preferred_method")
    .eq(SITTER_PROFILES_USER_COLUMN, sitterId)
    .maybeSingle();
  if (!withEnabled.error) {
    const row = withEnabled.data as {
      payout_enabled_methods?: unknown;
      payout_preferred_method?: string | null;
    } | null;
    if (row && Object.prototype.hasOwnProperty.call(row, "payout_enabled_methods")) {
      return { known: true, enabled: parsePayoutEnabledMethods(row.payout_enabled_methods) };
    }
    return {
      known: true,
      enabled: enabledMethodsFromLegacyPreferred(row?.payout_preferred_method)
    };
  }
  if (!isMissingEnabledMethodsColumn(withEnabled.error.message)) {
    console.warn("[loadStoredEnabledMethods]", withEnabled.error.message);
    return { known: false, enabled: null };
  }
  const legacy = await admin
    .from(SITTER_PROFILES_TABLE)
    .select("payout_preferred_method")
    .eq(SITTER_PROFILES_USER_COLUMN, sitterId)
    .maybeSingle();
  if (legacy.error) {
    console.warn("[loadStoredEnabledMethods]", legacy.error.message);
    return { known: false, enabled: null };
  }
  return {
    known: true,
    enabled: enabledMethodsFromLegacyPreferred(
      (legacy.data as { payout_preferred_method?: string | null } | null)?.payout_preferred_method
    )
  };
}

async function resolveParentManualMethods(input: {
  sitterId: string;
  payload: {
    enabled_methods?: unknown;
    preferred_method?: unknown;
  };
  bitConfigured: boolean;
  payboxConfigured: boolean;
}): Promise<ManualPaymentMethod[]> {
  let known = Object.prototype.hasOwnProperty.call(input.payload, "enabled_methods");
  let enabled: ManualPaymentMethod[] | null = known
    ? parsePayoutEnabledMethods(input.payload.enabled_methods)
    : null;
  if (!known) {
    const loaded = await loadStoredEnabledMethods(tryGetSupabaseServiceRoleClient(), input.sitterId);
    known = loaded.known;
    enabled = loaded.enabled;
  }
  if (!known && input.payload.preferred_method !== undefined) {
    enabled = enabledMethodsFromLegacyPreferred(input.payload.preferred_method);
  }
  return effectiveManualPaymentMethods({
    enabledMethods: enabled,
    bitConfigured: input.bitConfigured,
    payboxConfigured: input.payboxConfigured
  });
}

function bitDestination(
  bitPhone: string,
  include: boolean
): ManualPaymentDestinations["bit"] {
  if (!include || !isValidIsraeliMobile(bitPhone)) return { available: false };
  return { available: true, destination: formatIsraeliMobileDisplay(bitPhone) };
}

function payboxDestination(
  payboxPhone: string,
  include: boolean
): ManualPaymentDestinations["paybox"] {
  if (!include) return { available: false };
  return buildPayboxDestination({ phone: payboxPhone });
}

function buildPayboxDestination(input: {
  phone?: string | null;
}): ManualPaymentDestinations["paybox"] {
  const phone = String(input.phone ?? "").trim();
  if (!isValidIsraeliMobile(phone)) return { available: false };
  return {
    available: true,
    destination: formatIsraeliMobileDisplay(phone)
  };
}

export async function loadAuthorizedManualPaymentDestinations(
  supabase: SupabaseClient,
  input: {
    actorId: string;
    bookingId: string;
  }
): Promise<
  | { ok: true; destinations: ManualPaymentDestinations }
  | { ok: false; status: number; error: string; reason: string }
> {
  const bookingId = String(input.bookingId ?? "").trim();
  const actorId = String(input.actorId ?? "").trim();
  if (!bookingId || !actorId) {
    return { ok: false, status: 400, error: "חסר מזהה הזמנה.", reason: "missing_booking" };
  }

  const booking = await supabase
    .from("bookings")
    .select("id, parent_id, sitter_id, status, payment_status")
    .eq("id", bookingId)
    .eq("parent_id", actorId)
    .maybeSingle();

  if (booking.error) {
    return { ok: false, status: 400, error: booking.error.message, reason: "booking_query" };
  }
  if (!booking.data) {
    return { ok: false, status: 404, error: "ההזמנה לא נמצאה.", reason: "not_owner" };
  }

  const row = booking.data as {
    id: string;
    parent_id: string;
    sitter_id: string;
    status: string | null;
    payment_status: string | null;
  };
  const sitterId = String(row.sitter_id ?? "").trim();
  const hasParentRating = await parentHasRatedOwnedBooking(supabase, {
    bookingId: String(row.id),
    parentId: actorId,
    sitterId
  });

  const gate = parentMayReadManualPaymentDestinations({
    actorId,
    bookingParentId: String(row.parent_id ?? ""),
    bookingStatus: row.status,
    paymentStatus: row.payment_status,
    hasParentRating
  });
  if (!gate.ok) {
    const status = gate.reason === "not_owner" ? 404 : 403;
    const error =
      gate.reason === "parent_rating_required"
        ? "יש לדרג את הבייביסיטר לפני התשלום."
        : gate.reason === "shift_not_completed"
          ? "המשמרת טרם הסתיימה."
          : "אין הרשאה לצפות בפרטי התשלום.";
    return { ok: false, status, error, reason: gate.reason };
  }

  const noneAvailable: ManualPaymentDestinations = {
    bookingId: String(row.id),
    cash: { available: false },
    bit: { available: false },
    paybox: { available: false }
  };

  const rpc = await supabase.rpc("parent_manual_payment_destinations", {
    p_booking_id: bookingId
  });

  if (!rpc.error) {
    const payload = (rpc.data ?? {}) as {
      accepts_cash?: boolean;
      preferred_method?: string | null;
      bit_phone?: string | null;
      paybox_phone?: string | null;
    };
    const bitPhone = String(payload.bit_phone ?? "").trim();
    const payboxPhone = String(payload.paybox_phone ?? "").trim();
    const bitConfigured = isValidIsraeliMobile(bitPhone);
    const payboxConfigured = isValidIsraeliMobile(payboxPhone);
    const methods = await resolveParentManualMethods({
      sitterId,
      payload,
      bitConfigured,
      payboxConfigured
    });
    return {
      ok: true,
      destinations:
        sanitizeManualPaymentDestinations({
          bookingId: String(row.id),
          cash: cashDestination(methods.includes("cash")),
          bit: bitDestination(bitPhone, methods.includes("bit")),
          paybox: payboxDestination(payboxPhone, methods.includes("paybox"))
        }) ?? noneAvailable
    };
  }

  const rpcMessage = String(rpc.error.message ?? "").toLowerCase();
  if (
    rpcMessage.includes("parent rating required") ||
    rpcMessage.includes("shift is not completed") ||
    rpcMessage.includes("not eligible") ||
    rpcMessage.includes("not authorized") ||
    rpcMessage.includes("booking not found")
  ) {
    return {
      ok: false,
      status: 403,
      error:
        rpcMessage.includes("parent rating required")
          ? "יש לדרג את הבייביסיטר לפני התשלום."
          : rpcMessage.includes("shift is not completed")
            ? "המשמרת טרם הסתיימה."
            : "אין הרשאה לצפות בפרטי התשלום.",
      reason: "rpc_denied"
    };
  }

  const admin = tryGetSupabaseServiceRoleClient();
  if (!admin) {
    console.warn(
      "[loadAuthorizedManualPaymentDestinations] destinations RPC unavailable and SUPABASE_SERVICE_ROLE_KEY missing; sitter payment methods hidden"
    );
    return { ok: true, destinations: noneAvailable };
  }

  const payout = await admin
    .from(SITTER_PROFILES_TABLE)
    .select(
      "payout_enabled_methods, payout_preferred_method, payout_bit_phone, payout_paybox_phone"
    )
    .eq(SITTER_PROFILES_USER_COLUMN, sitterId)
    .maybeSingle();

  let payoutRow = payout.data as {
    payout_enabled_methods?: unknown;
    payout_preferred_method?: string | null;
    payout_bit_phone?: string | null;
    payout_paybox_phone?: string | null;
  } | null;
  if (payout.error && isMissingEnabledMethodsColumn(payout.error.message)) {
    const legacy = await admin
      .from(SITTER_PROFILES_TABLE)
      .select("payout_preferred_method, payout_bit_phone, payout_paybox_phone")
      .eq(SITTER_PROFILES_USER_COLUMN, sitterId)
      .maybeSingle();
    if (legacy.error) {
      console.warn("[loadAuthorizedManualPaymentDestinations] payout", legacy.error.message);
      return { ok: true, destinations: noneAvailable };
    }
    const legacyRow = legacy.data as {
      payout_preferred_method?: string | null;
      payout_bit_phone?: string | null;
      payout_paybox_phone?: string | null;
    } | null;
    payoutRow = legacyRow
      ? {
          ...legacyRow,
          payout_enabled_methods: enabledMethodsFromLegacyPreferred(legacyRow.payout_preferred_method)
        }
      : null;
  } else if (payout.error) {
    console.warn("[loadAuthorizedManualPaymentDestinations] payout", payout.error.message);
    return { ok: true, destinations: noneAvailable };
  }

  const bitPhone = String(payoutRow?.payout_bit_phone ?? "").trim();
  const payboxPhone = String(payoutRow?.payout_paybox_phone ?? "").trim();
  const bitConfigured = isValidIsraeliMobile(bitPhone);
  const payboxConfigured = isValidIsraeliMobile(payboxPhone);
  const enabledMethods =
    payoutRow && Object.prototype.hasOwnProperty.call(payoutRow, "payout_enabled_methods")
      ? payoutRow.payout_enabled_methods ?? null
      : enabledMethodsFromLegacyPreferred(payoutRow?.payout_preferred_method);
  const methods = effectiveManualPaymentMethods({
    enabledMethods,
    bitConfigured,
    payboxConfigured
  });

  return {
    ok: true,
    destinations:
      sanitizeManualPaymentDestinations({
        bookingId: String(row.id),
        cash: cashDestination(methods.includes("cash")),
        bit: bitDestination(bitPhone, methods.includes("bit")),
        paybox: payboxDestination(payboxPhone, methods.includes("paybox"))
      }) ?? noneAvailable
  };
}

export function methodHasAuthorizedDestination(
  method: ManualPaymentMethod,
  destinations: ManualPaymentDestinations
): boolean {
  return isManualPaymentMethodUsable(method, destinations);
}

export function parseReportManualPaymentMethod(value: unknown): ManualPaymentMethod | null {
  return parseManualPaymentMethod(value);
}

export function hebrewReportManualPaymentError(message: string): string {
  const raw = String(message ?? "").toLowerCase();
  if (raw.includes("parent rating required")) {
    return "יש לדרג את הבייביסיטר לפני התשלום.";
  }
  if (raw.includes("shift is not completed")) {
    return "המשמרת טרם הסתיימה.";
  }
  if (raw.includes("invalid payment method")) {
    return "אמצעי תשלום לא תקין.";
  }
  if (raw.includes("invalid payment transition")) {
    return "לא ניתן לדווח על תשלום במצב הנוכחי.";
  }
  if (raw.includes("not authorized") || raw.includes("booking not found")) {
    return "אין הרשאה לדווח על תשלום עבור הזמנה זו.";
  }
  return "לא ניתן לדווח שהתשלום בוצע. נסו שוב.";
}

export type ParentResolveManualPaymentDisputeResult =
  | {
      ok: true;
      noop: boolean;
      bookingId: string;
      paymentStatus: string;
      paymentMethod: ManualPaymentMethod | null;
    }
  | {
      ok: false;
      status: number;
      error: string;
    };

function hebrewResolveManualPaymentDisputeError(reasonOrMessage: string): string {
  const raw = String(reasonOrMessage ?? "").toLowerCase();
  if (
    raw === "not_owner" ||
    raw.includes("not authorized") ||
    raw.includes("booking not found")
  ) {
    return "אין הרשאה להסדיר תשלום עבור הזמנה זו.";
  }
  if (
    raw === "processor_rail" ||
    raw === "invalid_method" ||
    raw.includes("invalid payment method")
  ) {
    return "לא ניתן להסדיר תשלום זה. אמצעי התשלום אינו נתמך.";
  }
  if (raw === "invalid_from_status" || raw.includes("invalid payment transition")) {
    return "לא ניתן להסדיר תשלום במצב הנוכחי.";
  }
  if (raw.includes("parent rating required")) {
    return "יש לדרג את הבייביסיטר לפני התשלום.";
  }
  if (raw.includes("shift is not completed")) {
    return "המשמרת טרם הסתיימה.";
  }
  return "לא ניתן להסדיר את התשלום. נסו שוב.";
}

export async function runParentResolveManualPaymentDispute(
  supabase: SupabaseClient,
  input: {
    actorId: string;
    bookingId: string;
  }
): Promise<ParentResolveManualPaymentDisputeResult> {
  const bookingId = String(input.bookingId ?? "").trim();
  const actorId = String(input.actorId ?? "").trim();
  if (!bookingId || !actorId) {
    return { ok: false, status: 400, error: "חסר מזהה הזמנה." };
  }

  const booking = await supabase
    .from("bookings")
    .select(
      "id, parent_id, sitter_id, payment_status, payment_method, payment_rail, parent_resolved_reported_at"
    )
    .eq("id", bookingId)
    .eq("parent_id", actorId)
    .maybeSingle();

  if (booking.error) {
    return { ok: false, status: 400, error: booking.error.message };
  }
  if (!booking.data) {
    return {
      ok: false,
      status: 403,
      error: "אין הרשאה להסדיר תשלום עבור הזמנה זו."
    };
  }

  const row = booking.data as {
    id: string;
    parent_id: string;
    sitter_id: string | null;
    payment_status: string | null;
    payment_method: string | null;
    payment_rail: string | null;
    parent_resolved_reported_at: string | null;
  };

  const gate = parentMayResolveManualPaymentDispute({
    actorId,
    bookingParentId: String(row.parent_id ?? ""),
    paymentStatus: row.payment_status,
    paymentRail: row.payment_rail,
    paymentMethod: row.payment_method
  });

  if (!gate.ok) {
    const status = gate.reason === "not_owner" ? 403 : 400;
    return {
      ok: false,
      status,
      error: hebrewResolveManualPaymentDisputeError(gate.reason)
    };
  }

  if (gate.noop) {
    return {
      ok: true,
      noop: true,
      bookingId,
      paymentStatus: "awaiting_sitter_confirmation",
      paymentMethod: gate.paymentMethod
    };
  }

  const paymentMethod = gate.paymentMethod;
  if (!paymentMethod) {
    return {
      ok: false,
      status: 400,
      error: hebrewResolveManualPaymentDisputeError("invalid_method")
    };
  }

  const rpc = await supabase.rpc("report_manual_payment", {
    p_booking_id: bookingId,
    p_payment_method: paymentMethod
  });

  if (rpc.error) {
    return {
      ok: false,
      status: 400,
      error: hebrewResolveManualPaymentDisputeError(rpc.error.message)
    };
  }

  const payload = (rpc.data ?? {}) as {
    ok?: boolean;
    noop?: boolean;
    payment_status?: string;
  };
  const noop = payload.noop === true;
  const paymentStatus = String(
    payload.payment_status ?? "awaiting_sitter_confirmation"
  ).trim();

  if (!noop) {
    const refreshed = await supabase
      .from("bookings")
      .select("sitter_id, parent_resolved_reported_at")
      .eq("id", bookingId)
      .eq("parent_id", actorId)
      .maybeSingle();
    const sitterId = String(
      (refreshed.data as { sitter_id?: string | null } | null)?.sitter_id ??
        row.sitter_id ??
        ""
    ).trim();
    const resolvedAt = String(
      (refreshed.data as { parent_resolved_reported_at?: string | null } | null)
        ?.parent_resolved_reported_at ??
        row.parent_resolved_reported_at ??
        ""
    ).trim();
    const admin = tryGetSupabaseServiceRoleClient();
    if (sitterId && admin) {
      await notifySitterManualPaymentResolvedReported(admin, {
        sitterId,
        bookingId,
        paymentMethod,
        resolvedAt: resolvedAt || null
      });
    }
  }

  return {
    ok: true,
    noop,
    bookingId,
    paymentStatus,
    paymentMethod
  };
}
