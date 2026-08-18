import type { SupabaseClient } from "@supabase/supabase-js";
import { BOOKINGS_TABLE, type BookingStatus } from "@/lib/bookings/constants";
import { formatBookingSchedule } from "@/lib/bookings/sitter-pending-bookings";
import { MESSAGES_TABLE, type MessageRow } from "@/lib/chat/constants";
import { pickProfilePublicId } from "@/lib/public/sequential-display-id";
import {
  SITTER_PROFILES_TABLE,
  SITTER_PROFILES_USER_COLUMN
} from "@/lib/sitter/sitter-profile";
import { PROFILES_TABLE } from "@/lib/supabase/profiles";
import { isPostgrestSchemaDriftError } from "@/lib/supabase/postgrest-schema";
import { getCachedWorkingSelect, setCachedWorkingSelect } from "@/lib/supabase/rpc-availability";
import { getChatLifecycle } from "@/lib/chat/chat-lifecycle";

export const CHAT_ELIGIBLE_BOOKING_STATUSES: BookingStatus[] = [
  "pending",
  "approved",
  "sitter_started",
  "parent_started",
  "sitter_ended"
];

/** Cancelled/completed shifts keep their conversation if messages already exist. */
export const CHAT_HISTORY_BOOKING_STATUSES: BookingStatus[] = ["cancelled", "completed"];

export const CHAT_INBOX_BOOKING_STATUSES: BookingStatus[] = [
  ...CHAT_ELIGIBLE_BOOKING_STATUSES,
  ...CHAT_HISTORY_BOOKING_STATUSES
];

export type BookingChatInboxRow = {
  booking_id: string;
  partner_user_id: string;
  partner_name: string | null;
  /** Public display id (AN-#### for sitters, P-#### for parents). */
  partner_public_id: string | null;
  schedule_label: string;
  last_message_at: string;
  booking_status: BookingStatus | string;
  cancelled_at: string | null;
  actual_end_time: string | null;
  scheduled_end_time: string | null;
  session_end_time: string | null;
};

/** Active bookings appear even before the first message. History bookings appear only with messages. */
export function shouldIncludeBookingInChatInbox(
  status: string | null | undefined,
  hasMessages: boolean
): boolean {
  const normalized = String(status ?? "").trim().toLowerCase();
  if (hasMessages) {
    return CHAT_INBOX_BOOKING_STATUSES.includes(normalized as BookingStatus);
  }
  return CHAT_ELIGIBLE_BOOKING_STATUSES.includes(normalized as BookingStatus);
}

type PartnerDetails = {
  name: string | null;
  publicId: string | null;
};

async function loadSitterPartnerDetailsByIds(
  supabase: SupabaseClient,
  partnerIds: string[]
): Promise<Map<string, PartnerDetails>> {
  const byId = new Map<string, PartnerDetails>();
  if (partnerIds.length === 0) return byId;

  const fk = SITTER_PROFILES_USER_COLUMN;
  const cacheKey = `chat-inbox:sitter-partners`;
  const cached = getCachedWorkingSelect(cacheKey);
  const selectAttempts = [
    ...(cached ? [cached] : []),
    `${fk}, first_name, last_name, nanny_serial`,
    `${fk}, first_name, last_name`,
    `${fk}, first_name, last_name, nanny_serial, nanny_id_number`,
    `${fk}, first_name, last_name, nanny_id_number`
  ].filter((s, i, arr) => arr.indexOf(s) === i);

  for (const select of selectAttempts) {
    const { data, error } = await supabase.from(SITTER_PROFILES_TABLE).select(select).in(fk, partnerIds);
    if (error) {
      if (isPostgrestSchemaDriftError(error.message)) {
        continue;
      }
      console.warn("[chat-inbox] sitter partner profiles:", error.message);
      return byId;
    }

    setCachedWorkingSelect(cacheKey, select);
    for (const profile of data ?? []) {
      if (!profile || typeof profile !== "object") continue;
      const row = profile as Record<string, unknown>;
      const id = String(row[fk] ?? "").trim();
      if (!id) continue;
      const name = `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim() || null;
      byId.set(id, {
        name,
        publicId: pickProfilePublicId(row, "sitter")
      });
    }
    return byId;
  }

  return byId;
}

async function loadParentPartnerDetailsByIds(
  supabase: SupabaseClient,
  partnerIds: string[]
): Promise<Map<string, PartnerDetails>> {
  const byId = new Map<string, PartnerDetails>();
  if (partnerIds.length === 0) return byId;

  const cacheKey = `chat-inbox:parent-partners`;
  const cached = getCachedWorkingSelect(cacheKey);
  const selectAttempts = [
    ...(cached ? [cached] : []),
    "id, first_name, last_name, parent_serial, public_id, serial_id",
    "id, first_name, last_name, parent_serial, serial_id",
    "id, first_name, last_name, serial_id",
    "id, first_name, last_name"
  ].filter((s, i, arr) => arr.indexOf(s) === i);

  for (const select of selectAttempts) {
    const { data, error } = await supabase.from(PROFILES_TABLE).select(select).in("id", partnerIds);
    if (error) {
      if (isPostgrestSchemaDriftError(error.message)) {
        continue;
      }
      console.warn("[chat-inbox] parent partner profiles:", error.message);
      return byId;
    }

    setCachedWorkingSelect(cacheKey, select);
    for (const profile of data ?? []) {
      if (!profile || typeof profile !== "object") continue;
      const row = profile as Record<string, unknown>;
      const id = String(row.id ?? "").trim();
      if (!id) continue;
      const name = `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim() || null;
      byId.set(id, {
        name,
        publicId: pickProfilePublicId(row, "parent")
      });
    }
    return byId;
  }

  return byId;
}

