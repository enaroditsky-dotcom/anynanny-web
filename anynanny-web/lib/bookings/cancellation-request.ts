import type { SupabaseClient } from "@supabase/supabase-js";
import type { BookingPaymentStatus, BookingStatus } from "@/lib/bookings/constants";
import { normalizeBookingStatus, type BookingStatusInput } from "@/lib/bookings/booking-status-normalize";
import { isPostgrestMissingColumnError, readSupabaseErrorMessage } from "@/lib/supabase/postgrest-schema";

export const CANCELLATION_MESSAGE_MAX_LENGTH = 500;

export const BOOKING_CANCELLATION_SELECT =
  "cancellation_requested_by, cancellation_requested_role, cancellation_requested_at, cancellation_message, cancellation_approved_by, cancellation_approved_at, cancelled_by, cancelled_at, cancellation_acknowledged_at" as const;

export const CANCELLATION_COPY = {
  requestButton: "בקשת ביטול",
  requestPending: "בקשת ביטול ממתינה",
  modalTitle: "בקשת ביטול משמרת",
  explanation: "ניתן לצרף הודעה קצרה לצד השני עם הסיבה לבקשת הביטול.",
  messageLabel: "הודעה לצד השני",
  messagePlaceholder: "כתבו בקצרה מדוע אתם מבקשים לבטל את המשמרת...",
  back: "חזרה",
  submit: "שליחת בקשת ביטול",
  submitting: "שולחים בקשה…",
  receivedHeading: "בקשת ביטול התקבלה",
  incomingTitle: "בקשת ביטול משמרת התקבלה",
  later: "לא עכשיו",
  approve: "אישור הביטול",
  approveConfirmTitle: "לאשר את ביטול המשמרת?",
  approveConfirm: "כן, לאשר ביטול",
  approving: "מאשרים ביטול…",
  parentProfile: "פרופיל ההורה",
  sitterProfile: "פרופיל שמרטפית",
  contact: "צור קשר",
  cancelledByParent: "משמרת בוטלה לבקשת ההורה",
  cancelledBySitter: "משמרת בוטלה לבקשת הנני",
  messageHistoryLabel: "הודעת הביטול",
  roleParent: "ההורה",
  roleSitter: "הנני",
  approvedTitle: "ביטול המשמרת אושר",
  approvedBody: "בקשתך לביטול המשמרת אושרה.",
  closeHint: "לסגירה לחצו על X",
  acknowledging: "מעדכנים…"
} as const;

export type CancellationRequesterRole = "parent" | "sitter";

export type BookingCancellationFields = {
  cancellationRequestedBy: string | null;
  cancellationRequestedRole: CancellationRequesterRole | null;
  cancellationRequestedAt: string | null;
  cancellationMessage: string | null;
  cancellationApprovedBy: string | null;
  cancellationApprovedAt: string | null;
  cancelledBy: string | null;
  cancelledAt: string | null;
  cancellationAcknowledgedAt: string | null;
};

export type CancellationShiftLike = {
  id: string;
  status: BookingStatus | string;
  bookingDate: string;
  startTime: string;
  endTime: string;
  partnerName?: string;
  paymentStatus?: BookingPaymentStatus | null;
} & Partial<BookingCancellationFields>;

export type CancellationRpcState =
  | "requested"
  | "already_pending"
  | "pending_from_other"
  | "already_cancelled"
  | "cancelled"
  | "acknowledged"
  | "already_acknowledged";

export type CancellationRpcResult =
  | { ok: true; state: CancellationRpcState }
  | { ok: false; error: string };

const EMPTY_CANCELLATION_FIELDS: BookingCancellationFields = {
  cancellationRequestedBy: null,
  cancellationRequestedRole: null,
  cancellationRequestedAt: null,
  cancellationMessage: null,
  cancellationApprovedBy: null,
  cancellationApprovedAt: null,
  cancelledBy: null,
  cancelledAt: null,
  cancellationAcknowledgedAt: null
};

