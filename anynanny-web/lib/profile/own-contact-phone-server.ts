import "server-only";

import {
  CONTACT_PHONE_INVALID_HE,
  normalizeIsraeliMobileForStorage
} from "@/lib/profile/contact-phone";
import { isPostgrestSchemaDriftError } from "@/lib/supabase/postgrest-schema";
import { PROFILES_TABLE } from "@/lib/supabase/profiles";
import type { SupabaseClient } from "@supabase/supabase-js";

export type OwnContactPhoneResult =
  | { ok: true; phone: string }
  | { ok: false; status: number; error: string; reason: string };

export async function saveOwnContactPhone(
  userClient: SupabaseClient,
  input: { actorId: string; phone: string }
): Promise<OwnContactPhoneResult> {
  const actorId = String(input.actorId ?? "").trim();
  const normalized = normalizeIsraeliMobileForStorage(input.phone);
  if (!actorId) {
    return { ok: false, status: 401, error: "יש להתחבר.", reason: "unauthorized" };
  }
  if (!normalized) {
    return { ok: false, status: 400, error: CONTACT_PHONE_INVALID_HE, reason: "invalid_phone" };
  }

  const withTimestamp = {
    phone: normalized,
    updated_at: new Date().toISOString()
  };
  const phoneOnly = { phone: normalized };

  let lastError: string | null = null;
  for (const payload of [withTimestamp, phoneOnly]) {
    const result = await userClient.from(PROFILES_TABLE).update(payload).eq("id", actorId);
    if (!result.error) {
      return { ok: true, phone: normalized };
    }
    lastError = result.error.message;
    if (!isPostgrestSchemaDriftError(result.error.message)) break;
  }

  return {
    ok: false,
    status: 400,
    error: lastError || "שמירת מספר הטלפון נכשלה.",
    reason: "save_failed"
  };
}