const CHAT_BOOKING_SELECT_ATTEMPTS = [
  "id, parent_id, sitter_id, booking_date, start_time, end_time, actual_end_time, cancelled_at, updated_at, status",
  "id, parent_id, sitter_id, booking_date, start_time, end_time, cancelled_at, updated_at, status",
  "id, parent_id, sitter_id, booking_date, start_time, end_time, updated_at, status"
];

async function loadChatInboxBookings(
  supabase: SupabaseClient,
  userColumn: "parent_id" | "sitter_id",
  userId: string
): Promise<{ data: Record<string, unknown>[] | null; error: string | null }> {
  let lastError: string | null = null;
  for (const select of CHAT_BOOKING_SELECT_ATTEMPTS) {
    const { data, error } = await supabase
      .from(BOOKINGS_TABLE)
      .select(select)
      .eq(userColumn, userId)
      .in("status", CHAT_INBOX_BOOKING_STATUSES)
      .order("updated_at", { ascending: false });
    if (!error) {
      return { data: ((data ?? []) as unknown as Record<string, unknown>[]), error: null };
    }
    lastError = error.message;
    if (!isPostgrestSchemaDriftError(error.message)) {
      return { data: null, error: error.message };
    }
  }
  return { data: null, error: lastError };
}

async function loadSessionEndTimesByBookingIds(
  supabase: SupabaseClient,
  bookingIds: string[]
): Promise<Map<string, string>> {
  const byId = new Map<string, string>();
  if (bookingIds.length === 0) return byId;

  const { data, error } = await supabase
    .from("sessions")
    .select("id, booking_id, end_time")
    .in("booking_id", bookingIds)
    .not("end_time", "is", null);

  if (error) {
    if (isPostgrestSchemaDriftError(error.message)) {
      const fallback = await supabase
        .from("sessions")
        .select("id, end_time")
        .in("id", bookingIds)
        .not("end_time", "is", null);
      if (!fallback.error) {
        for (const row of fallback.data ?? []) {
          const id = String((row as { id?: string }).id ?? "").trim();
          const endTime = String((row as { end_time?: string }).end_time ?? "").trim();
          if (id && endTime && !byId.has(id)) byId.set(id, endTime);
        }
      }
      return byId;
    }
    return byId;
  }

  for (const row of data ?? []) {
    const bookingId = String((row as { booking_id?: string }).booking_id ?? "").trim();
    const endTime = String((row as { end_time?: string }).end_time ?? "").trim();
    if (bookingId && endTime && !byId.has(bookingId)) byId.set(bookingId, endTime);
  }
  return byId;
}

