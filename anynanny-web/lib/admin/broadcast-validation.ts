import {
  BROADCAST_CTA_LABEL_MAX_LENGTH,
  BROADCAST_CTA_ROUTE_MAX_LENGTH,
  isInternalBroadcastCtaRoute,
  normalizeBroadcastCtaRoute
} from "@/lib/admin/broadcast-cta";
import {
  BROADCAST_AUDIENCE_LABELS,
  isBroadcastAudienceType,
  type BroadcastAudienceType
} from "@/lib/admin/broadcast-audience";

export const BROADCAST_TITLE_MAX_LENGTH = 80;
export const BROADCAST_BODY_MAX_LENGTH = 2000;
export const BROADCAST_IDEMPOTENCY_KEY_MAX_LENGTH = 80;

const HTML_OR_CONTROL = /[<>\u0000-\u0008\u000B\u000C\u000E-\u001F]/;

export type BroadcastMessageInput = {
  audience: unknown;
  title: unknown;
  body: unknown;
  ctaLabel?: unknown;
  ctaRoute?: unknown;
  idempotencyKey?: unknown;
};

export type ValidatedBroadcastMessage = {
  audience: BroadcastAudienceType;
  audienceLabel: string;
  title: string;
  body: string;
  ctaLabel: string | null;
  ctaRoute: string | null;
  idempotencyKey: string | null;
};

function asPlainText(value: unknown, max: number, field: string): string | { error: string } {
  if (typeof value !== "string") return { error: `${field} is required.` };
  const text = value.replace(/\r\n/g, "\n").trim();
  if (!text) return { error: `${field} is required.` };
  if (text.length > max) return { error: `${field} is too long.` };
  if (HTML_OR_CONTROL.test(text)) return { error: `${field} must be plain text.` };
  return text;
}

function asOptionalPlainText(
  value: unknown,
  max: number,
  field: string
): string | null | { error: string } {
  if (value == null) return null;
  if (typeof value !== "string") return { error: `${field} is invalid.` };
  const text = value.replace(/\r\n/g, "\n").trim();
  if (!text) return null;
  if (text.length > max) return { error: `${field} is too long.` };
  if (HTML_OR_CONTROL.test(text)) return { error: `${field} must be plain text.` };
  return text;
}

export function validateBroadcastMessage(input: BroadcastMessageInput):
  | { ok: true; value: ValidatedBroadcastMessage }
  | { ok: false; error: string } {
  if (!isBroadcastAudienceType(input.audience)) {
    return { ok: false, error: "Invalid audience." };
  }

  const title = asPlainText(input.title, BROADCAST_TITLE_MAX_LENGTH, "Title");
  if (typeof title !== "string") return { ok: false, error: "נא להזין כותרת תקינה." };
  if (title.includes("\n")) return { ok: false, error: "הכותרת חייבת להיות בשורה אחת." };

  const body = asPlainText(input.body, BROADCAST_BODY_MAX_LENGTH, "Body");
  if (typeof body !== "string") return { ok: false, error: "נא להזין הודעה תקינה." };

  const ctaLabel = asOptionalPlainText(input.ctaLabel, BROADCAST_CTA_LABEL_MAX_LENGTH, "CTA label");
  if (ctaLabel && typeof ctaLabel !== "string") {
    return { ok: false, error: "תווית ה-CTA אינה תקינה." };
  }

  const rawRoute = asOptionalPlainText(input.ctaRoute, BROADCAST_CTA_ROUTE_MAX_LENGTH, "CTA route");
  if (rawRoute && typeof rawRoute !== "string") {
    return { ok: false, error: "נתיב ה-CTA אינו תקין." };
  }

  const hasLabel = Boolean(ctaLabel);
  const hasRoute = Boolean(rawRoute);
  if (hasLabel !== hasRoute) {
    return { ok: false, error: "יש למלא גם תווית וגם נתיב פנימי ל-CTA, או להשאיר את שניהם ריקים." };
  }

  let ctaRoute: string | null = null;
  if (typeof rawRoute === "string" && rawRoute) {
    if (!isInternalBroadcastCtaRoute(rawRoute)) {
      return { ok: false, error: "נתיב ה-CTA חייב להיות נתיב פנימי של AnyNanny בלבד." };
    }
    ctaRoute = normalizeBroadcastCtaRoute(rawRoute);
  }

  let idempotencyKey: string | null = null;
  if (input.idempotencyKey != null && String(input.idempotencyKey).trim()) {
    const key = String(input.idempotencyKey).trim();
    if (key.length > BROADCAST_IDEMPOTENCY_KEY_MAX_LENGTH) {
      return { ok: false, error: "Invalid idempotency key." };
    }
    if (!/^[A-Za-z0-9:_-]+$/.test(key)) {
      return { ok: false, error: "Invalid idempotency key." };
    }
    idempotencyKey = key;
  }

  return {
    ok: true,
    value: {
      audience: input.audience,
      audienceLabel: BROADCAST_AUDIENCE_LABELS[input.audience],
      title,
      body,
      ctaLabel: typeof ctaLabel === "string" ? ctaLabel : null,
      ctaRoute,
      idempotencyKey
    }
  };
}

export function broadcastConfirmMessage(recipientCount: number): string {
  return `את/ה עומד/ת לשלוח הודעה ל-${recipientCount} משתמשים. לא ניתן לבטל הודעות שכבר נשלחו. להמשיך?`;
}

export function broadcastSendButtonLabel(recipientCount: number): string {
  return `שליחה ל-${recipientCount} משתמשים`;
}
