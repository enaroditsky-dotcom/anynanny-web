import { isWhatsAppHandoffStatus } from "@/lib/bookings/booking-realtime-handler";

export { isWhatsAppHandoffStatus };

export const WHATSAPP_HANDOFF_LABEL = "מעבר ל-WhatsApp";
export const WHATSAPP_HANDOFF_HINT = "לשיחה, תמונות, וידאו והודעות קוליות";
export const WHATSAPP_HANDOFF_PREFILL = "היי, אני פונה דרך AnyNanny לגבי המשמרת שלנו.";

export function parseWhatsAppBookingId(raw: string | null | undefined): string | null {
  const id = String(raw ?? "").trim();
  if (!id || id.length > 80) return null;
  if (!/^[0-9a-z][0-9a-z_-]{7,79}$/i.test(id)) return null;
  return id;
}

/**
 * Convert a stored Israeli phone to wa.me digits (country code, no plus).
 * Does not mutate or persist the original value.
 */
export function toWhatsAppWaMeDigits(raw: string): string | null {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return null;

  let digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("00")) digits = digits.slice(2);

  if (digits.startsWith("972")) {
    const national = digits.slice(3).replace(/^0+/, "");
    if (national.length < 8 || national.length > 10) return null;
    return `972${national}`;
  }

  if (digits.startsWith("0")) {
    const national = digits.slice(1);
    if (national.length < 8 || national.length > 9) return null;
    return `972${national}`;
  }

  if (digits.length === 9 && digits.startsWith("5")) {
    return `972${digits}`;
  }

  return null;
}

export function buildWhatsAppHandoffUrl(
  phone: string,
  text: string = WHATSAPP_HANDOFF_PREFILL
): string | null {
  const digits = toWhatsAppWaMeDigits(phone);
  if (!digits) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export function hasUsableWhatsAppPhone(phone: string | null | undefined): boolean {
  return Boolean(buildWhatsAppHandoffUrl(String(phone ?? "")));
}

/** If any known status is ineligible, that status wins so WhatsApp can hide immediately. */
export function resolveWhatsAppHandoffStatus(
  ...statuses: Array<string | null | undefined>
): string | null {
  const known = statuses.map((value) => String(value ?? "").trim()).filter(Boolean);
  if (known.length === 0) return null;
  return known.find((status) => !isWhatsAppHandoffStatus(status)) ?? known[0]!;
}