async function fetchBookingsWithMessagesForUser(
  supabase: SupabaseClient,
  userId: string,
  role: "parent" | "sitter"
): Promise<{ rows: BookingChatInboxRow[]; error: string | null }> {
  const userColumn = role === "parent" ? "parent_id" : "sitter_id";
  const partnerColumn = role === "parent" ? "sitter_id" : "parent_id";

  const { data: bookings, error } = await loadChatInboxBookings(supabase, userColumn, userId);

  if (error) {
    return { rows: [], error };
  }

  if (!bookings?.length) {
    return { rows: [], error: null };
  }

  const bookingIds = bookings.map((b) => String((b as { id: string }).id));
  const sessionEndTimes = await loadSessionEndTimesByBookingIds(supabase, bookingIds);
  const { data: messages } = await supabase
    .from(MESSAGES_TABLE)
    .select("booking_id, created_at")
    .in("booking_id", bookingIds)
    .order("created_at", { ascending: false });

  const lastMessageAt = new Map<string, string>();
  for (const message of messages ?? []) {
    const bookingId = String((message as { booking_id: string }).booking_id);
    if (!lastMessageAt.has(bookingId)) {
      lastMessageAt.set(bookingId, String((message as { created_at: string }).created_at));
    }
  }

  // 2. שולפים שם + מזהה ציבורי של השותפים מתוך כל המשמרות המורשות
  const partnerIds = [
    ...new Set(
      bookings
        .map((b) => String((b as Record<string, string>)[partnerColumn] ?? "").trim())
        .filter(Boolean)
    )
  ];

  const partnerDetails =
    role === "parent"
      ? await loadSitterPartnerDetailsByIds(supabase, partnerIds)
      : await loadParentPartnerDetailsByIds(supabase, partnerIds);

  const rows = bookings
    .map((booking) => {
      const row = booking as {
        id: string;
        parent_id: string;
        sitter_id: string;
        booking_date: string;
        start_time: string;
        end_time: string;
        updated_at: string;
        status?: string;
        cancelled_at?: string | null;
        actual_end_time?: string | null;
      };
      const bookingId = String(row.id);
      const bookingStatus = String(row.status ?? "").trim().toLowerCase();
      const hasMessages = lastMessageAt.has(bookingId);
      if (!shouldIncludeBookingInChatInbox(bookingStatus, hasMessages)) {
        return null;
      }
      const partnerUserId = String(row[partnerColumn as keyof typeof row]);
      const details = partnerDetails.get(partnerUserId);
      const scheduledEndTime = String(row.end_time ?? "").trim() || null;
      const actualEndTime =
        typeof row.actual_end_time === "string" && row.actual_end_time.trim()
          ? row.actual_end_time
          : null;
      const cancelledAt =
        typeof row.cancelled_at === "string" && row.cancelled_at.trim() ? row.cancelled_at : null;
      return {
        booking_id: bookingId,
        partner_user_id: partnerUserId,
        partner_name: details?.name ?? null,
        partner_public_id: details?.publicId ?? null,
        schedule_label: formatBookingSchedule(row),
        last_message_at: lastMessageAt.get(bookingId) ?? row.updated_at,
        booking_status: bookingStatus,
        cancelled_at: cancelledAt,
        actual_end_time: actualEndTime,
        scheduled_end_time: scheduledEndTime,
        session_end_time: sessionEndTimes.get(bookingId) ?? null
      };
    })
    .filter((row): row is BookingChatInboxRow => row !== null)
    .sort((a, b) => Date.parse(b.last_message_at) - Date.parse(a.last_message_at));

  return { rows, error: null };
}