export function sanitizeCancellationMessage(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const stripped = String(raw)
    .replace(/<[^>]*>/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!stripped) return null;
  return stripped.slice(0, CANCELLATION_MESSAGE_MAX_LENGTH);
}

export function parseCancellationRequesterRole(
  value: unknown
): CancellationRequesterRole | null {
  return value === "parent" || value === "sitter" ? value : null;
}

export function pickCancellationFields(row: Record<string, unknown> | null | undefined): BookingCancellationFields {
  if (!row) return { ...EMPTY_CANCELLATION_FIELDS };
  const requestedBy = typeof row.cancellation_requested_by === "string" ? row.cancellation_requested_by.trim() : "";
  const approvedBy = typeof row.cancellation_approved_by === "string" ? row.cancellation_approved_by.trim() : "";
  const cancelledBy = typeof row.cancelled_by === "string" ? row.cancelled_by.trim() : "";
  const message = sanitizeCancellationMessage(
    typeof row.cancellation_message === "string" ? row.cancellation_message : null
  );
  return {
    cancellationRequestedBy: requestedBy || null,
    cancellationRequestedRole: parseCancellationRequesterRole(row.cancellation_requested_role),
    cancellationRequestedAt:
      typeof row.cancellation_requested_at === "string" ? row.cancellation_requested_at : null,
    cancellationMessage: message,
    cancellationApprovedBy: approvedBy || null,
    cancellationApprovedAt:
      typeof row.cancellation_approved_at === "string" ? row.cancellation_approved_at : null,
    cancelledBy: cancelledBy || null,
    cancelledAt: typeof row.cancelled_at === "string" ? row.cancelled_at : null,
    cancellationAcknowledgedAt:
      typeof row.cancellation_acknowledged_at === "string" ? row.cancellation_acknowledged_at : null
  };
}

export function isScheduledShiftCancellable(
  shift: Pick<CancellationShiftLike, "status" | "paymentStatus">
): boolean {
  const status =
    normalizeBookingStatus(shift.status as BookingStatusInput) ??
    String(shift.status ?? "").trim().toLowerCase();
  if (status !== "approved") return false;
  if (shift.paymentStatus === "paid") return false;
  return true;
}

export function isCancellationRequestPending(
  shift: Pick<CancellationShiftLike, "status" | "cancellationRequestedBy" | "cancelledAt">
): boolean {
  if (!isScheduledShiftCancellable(shift)) return false;
  if (shift.cancelledAt) return false;
  return Boolean(shift.cancellationRequestedBy);
}

export function isOutgoingCancellationRequest(
  shift: CancellationShiftLike,
  viewerUserId: string | null | undefined
): boolean {
  if (!viewerUserId || !isCancellationRequestPending(shift)) return false;
  return shift.cancellationRequestedBy === viewerUserId;
}

export function isIncomingCancellationRequest(
  shift: CancellationShiftLike,
  viewerUserId: string | null | undefined
): boolean {
  if (!viewerUserId || !isCancellationRequestPending(shift)) return false;
  return shift.cancellationRequestedBy !== viewerUserId;
}

export function isIncomingPendingCancellation(
  shift: Pick<
    CancellationShiftLike,
    "status" | "cancellationRequestedBy" | "cancellationRequestedAt" | "cancelledAt"
  >,
  viewerUserId: string | null | undefined
): boolean {
  if (!viewerUserId) return false;
  const status =
    normalizeBookingStatus(shift.status as BookingStatusInput) ??
    String(shift.status ?? "").trim().toLowerCase();
  if (status !== "approved") return false;
  if (!shift.cancellationRequestedBy || shift.cancellationRequestedBy === viewerUserId) return false;
  if (!shift.cancellationRequestedAt) return false;
  if (shift.cancelledAt) return false;
  return true;
}

