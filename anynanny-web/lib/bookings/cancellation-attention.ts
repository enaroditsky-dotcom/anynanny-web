import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isCancellationColumnMissing,
  isIncomingPendingCancellation,
  isUnacknowledgedApprovedCancellation,
  pickCancellationFields,
  withCancellationSelect,
  type BookingCancellationFields,
  type CancellationRequesterRole
} from "@/lib/bookings/cancellation-request";
import { BOOKINGS_TABLE, type BookingStatus } from "@/lib/bookings/constants";
import { normalizeBookingStatus, type BookingStatusInput } from "@/lib/bookings/booking-status-normalize";
import { PROFILES_TABLE } from "@/lib/supabase/profiles";

const ATTENTION_BASE_SELECT = "id, parent_id, sitter_id, booking_date, start_time, end_time, status";

export type CancellationAttentionKind = "incoming" | "approved";

export type CancellationAttentionItem = {
  id: string;
  kind: CancellationAttentionKind;
  parentId: string;
  sitterId: string;
  partnerId: string;
  partnerName: string;
  requesterName: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
  status: BookingStatus;
} & BookingCancellationFields;

function profileDisplayName(row: { first_name?: string | null; last_name?: string | null }): string {
  return `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim();
}

function compareAttentionItems(a: CancellationAttentionItem, b: CancellationAttentionItem): number {
  const aStart = Date.parse(a.startTime) || 0;
  const bStart = Date.parse(b.startTime) || 0;
  if (aStart !== bStart) return aStart - bStart;
  return a.bookingDate.localeCompare(b.bookingDate);
}

async function loadNameById(
  supabase: SupabaseClient,
  ids: string[]
): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  const map = new Map<string, string>();
  if (unique.length === 0) return map;

  const { data } = await supabase.from(PROFILES_TABLE).select("id, first_name, last_name").in("id", unique);
  for (const profile of data ?? []) {
    if (!profile || typeof profile !== "object" || !("id" in profile)) continue;
    const id = String((profile as { id: string }).id);
    const name = profileDisplayName(profile as { first_name?: string | null; last_name?: string | null });
    if (name) map.set(id, name);
  }
  return map;
}

function mapAttentionRow(
  raw: Record<string, unknown>,
  viewerUserId: string,
  role: CancellationRequesterRole,
  names: Map<string, string>
): CancellationAttentionItem | null {
  const id = typeof raw.id === "string" ? raw.id : "";
  const parentId = typeof raw.parent_id === "string" ? raw.parent_id : "";
  const sitterId = typeof raw.sitter_id === "string" ? raw.sitter_id : "";
  const bookingDate = typeof raw.booking_date === "string" ? raw.booking_date : "";
  const startTime = typeof raw.start_time === "string" ? raw.start_time : "";
  const endTime = typeof raw.end_time === "string" ? raw.end_time : "";
  const status = normalizeBookingStatus(raw.status as BookingStatusInput);
  if (!id || !parentId || !sitterId || !bookingDate || !status) return null;
  if (viewerUserId !== parentId && viewerUserId !== sitterId) return null;

  const cancellation = pickCancellationFields(raw);
  const incoming = isIncomingPendingCancellation(
    { status, ...cancellation },
    viewerUserId
  );
  const approved = isUnacknowledgedApprovedCancellation(
    { status, ...cancellation },
    viewerUserId
  );
  if (!incoming && !approved) return null;

  const partnerId = role === "parent" ? sitterId : parentId;
  const partnerFallback = role === "parent" ? "שמרטפית AnyNanny" : "הורה AnyNanny";
  const requesterId = cancellation.cancellationRequestedBy ?? "";
  const partnerName = names.get(partnerId) || partnerFallback;
  const requesterName = (requesterId && names.get(requesterId)) || partnerName;

  return {
    id,
    kind: incoming ? "incoming" : "approved",
    parentId,
    sitterId,
    partnerId,
    partnerName,
    requesterName,
    bookingDate,
    startTime,
    endTime,
    status,
    ...cancellation
  };
}

export async function fetchCancellationAttentionItems(
  supabase: SupabaseClient,
  viewerUserId: string,
  role: CancellationRequesterRole
): Promise<{ items: CancellationAttentionItem[]; error: string | null }> {
  const userId = viewerUserId.trim();
  if (!userId) return { items: [], error: null };

  const participantColumn = role === "parent" ? "parent_id" : "sitter_id";
  const select = withCancellationSelect(ATTENTION_BASE_SELECT);

  const incomingQuery = supabase
    .from(BOOKINGS_TABLE)
    .select(select)
    .eq(participantColumn, userId)
    .eq("status", "approved")
    .not("cancellation_requested_by", "is", null)
    .neq("cancellation_requested_by", userId)
    .not("cancellation_requested_at", "is", null)
    .is("cancelled_at", null);

  const approvedQuery = supabase
    .from(BOOKINGS_TABLE)
    .select(select)
    .eq(participantColumn, userId)
    .eq("status", "cancelled")
    .eq("cancellation_requested_by", userId)
    .not("cancelled_at", "is", null)
    .is("cancellation_acknowledged_at", null);

  const [incomingResult, approvedResult] = await Promise.all([incomingQuery, approvedQuery]);

  if (incomingResult.error && isCancellationColumnMissing(incomingResult.error.message)) {
    return { items: [], error: null };
  }
  if (approvedResult.error && isCancellationColumnMissing(approvedResult.error.message)) {
    return { items: [], error: null };
  }
  if (incomingResult.error) {
    return { items: [], error: incomingResult.error.message };
  }
  if (approvedResult.error) {
    return { items: [], error: approvedResult.error.message };
  }

  const rows = [
    ...(((incomingResult.data as unknown[] | null) ?? []) as Record<string, unknown>[]),
    ...(((approvedResult.data as unknown[] | null) ?? []) as Record<string, unknown>[])
  ];

  const nameIds: string[] = [];
  for (const raw of rows) {
    if (typeof raw.parent_id === "string") nameIds.push(raw.parent_id);
    if (typeof raw.sitter_id === "string") nameIds.push(raw.sitter_id);
    if (typeof raw.cancellation_requested_by === "string") nameIds.push(raw.cancellation_requested_by);
  }
  const names = await loadNameById(supabase, nameIds);

  const items = rows
    .map((raw) => mapAttentionRow(raw, userId, role, names))
    .filter((item): item is CancellationAttentionItem => item != null)
    .sort(compareAttentionItems);

  return { items, error: null };
}