/** Most recent chat-eligible booking between a parent and sitter. */
export async function findChatBookingForParentSitter(
  supabase: SupabaseClient,
  parentId: string,
  sitterId: string
): Promise<{ bookingId: string | null; error: string | null }> {
  const { data, error } = await supabase
    .from(BOOKINGS_TABLE)
    .select("id")
    .eq("parent_id", parentId)
    .eq("sitter_id", sitterId)
    .in("status", CHAT_ELIGIBLE_BOOKING_STATUSES)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return { bookingId: null, error: error.message };
  }

  const activeId = data && typeof data === "object" && "id" in data ? String((data as { id: string }).id) : null;
  if (activeId) {
    return { bookingId: activeId, error: null };
  }

  const { data: history, error: historyError } = await supabase
    .from(BOOKINGS_TABLE)
    .select("id")
    .eq("parent_id", parentId)
    .eq("sitter_id", sitterId)
    .in("status", CHAT_HISTORY_BOOKING_STATUSES)
    .order("updated_at", { ascending: false })
    .limit(20);

  if (historyError) {
    return { bookingId: null, error: historyError.message };
  }

  const historyIds = (history ?? [])
    .map((row) => (row && typeof row === "object" && "id" in row ? String((row as { id: string }).id) : ""))
    .filter(Boolean);

  if (historyIds.length > 0) {
    const { data: messages } = await supabase
      .from(MESSAGES_TABLE)
      .select("booking_id, created_at")
      .in("booking_id", historyIds)
      .order("created_at", { ascending: false });

    for (const message of messages ?? []) {
      const bookingId = String((message as { booking_id?: string }).booking_id ?? "").trim();
      if (bookingId) {
        return { bookingId, error: null };
      }
    }
  }

  return { bookingId: null, error: "אין משמרת פעילה עם בייביסיטר זו — תאמו משמרת כדי לשלוח הודעה." };
}

export async function fetchParentBookingChatInbox(
  supabase: SupabaseClient,
  parentId: string
): Promise<{ rows: BookingChatInboxRow[]; error: string | null }> {
  return fetchBookingsWithMessagesForUser(supabase, parentId, "parent");
}

export async function fetchSitterBookingChatInbox(
  supabase: SupabaseClient,
  sitterId: string
): Promise<{ rows: BookingChatInboxRow[]; error: string | null }> {
  return fetchBookingsWithMessagesForUser(supabase, sitterId, "sitter");
}

export async function fetchBookingChatInboxForRole(
  supabase: SupabaseClient,
  userId: string,
  role: "parent" | "sitter"
): Promise<{ rows: BookingChatInboxRow[]; error: string | null }> {
  return fetchBookingsWithMessagesForUser(supabase, userId, role);
}

