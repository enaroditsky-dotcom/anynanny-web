/**
 * Canonical payment-method availability for live AnyNanny settlement.
 *
 * Source of truth for Parent-visible methods:
 *   ManualPaymentDestinations from GET /api/parent/manual-payment-destinations
 *   (authorized booking + completed shift + parent rating).
 *
 * Source of truth for Sitter receiving setup:
 *   SitterPayoutMethods (own payout destinations), validated with the same rules.
 *
 * Live Parent payment actions today: cash (always), Bit, PayBox.
 * Bit/PayBox are usable only when the sitter has a valid destination.
 * Invalid / blank / malformed persisted values are treated as not configured.
 */

import type { ManualPaymentMethod } from "@/lib/billing/manual-payment-lifecycle";
import {
  eligibleManualPaymentMethods,
  type ManualPaymentDestinations
} from "@/lib/billing/manual-payment-ui";
import { parseAuthorizedPayboxPaymentLink } from "@/lib/billing/paybox-payment-link";
import {
  EMPTY_SITTER_PAYOUT_METHODS,
  formatIsraeliMobileDisplay,
  isValidIsraeliMobile,
  payboxManualReceivingConfigured,
  type SitterPayoutMethods
} from "@/lib/wallet/sitter-payout-methods";

export type ParentReceivingMethod = "bit" | "paybox";

export type PaymentMethodAvailabilityFlag = {
  configured: boolean;
  usable: boolean;
};

export type ParentReceivingAvailability = {
  bit: PaymentMethodAvailabilityFlag;
  paybox: PaymentMethodAvailabilityFlag;
};

export const PARENT_NO_DIGITAL_RECEIVING_COPY =
  "לבייביסיטר עדיין לא הוגדר אמצעי לקבלת תשלום.";

export const PARENT_NO_DIGITAL_RECEIVING_SUPPORTING_COPY =
  "אפשר לשלם במזומן. Bit ו-PayBox יופיעו כאן רק אחרי שהבייביסיטר תגדיר אותם.";

export const SITTER_RECEIVING_ACTIVE_LABEL = {
  bit: "Bit מחובר",
  paybox: "PayBox מחובר"
} as const;

export const SITTER_RECEIVING_INACTIVE_LABEL = {
  bit: "Bit לא הוגדר",
  paybox: "PayBox לא הוגדר"
} as const;

export const SITTER_RECEIVING_SETUP_ACTION_LABEL = {
  bit: "הוספת Bit",
  paybox: "הוספת PayBox"
} as const;

/** Parent wallet may show HYP card-on-file setup only. Placeholders are not payment actions. */
export const PARENT_WALLET_SELECTABLE_METHODS = ["credit_card"] as const;

export const PARENT_WALLET_PLACEHOLDER_METHODS = [
  "bit",
  "apple_pay",
  "google_pay",
  "paybox"
] as const;

export function isBitReceivingUsable(phone: string | null | undefined): boolean {
  return isValidIsraeliMobile(String(phone ?? ""));
}

export function isPayboxReceivingUsable(input: {
  phone?: string | null;
  link?: string | null;
}): boolean {
  return (
    isValidIsraeliMobile(String(input.phone ?? "")) ||
    Boolean(parseAuthorizedPayboxPaymentLink(input.link))
  );
}

export function emptyManualPaymentDestinations(
  bookingId = ""
): ManualPaymentDestinations {
  return {
    bookingId,
    cash: { available: true },
    bit: { available: false },
    paybox: { available: false }
  };
}

/**
 * Treat stale / malformed destination payloads as unavailable.
 * Never crash on null or missing payout data.
 */
export function sanitizeManualPaymentDestinations(
  destinations: ManualPaymentDestinations | null | undefined
): ManualPaymentDestinations | null {
  if (!destinations) return null;
  const bookingId = String(destinations.bookingId ?? "").trim();
  const bitPhone = String(destinations.bit?.destination ?? "").trim();
  const payboxPhone = String(destinations.paybox?.destination ?? "").trim();
  const payboxLink = parseAuthorizedPayboxPaymentLink(destinations.paybox?.link);

  return {
    bookingId,
    cash: { available: true },
    bit: isBitReceivingUsable(bitPhone)
      ? { available: true, destination: formatIsraeliMobileDisplay(bitPhone) }
      : { available: false },
    paybox: isPayboxReceivingUsable({ phone: payboxPhone, link: payboxLink })
      ? {
          available: true,
          destination: isValidIsraeliMobile(payboxPhone)
            ? formatIsraeliMobileDisplay(payboxPhone)
            : undefined,
          link: payboxLink ?? undefined
        }
      : { available: false }
  };
}

