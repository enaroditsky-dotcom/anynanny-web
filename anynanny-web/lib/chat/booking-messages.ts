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
import { isPostgrestMissingColumnError, isPostgrestSchemaDriftError } from "@/lib/supabase/postgrest-schema";

export const CHAT_ELIGIBLE_BOOKING_STATUSES: BookingStatus[] = [
  "pending",
  "approved",
  "sitter_started",
  "parent_started",
  "sitter_ended"
];

export type BookingChatInboxRow = {
  booking_id: string;
  partner_user_id: string;
  partner_name: string | null;
  /** Public display id (AN-#### for sitters, P-#### for parents). */
  partner_public_id: string | null;
  schedule_label: string;
  last_message_at: string;
};

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
  const selectAttempts = [
    `${fk}, first_name, last_name, nanny_serial, nanny_id_number`,
    `${fk}, first_name, last_name, nanny_serial`,
    `${fk}, first_name, last_name, nanny_id_number`,
    `${fk}, first_name, last_name`
  ];

  for (const select of selectAttempts) {
    const { data, error } = await supabase.from(SITTER_PROFILES_TABLE).select(select).in(fk, partnerIds);
    if (error) {
      if (
        isPostgrestMissingColumnError(error.message, "nanny_serial") ||
        isPostgrestMissingColumnError(error.message, "nanny_id_number") ||
        isPostgrestSchemaDriftError(error.message)
      ) {
        continue;
      }
      console.warn("[chat-inbox] sitter partner profiles:", error.message);
      return byId;
    }

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

  const selectAttempts = [
    "id, first_name, last_name, parent_public_id, parent_serial, public_id, serial_id",
    "id, first_name, last_name, parent_public_id, parent_serial, serial_id",
    "id, first_name, last_name, parent_serial, serial_id",
    "id, first_name, last_name, public_id, serial_id",
    "id, first_name, last_name, serial_id",
    "id, first_name, last_name"
  ];

  for (const select of selectAttempts) {
    const { data, error } = await supabase.from(PROFILES_TABLE).select(select).in("id", partnerIds);
    if (error) {
      if (
        isPostgrestMissingColumnError(error.message, "parent_public_id") ||
        isPostgrestMissingColumnError(error.message, "parent_serial") ||
        isPostgrestMissingColumnError(error.message, "public_id") ||
        isPostgrestMissingColumnError(error.message, "serial_id") ||
        isPostgrestSchemaDriftError(error.message)
      ) {
        continue;
      }
      console.warn("[chat-inbox] parent partner profiles:", error.message);
      return byId;
    }

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

async function fetchBookingsWithMessagesForUser(
  supabase: SupabaseClient,
  userId: string,
  role: "parent" | "sitter"
): Promise<{ rows: BookingChatInboxRow[]; error: string | null }> {
  const userColumn = role === "parent" ? "parent_id" : "sitter_id";
  const partnerColumn = role === "parent" ? "sitter_id" : "parent_id";

  // 1. שליפת משמרות שרק נמצאות בסטטוסים המורשים לצ'אט
  const { data: bookings, error } = await supabase
    .from(BOOKINGS_TABLE)
    .select("id, parent_id, sitter_id, booking_date, start_time, end_time, updated_at, status")
    .eq(userColumn, userId)
    .in("status", CHAT_ELIGIBLE_BOOKING_STATUSES)
    .order("updated_at", { ascending: false });

  if (error) {
    return { rows: [], error: error.message };
  }

  if (!bookings?.length) {
    return { rows: [], error: null };
  }

  const bookingIds = bookings.map((b) => String((b as { id: string }).id));
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

  // 3. מיפוי כל המשמרות המורשות לרשימת חלוניות השיחה (שיחה ללא הודעות תקבל את זמן עדכון המשמרת כברירת מחדל)
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
      };
      const bookingId = String(row.id);
      const partnerUserId = String(row[partnerColumn as keyof typeof row]);
      const details = partnerDetails.get(partnerUserId);
      return {
        booking_id: bookingId,
        partner_user_id: partnerUserId,
        partner_name: details?.name ?? null,
        partner_public_id: details?.publicId ?? null,
        schedule_label: formatBookingSchedule(row),
        last_message_at: lastMessageAt.get(bookingId) ?? row.updated_at
      };
    })
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

  const bookingId = data && typeof data === "object" && "id" in data ? String((data as { id: string }).id) : null;
  if (!bookingId) {
    return { bookingId: null, error: "אין משמרת פעילה עם בייביסיטר זו — תאמו משמרת כדי לשלוח הודעה." };
  }

  return { bookingId, error: null };
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

  const { data, error } = await supabase
    .from(MESSAGES_TABLE)
    .insert({ booking_id: bookingId, sender_id: senderId, content: trimmed })
    .select("id, booking_id, sender_id, content, created_at")
    .single();

  if (error) {
    return { message: null, error: error.message };
  }

  return { message: data as MessageRow, error: null };
}