export function isUnacknowledgedApprovedCancellation(
  shift: Pick<
    CancellationShiftLike,
    "status" | "cancelledAt" | "cancellationRequestedBy" | "cancellationAcknowledgedAt"
  >,
  viewerUserId: string | null | undefined
): boolean {
  if (!viewerUserId) return false;
  const status =
    normalizeBookingStatus(shift.status as BookingStatusInput) ??
    String(shift.status ?? "").trim().toLowerCase();
  if (status !== "cancelled") return false;
  if (!shift.cancelledAt) return false;
  if (shift.cancellationRequestedBy !== viewerUserId) return false;
  if (shift.cancellationAcknowledgedAt) return false;
  return true;
}

export function isTemporarilyVisibleCancelledShift(
  shift: Pick<
    CancellationShiftLike,
    "status" | "cancelledAt" | "cancellationRequestedBy" | "cancellationAcknowledgedAt"
  >,
  viewerUserId: string | null | undefined
): boolean {
  return isUnacknowledgedApprovedCancellation(shift, viewerUserId);
}

export function needsCancellationAttention(
  shift: CancellationShiftLike,
  viewerUserId: string | null | undefined
): boolean {
  return (
    isIncomingPendingCancellation(shift, viewerUserId) ||
    isUnacknowledgedApprovedCancellation(shift, viewerUserId)
  );
}

export function cancellationRoleLabel(
  role: CancellationRequesterRole | null | undefined
): string {
  if (role === "sitter") return CANCELLATION_COPY.roleSitter;
  return CANCELLATION_COPY.roleParent;
}

export function incomingCancellationSentence(
  shift: Pick<CancellationShiftLike, "bookingDate" | "startTime" | "endTime" | "partnerName">,
  requesterName: string
): string {
  const name = requesterName.trim() || "הצד השני";
  const date = formatIsraeliDate(shift.bookingDate);
  const start = formatClockTime(shift.startTime);
  const end = formatClockTime(shift.endTime);
  return `${name} ביקש לבטל את המשמרת שנקבעה ל־${date} בשעות ${start}–${end}.`;
}

export function cancellationContactHref(
  role: CancellationRequesterRole,
  partnerId: string
): string {
  const id = partnerId.trim();
  if (role === "parent") {
    return `/parent/messages?sitter_id=${encodeURIComponent(id)}`;
  }
  return `/sitter/messages?parentId=${encodeURIComponent(id)}`;
}