export function parentReceivingAvailabilityFromDestinations(
  destinations: ManualPaymentDestinations | null | undefined
): ParentReceivingAvailability {
  const sanitized = sanitizeManualPaymentDestinations(destinations);
  const bitUsable = sanitized?.bit.available === true;
  const payboxUsable = sanitized?.paybox.available === true;
  return {
    bit: { configured: bitUsable, usable: bitUsable },
    paybox: { configured: payboxUsable, usable: payboxUsable }
  };
}

export function parentReceivingAvailabilityFromPayoutMethods(
  methods: SitterPayoutMethods | null | undefined
): ParentReceivingAvailability {
  const safe = methods ?? EMPTY_SITTER_PAYOUT_METHODS;
  const bitUsable = isBitReceivingUsable(safe.bitPhone);
  const payboxUsable = payboxManualReceivingConfigured(safe);
  return {
    bit: { configured: bitUsable, usable: bitUsable },
    paybox: { configured: payboxUsable, usable: payboxUsable }
  };
}

export function availableParentReceivingMethods(
  availability: ParentReceivingAvailability
): ParentReceivingMethod[] {
  const methods: ParentReceivingMethod[] = [];
  if (availability.bit.usable) methods.push("bit");
  if (availability.paybox.usable) methods.push("paybox");
  return methods;
}

export function availableParentReceivingMethodsFromDestinations(
  destinations: ManualPaymentDestinations | null | undefined
): ParentReceivingMethod[] {
  return availableParentReceivingMethods(
    parentReceivingAvailabilityFromDestinations(destinations)
  );
}

export function availableParentReceivingMethodsFromPayoutMethods(
  methods: SitterPayoutMethods | null | undefined
): ParentReceivingMethod[] {
  return availableParentReceivingMethods(
    parentReceivingAvailabilityFromPayoutMethods(methods)
  );
}

/** Cash is always a real manual method. Bit/PayBox only when usable for this sitter. */
export function availableManualPaymentMethods(
  destinations: ManualPaymentDestinations | null | undefined
): ManualPaymentMethod[] {
  const availability = parentReceivingAvailabilityFromDestinations(destinations);
  return eligibleManualPaymentMethods({
    bitConfigured: availability.bit.usable,
    payboxConfigured: availability.paybox.usable
  });
}

export function hasUsableDigitalReceivingMethod(
  destinations: ManualPaymentDestinations | null | undefined
): boolean {
  return availableParentReceivingMethodsFromDestinations(destinations).length > 0;
}

export function isManualPaymentMethodUsable(
  method: ManualPaymentMethod | null | undefined,
  destinations: ManualPaymentDestinations | null | undefined
): boolean {
  if (!method) return false;
  if (method === "cash") return true;
  const sanitized = sanitizeManualPaymentDestinations(destinations);
  if (!sanitized) return false;
  if (method === "bit") {
    return sanitized.bit.available === true && Boolean(sanitized.bit.destination);
  }
  if (method === "paybox") {
    return (
      sanitized.paybox.available === true &&
      Boolean(sanitized.paybox.destination || sanitized.paybox.link)
    );
  }
  return false;
}

export function canReportManualPayment(
  method: ManualPaymentMethod | null | undefined,
  destinations: ManualPaymentDestinations | null | undefined
): boolean {
  return isManualPaymentMethodUsable(method, destinations);
}

export function sitterReceivingSetupState(
  methods: SitterPayoutMethods | null | undefined,
  kind: ParentReceivingMethod
): {
  configured: boolean;
  usable: boolean;
  statusLabel: string;
  actionLabel: string;
} {
  const availability = parentReceivingAvailabilityFromPayoutMethods(methods);
  const flag = availability[kind];
  return {
    configured: flag.configured,
    usable: flag.usable,
    statusLabel: flag.configured
      ? SITTER_RECEIVING_ACTIVE_LABEL[kind]
      : SITTER_RECEIVING_INACTIVE_LABEL[kind],
    actionLabel: flag.configured ? "עדכון" : SITTER_RECEIVING_SETUP_ACTION_LABEL[kind]
  };
}

export function sitterReceivingDetailStatus(
  methods: SitterPayoutMethods | null | undefined,
  kind: ParentReceivingMethod
): string {
  const safe = methods ?? EMPTY_SITTER_PAYOUT_METHODS;
  const setup = sitterReceivingSetupState(safe, kind);
  if (!setup.configured) return setup.statusLabel;
  if (kind === "bit") return formatIsraeliMobileDisplay(safe.bitPhone);
  const phone = isValidIsraeliMobile(safe.payboxPhone)
    ? formatIsraeliMobileDisplay(safe.payboxPhone)
    : null;
  const link = parseAuthorizedPayboxPaymentLink(safe.payboxLink);
  if (phone && link) return `${phone} · לינק אישי`;
  if (phone) return phone;
  if (link) return "לינק אישי שמור";
  return setup.statusLabel;
}

export function isParentWalletPlaceholderMethod(id: string): boolean {
  return (PARENT_WALLET_PLACEHOLDER_METHODS as readonly string[]).includes(id);
}
