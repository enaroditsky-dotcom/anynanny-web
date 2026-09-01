import "server-only";

import { BOOKINGS_TABLE } from "@/lib/bookings/constants";
import {
  buildWhatsAppHandoffUrl,
  hasUsableWhatsAppPhone,
  isWhatsAppHandoffStatus,
  parseWhatsAppBookingId
} from "@/lib/chat/whatsapp-handoff";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/admin";
import { PROFILES_TABLE } from "@/lib/supabase/profiles";
import type { SupabaseClient } from "@supabase/supabase-js";

export type WhatsAppHandoffResult =
  | { ok: true; url: string }
  | { ok: false; status: number; error: string; reason: string };

export type WhatsAppHandoffAvailabilityResult =
  | { ok: true; eligible: true; counterpartHasPhone: boolean }
  | { ok: false; status: number; error: string; reason: string };

function tryGetServiceRoleClient(): SupabaseClient | null {
  try {
    return getSupabaseServiceRoleClient();
  } catch {
    return null;
  }
}

async function loadCounterpartPhone(
  admin: SupabaseClient,
  userId: string
): Promise<string | null> {
  const profile = await admin.from(PROFILES_TABLE).select("phone").eq("id", userId).maybeSingle();
  const fromProfile = String((profile.data as { phone?: string | null } | null)?.phone ?? "").trim();
  if (fromProfile) return fromProfile;

  const authUser = await admin.auth.admin.getUserById(userId);
  const fromAuth = String(authUser.data.user?.phone ?? "").trim();
  return fromAuth || null;
}

async function authorizeWhatsAppBooking(
  userClient: SupabaseClient,
  input: { actorId: string; bookingId: string }
): Promise<
  | { ok: true; counterpartId: string }
  | { ok: false; status: number; error: string; reason: string }
> {
  const bookingId = parseWhatsAppBookingId(input.bookingId);
  const actorId = String(input.actorId ?? "").trim();
  if (!bookingId || !actorId) {
    return { ok: false, status: 400, error: "חסר מזהה הזמנה.", reason: "missing_booking" };
  }

  const booking = await userClient
    .from(BOOKINGS_TABLE)
    .select("id, parent_id, sitter_id, status")
    .eq("id", bookingId)
    .maybeSingle();

  if (booking.error) {
    return { ok: false, status: 400, error: booking.error.message, reason: "booking_query" };
  }
  if (!booking.data) {
    return { ok: false, status: 404, error: "ההזמנה לא נמצאה.", reason: "not_found" };
  }

  const row = booking.data as {
    id: string;
    parent_id: string | null;
    sitter_id: string | null;
    status: string | null;
  };
  const parentId = String(row.parent_id ?? "").trim();
  const sitterId = String(row.sitter_id ?? "").trim();
  const isParent = actorId === parentId;
  const isSitter = actorId === sitterId;
  if (!isParent && !isSitter) {
    return { ok: false, status: 404, error: "ההזמנה לא נמצאה.", reason: "not_participant" };
  }

  if (!isWhatsAppHandoffStatus(row.status)) {
    return {
      ok: false,
      status: 409,
      error: "WhatsApp זמין רק בזמן המשמרת.",
      reason: "not_eligible"
    };
  }

  const counterpartId = isParent ? sitterId : parentId;
  if (!counterpartId) {
    return { ok: false, status: 404, error: "ההזמנה לא נמצאה.", reason: "missing_counterpart" };
  }

  return { ok: true, counterpartId };
}

export async function loadAuthorizedWhatsAppAvailability(
  userClient: SupabaseClient,
  input: { actorId: string; bookingId: string }
): Promise<WhatsAppHandoffAvailabilityResult> {
  const authorized = await authorizeWhatsAppBooking(userClient, input);
  if (!authorized.ok) return authorized;

  const admin = tryGetServiceRoleClient();
  if (!admin) {
    return { ok: false, status: 503, error: "לא ניתן לפתוח WhatsApp כרגע.", reason: "server" };
  }

  const phone = await loadCounterpartPhone(admin, authorized.counterpartId);
  return {
    ok: true,
    eligible: true,
    counterpartHasPhone: hasUsableWhatsAppPhone(phone)
  };
}

export async function loadAuthorizedWhatsAppHandoffUrl(
  userClient: SupabaseClient,
  input: { actorId: string; bookingId: string }
): Promise<WhatsAppHandoffResult> {
  const authorized = await authorizeWhatsAppBooking(userClient, input);
  if (!authorized.ok) return authorized;

  const admin = tryGetServiceRoleClient();
  if (!admin) {
    return { ok: false, status: 503, error: "לא ניתן לפתוח WhatsApp כרגע.", reason: "server" };
  }

  const phone = await loadCounterpartPhone(admin, authorized.counterpartId);
  if (!phone) {
    return { ok: false, status: 422, error: "לא הוגדר מספר טלפון", reason: "no_phone" };
  }

  const url = buildWhatsAppHandoffUrl(phone);
  if (!url) {
    return { ok: false, status: 422, error: "לא הוגדר מספר טלפון", reason: "bad_phone" };
  }

  return { ok: true, url };
}
