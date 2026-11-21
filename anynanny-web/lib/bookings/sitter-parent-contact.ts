import type { SupabaseClient } from "@supabase/supabase-js";
import { isSupabaseRpcUnavailableError } from "@/lib/supabase/postgrest-schema";

/**
 * Security-definer RPC. Returns a parent name to the assigned sitter only.
 * Street, house number and city are included only after approval.
 * Medical fields, phone, identity number and entry notes are not returned.
 */
export const SITTER_ASSIGNED_PARENT_CONTACT_RPC = "sitter_assigned_booking_parent_contacts" as const;

/** Statuses after the assigned sitter has approved an ordinary booking. */
export const ASSIGNED_SITTER_STREET_ADDRESS_STATUSES = [
  "approved",
  "sitter_started",
  "parent_started",
  "sitter_ended",
  "completed"
] as const;

export type AddressAudience =
  | "parent_self"
  | "assigned_sitter_pending"
  | "assigned_sitter_after_approval"
  | "now_candidate_sitter"
  | "ordinary_unassigned_sitter"
  | "unrelated_sitter"
  | "anonymous";

export function assignedSitterMaySeeStreetAddress(status: unknown): boolean {
  const normalized = String(status ?? "").trim().toLowerCase();
  return (ASSIGNED_SITTER_STREET_ADDRESS_STATUSES as readonly string[]).includes(normalized);
}

/**
 * Who may receive street + house number.
 * The parent always sees their own address.
 * An ordinary booking discloses it only to the assigned sitter after approval.
 * AnyNanny NOW discloses it to an eligible candidate before acceptance.
 */
export function streetAddressDisclosedTo(audience: AddressAudience): boolean {
  return (
    audience === "parent_self" ||
    audience === "assigned_sitter_after_approval" ||
    audience === "now_candidate_sitter"
  );
}

export type SitterParentContact = {
  bookingId: string;
  parentId: string;
  firstName: string;
  lastName: string;
  displayName: string;
  avatarUrl: string | null;
  identityVerified: boolean;
  addressLine: string | null;
  addressVisible: boolean;
};

function readText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Ignores a street line unless the RPC marked this booking as visible. */
export function parseSitterParentContact(row: unknown): SitterParentContact | null {
  if (!row || typeof row !== "object") return null;
  const record = row as Record<string, unknown>;
  const bookingId = readText(record.booking_id);
  const parentId = readText(record.parent_id);
  if (!bookingId || !parentId) return null;

  const addressVisible = record.address_visible === true;
  const addressLine = addressVisible ? readText(record.address_line) || null : null;
  const firstName = readText(record.first_name);
  const lastName = readText(record.last_name);

  return {
    bookingId,
    parentId,
    firstName,
    lastName,
    displayName: `${firstName} ${lastName}`.trim(),
    avatarUrl: readText(record.avatar_url) || null,
    identityVerified: record.identity_verified === true,
    addressLine,
    addressVisible: Boolean(addressLine)
  };
}

export async function fetchSitterAssignedParentContacts(
  supabase: SupabaseClient,
  bookingIds: readonly string[]
): Promise<{ contacts: SitterParentContact[]; unavailable: boolean }> {
  const ids = [...new Set(bookingIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) {
    return { contacts: [], unavailable: false };
  }

  const { data, error } = await supabase.rpc(SITTER_ASSIGNED_PARENT_CONTACT_RPC, {
    p_booking_ids: ids
  });

  if (error) {
    if (isSupabaseRpcUnavailableError(error)) {
      return { contacts: [], unavailable: true };
    }
    console.warn("[sitter parent contact] request failed");
    return { contacts: [], unavailable: false };
  }

  const rows = Array.isArray(data) ? data : [];
  return {
    contacts: rows
      .map(parseSitterParentContact)
      .filter((row): row is SitterParentContact => row != null),
    unavailable: false
  };
}