export async function verifyBookingChatParticipant(
  supabase: SupabaseClient,
  bookingId: string,
  userId: string
): Promise<{ allowed: boolean; partnerName: string | null; error: string | null }> {
  const { data, error } = await supabase
    .from(BOOKINGS_TABLE)
    .select("parent_id, sitter_id")
    .eq("id", bookingId)
    .maybeSingle();

  if (error) {
    return { allowed: false, partnerName: null, error: error.message };
  }

  if (!data) {
    return { allowed: false, partnerName: null, error: "denied" };
  }

  const parentId = String((data as { parent_id: string }).parent_id);
  const sitterId = String((data as { sitter_id: string }).sitter_id);

  if (userId !== parentId && userId !== sitterId) {
    return { allowed: false, partnerName: null, error: "denied" };
  }

  const partnerId = userId === parentId ? sitterId : parentId;

  if (userId === parentId) {
    const { data: profile } = await supabase
      .from("sitter_profiles")
      .select("first_name, last_name")
      .eq("id", partnerId)
      .maybeSingle();

    const partnerName =
      profile && typeof profile === "object"
        ? `${(profile as { first_name?: string | null }).first_name ?? ""} ${(profile as { last_name?: string | null }).last_name ?? ""}`.trim() ||
          null
        : null;

    return { allowed: true, partnerName, error: null };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name, last_name")
    .eq("id", partnerId)
    .maybeSingle();

  const partnerName =
    profile && typeof profile === "object"
      ? `${(profile as { first_name?: string | null }).first_name ?? ""} ${(profile as { last_name?: string | null }).last_name ?? ""}`.trim() ||
        null
      : null;

  return { allowed: true, partnerName, error: null };
}

export async function fetchBookingChatLifecycle(
  supabase: SupabaseClient,
  bookingId: string
): Promise<{
  status: string | null;
  cancelledAt: string | null;
  actualEndTime: string | null;
  scheduledEndTime: string | null;
  sessionEndTime: string | null;
  error: string | null;
}> {
  const id = bookingId.trim();
  let booking: Record<string, unknown> | null = null;
  let lastError: string | null = null;

  for (const select of [
    "status, end_time, actual_end_time, cancelled_at",
    "status, end_time, cancelled_at",
    "status, end_time"
  ]) {
    const { data, error } = await supabase.from(BOOKINGS_TABLE).select(select).eq("id", id).maybeSingle();
    if (!error) {
      booking = (data as Record<string, unknown> | null) ?? null;
      lastError = null;
      break;
    }
    lastError = error.message;
    if (!isPostgrestSchemaDriftError(error.message)) {
      return {
        status: null,
        cancelledAt: null,
        actualEndTime: null,
        scheduledEndTime: null,
        sessionEndTime: null,
        error: error.message
      };
    }
  }

  if (!booking) {
    return {
      status: null,
      cancelledAt: null,
      actualEndTime: null,
      scheduledEndTime: null,
      sessionEndTime: null,
      error: lastError ?? "denied"
    };
  }

  const sessionEndTimes = await loadSessionEndTimesByBookingIds(supabase, [id]);
  const asString = (value: unknown): string | null =>
    typeof value === "string" && value.trim() ? value : null;

  return {
    status: asString(booking.status),
    cancelledAt: asString(booking.cancelled_at),
    actualEndTime: asString(booking.actual_end_time),
    scheduledEndTime: asString(booking.end_time),
    sessionEndTime: sessionEndTimes.get(id) ?? null,
    error: null
  };
}

export async function fetchBookingChatPartner(
  supabase: SupabaseClient,
  bookingId: string,
  parentId: string
): Promise<{ sitterId: string | null; sitterName: string | null; error: string | null }> {
  const { allowed, partnerName, error } = await verifyBookingChatParticipant(supabase, bookingId, parentId);
  if (!allowed) {
    return { sitterId: null, sitterName: null, error: error ?? "denied" };
  }

  const { data } = await supabase.from(BOOKINGS_TABLE).select("sitter_id").eq("id", bookingId).maybeSingle();
  const sitterId =
    data && typeof data === "object" && "sitter_id" in data ? String((data as { sitter_id: string }).sitter_id) : null;

  return { sitterId, sitterName: partnerName, error: null };
}

export async function fetchBookingMessages(
  supabase: SupabaseClient,
  bookingId: string,
  limit = 80
): Promise<{ messages: MessageRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from(MESSAGES_TABLE)
    .select("id, booking_id, sender_id, content, created_at")
    .eq("booking_id", bookingId)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    return { messages: [], error: error.message };
  }

  return { messages: (data as MessageRow[]) ?? [], error: null };
}

export async function sendBookingMessage(
  supabase: SupabaseClient,
  bookingId: string,
  senderId: string,
  content: string
): Promise<{ message: MessageRow | null; error: string | null }> {
  const trimmed = content.trim();
  if (!trimmed) {
    return { message: null, error: "הודעה ריקה" };
  }

  const lifecycleState = await fetchBookingChatLifecycle(supabase, bookingId);
  if (!lifecycleState.error) {
    const lifecycle = getChatLifecycle(
      {
        status: lifecycleState.status,
        cancelledAt: lifecycleState.cancelledAt,
        actualEndTime: lifecycleState.actualEndTime,
        sessionEndTime: lifecycleState.sessionEndTime,
        scheduledEndTime: lifecycleState.scheduledEndTime
      },
      Date.now()
    );
    if (!lifecycle.writable) {
      return {
        message: null,
        error: lifecycle.closedHeadline ?? "השיחה נסגרה – לא ניתן לשלוח הודעות חדשות."
      };
    }
  }

  const { data, error } = await supabase
    .from(MESSAGES_TABLE)
    .insert({ booking_id: bookingId, sender_id: senderId, content: trimmed })
    .select("id, booking_id, sender_id, content, created_at")
    .single();

  if (error) {
    const message = error.message.toLowerCase();
    if (message.includes("row-level security") || message.includes("42501")) {
      return { message: null, error: "השיחה נסגרה – לא ניתן לשלוח הודעות חדשות." };
    }
    return { message: null, error: error.message };
  }

  return { message: data as MessageRow, error: null };
}