export function cancellationHistoryLabel(
  role: CancellationRequesterRole | null | undefined
): string | null {
  if (role === "parent") return CANCELLATION_COPY.cancelledByParent;
  if (role === "sitter") return CANCELLATION_COPY.cancelledBySitter;
  return null;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function formatIsraeliDate(dateStr: string): string {
  const parts = dateStr.slice(0, 10).split("-");
  if (parts.length !== 3) return dateStr;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function formatClockTime(iso: string): string {
  if (!iso) return "--:--";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    const match = iso.match(/T(\d{2}):(\d{2})/);
    if (match) return `${match[1]}:${match[2]}`;
    return "--:--";
  }
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function formatCancellationShiftWhen(
  shift: Pick<CancellationShiftLike, "bookingDate" | "startTime" | "endTime">
): string {
  return `${formatIsraeliDate(shift.bookingDate)}, ${formatClockTime(shift.startTime)}–${formatClockTime(shift.endTime)}`;
}

export function formatCancellationDateTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}, ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function requesterDisplayLabel(
  shift: Pick<CancellationShiftLike, "cancellationRequestedRole" | "partnerName">,
  viewerRole: CancellationRequesterRole
): string {
  const name = shift.partnerName?.trim();
  if (name) return name;
  if (shift.cancellationRequestedRole === "parent" || viewerRole === "sitter") return "ההורה";
  return "הנני";
}

function mapRpcError(message: string): string {
  const m = message.toLowerCase();
  if (
    m.includes("42501") ||
    m.includes("not authorized") ||
    m.includes("not authenticated") ||
    m.includes("cannot approve own") ||
    m.includes("only the original requester") ||
    m.includes("cannot acknowledge")
  ) {
    return "אין הרשאה לבצע פעולה זו.";
  }
  if (m.includes("cancellation is not approved")) {
    return "הביטול עדיין לא אושר.";
  }
  if (m.includes("not cancellable") || m.includes("no longer cancellable")) {
    return "לא ניתן לבטל משמרת זו.";
  }
  if (m.includes("no pending cancellation")) {
    return "אין בקשת ביטול ממתינה לאישור.";
  }
  if (m.includes("booking not found") || m.includes("missing booking")) {
    return "המשמרת לא נמצאה.";
  }
  if (m.includes("could not find the function") || m.includes("pgrst202")) {
    return "עדכון הביטול עדיין לא זמין. נסו שוב לאחר רענון.";
  }
  return message.trim() || "הפעולה נכשלה. נסו שוב.";
}

function parseRpcPayload(data: unknown): CancellationRpcResult {
  if (!data || typeof data !== "object") {
    return { ok: false, error: "הפעולה נכשלה. נסו שוב." };
  }
  const payload = data as { ok?: unknown; state?: unknown };
  if (payload.ok === true) {
    const state = payload.state;
    if (
      state === "requested" ||
      state === "already_pending" ||
      state === "pending_from_other" ||
      state === "already_cancelled" ||
      state === "cancelled" ||
      state === "acknowledged" ||
      state === "already_acknowledged"
    ) {
      return { ok: true, state };
    }
    return { ok: true, state: "requested" };
  }
  return { ok: false, error: "הפעולה נכשלה. נסו שוב." };
}

export async function requestBookingCancellation(
  supabase: SupabaseClient,
  bookingId: string,
  message?: string | null
): Promise<CancellationRpcResult> {
  const id = bookingId.trim();
  if (!id) return { ok: false, error: "המשמרת לא נמצאה." };

  const { data, error } = await supabase.rpc("request_booking_cancellation", {
    p_booking_id: id,
    p_message: sanitizeCancellationMessage(message)
  });

  if (error) {
    return { ok: false, error: mapRpcError(readSupabaseErrorMessage(error)) };
  }

  return parseRpcPayload(data);
}

export async function approveBookingCancellation(
  supabase: SupabaseClient,
  bookingId: string
): Promise<CancellationRpcResult> {
  const id = bookingId.trim();
  if (!id) return { ok: false, error: "המשמרת לא נמצאה." };

  const { data, error } = await supabase.rpc("approve_booking_cancellation", {
    p_booking_id: id
  });

  if (error) {
    return { ok: false, error: mapRpcError(readSupabaseErrorMessage(error)) };
  }

  return parseRpcPayload(data);
}

export async function acknowledgeBookingCancellation(
  supabase: SupabaseClient,
  bookingId: string
): Promise<CancellationRpcResult> {
  const id = bookingId.trim();
  if (!id) return { ok: false, error: "המשמרת לא נמצאה." };

  const { data, error } = await supabase.rpc("acknowledge_booking_cancellation", {
    p_booking_id: id
  });

  if (error) {
    return { ok: false, error: mapRpcError(readSupabaseErrorMessage(error)) };
  }

  return parseRpcPayload(data);
}

export function withCancellationSelect(baseSelect: string): string {
  return `${baseSelect}, ${BOOKING_CANCELLATION_SELECT}`;
}

export function isCancellationColumnMissing(message: string | null | undefined): boolean {
  if (!message) return false;
  return (
    isPostgrestMissingColumnError(message, "cancellation_requested_by") ||
    isPostgrestMissingColumnError(message, "cancellation_requested_role") ||
    isPostgrestMissingColumnError(message, "cancellation_message") ||
    isPostgrestMissingColumnError(message, "cancelled_by") ||
    isPostgrestMissingColumnError(message, "cancelled_at") ||
    isPostgrestMissingColumnError(message, "cancellation_acknowledged_at")
  );
}
