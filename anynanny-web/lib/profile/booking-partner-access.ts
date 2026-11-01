import type { SupabaseClient } from "@supabase/supabase-js";

const LOOKUP_CHUNK = 100;

export type BookingPartnerDisplay = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  identityVerified: boolean;
  parentSerial: string | null;
  publicId: string | null;
  serialId: number | null;
};

type DisplayRow = {
  id?: string;
  first_name?: string | null;
  last_name?: string | null;
  avatar_url?: string | null;
  identity_verified?: boolean | null;
  parent_serial?: string | null;
  public_id?: string | null;
  serial_id?: number | string | null;
};

type AddressRow = {
  parent_id?: string;
  address?: unknown;
};

function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
}

function chunks<T>(items: T[], size: number): T[][] {
  const groups: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    groups.push(items.slice(index, index + size));
  }
  return groups;
}

function asDisplay(row: DisplayRow): BookingPartnerDisplay | null {
  const id = String(row.id ?? "").trim();
  if (!id) return null;
  const serial = Number(row.serial_id);
  return {
    id,
    firstName: row.first_name?.trim() || null,
    lastName: row.last_name?.trim() || null,
    avatarUrl: row.avatar_url?.trim() || null,
    identityVerified: row.identity_verified === true,
    parentSerial: row.parent_serial?.trim() || null,
    publicId: row.public_id?.trim() || null,
    serialId: Number.isFinite(serial) && serial > 0 ? Math.floor(serial) : null
  };
}

export function bookingPartnerDisplayName(
  row: Pick<BookingPartnerDisplay, "firstName" | "lastName"> | null | undefined
): string | null {
  const name = `${row?.firstName ?? ""} ${row?.lastName ?? ""}`.trim();
  return name || null;
}

/** Name, avatar, and public id for booking counterparts. No phone or address. */
export async function fetchBookingPartnerDisplays(
  supabase: SupabaseClient,
  userIds: string[]
): Promise<Map<string, BookingPartnerDisplay>> {
  const byId = new Map<string, BookingPartnerDisplay>();
  const ids = uniqueIds(userIds);
  if (ids.length === 0) return byId;

  for (const chunk of chunks(ids, LOOKUP_CHUNK)) {
    const { data, error } = await supabase.rpc("booking_partner_display", {
      p_user_ids: chunk
    });
    if (error) {
      console.warn("[booking-partner-display]", error.message);
      continue;
    }
    for (const row of (data ?? []) as DisplayRow[]) {
      const display = asDisplay(row);
      if (display) byId.set(display.id, display);
    }
  }

  return byId;
}

/**
 * Service address for parents the caller is allowed to visit.
 * Pending bookings produce no entry. The database projects city, street, and
 * house number only.
 */
export async function fetchBookingParentServiceAddresses(
  supabase: SupabaseClient,
  parentIds: string[]
): Promise<Map<string, unknown>> {
  const byId = new Map<string, unknown>();
  const ids = uniqueIds(parentIds);
  if (ids.length === 0) return byId;

  for (const chunk of chunks(ids, LOOKUP_CHUNK)) {
    const { data, error } = await supabase.rpc("booking_parent_service_addresses", {
      p_parent_ids: chunk
    });
    if (error) {
      console.warn("[booking-parent-address]", error.message);
      continue;
    }
    for (const row of (data ?? []) as AddressRow[]) {
      const parentId = String(row.parent_id ?? "").trim();
      if (!parentId || row.address == null) continue;
      byId.set(parentId, row.address);
    }
  }

  return byId;
}
