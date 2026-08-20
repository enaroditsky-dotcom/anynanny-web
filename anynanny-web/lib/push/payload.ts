import {
  isCanonicalNotificationKind,
  notificationHrefForKind,
  type CanonicalNotificationPayload
} from "@/lib/notifications/kinds";
import { DEFAULT_PUSH_TITLE } from "@/lib/push/constants";

export type PrivacySafePushPayload = {
  title: string;
  body: string;
  url: string;
  notificationId: string;
  kind: string;
  badge?: number;
};

const KIND_BODY: Record<string, string> = {
  booking_request: "יש לך בקשת משמרת חדשה",
  booking_approved: "הנני אישרה את הבקשה שלך",
  booking_rejected: "עודכן סטטוס בקשת המשמרת",
  chat_message: "התקבלה הודעה חדשה ב-AnyNanny",
  broadcast_alert: "AnyNanny Now חדש באזור שלך",
  booking_cancellation_requested: "התקבלה בקשת ביטול למשמרת",
  booking_cancellation_approved: "עודכן סטטוס ביטול המשמרת",
  payment_required: "ממתין לך תשלום עבור המשמרת",
  payment_received: "התשלום עבור המשמרת התקבל",
  confirm_start_required: "נדרש אישור הגעה למשמרת",
  confirm_end_required: "נדרש אישור סיום משמרת",
  rating_required: "נדרש דירוג למשמרת"
};

export function privacySafeBodyForKind(kind: string): string {
  return KIND_BODY[kind] ?? "יש לכם עדכון חדש ב-AnyNanny";
}

export function pushHrefForKind(
  kind: string,
  role: "parent" | "sitter",
  payload: CanonicalNotificationPayload
): string {
  if (kind === "confirm_start_required" || kind === "confirm_end_required") {
    return "/session";
  }
  if (kind === "rating_required") {
    return role === "parent" ? "/parent/dashboard" : "/sitter/dashboard";
  }
  if (isCanonicalNotificationKind(kind)) {
    return notificationHrefForKind(kind, role, payload);
  }
  return role === "parent" ? "/parent/dashboard" : "/sitter/dashboard";
}

export function buildPrivacySafePushPayload(input: {
  notificationId: string;
  kind: string;
  role: "parent" | "sitter";
  payload?: CanonicalNotificationPayload | null;
  badge?: number;
}): PrivacySafePushPayload {
  const kind = String(input.kind ?? "").trim();
  const href = pushHrefForKind(kind, input.role, input.payload ?? {});
  const url = href.startsWith("/") ? href : `/${href}`;
  const result: PrivacySafePushPayload = {
    title: DEFAULT_PUSH_TITLE,
    body: privacySafeBodyForKind(kind),
    url,
    notificationId: String(input.notificationId ?? "").trim(),
    kind
  };
  if (typeof input.badge === "number" && Number.isFinite(input.badge)) {
    result.badge = Math.max(0, Math.floor(input.badge));
  }
  return result;
}
