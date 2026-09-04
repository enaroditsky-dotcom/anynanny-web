import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DIDIT_SESSIONS_TABLE,
  DIDIT_WEBHOOK_EVENTS_TABLE,
  IDENTITY_VERIFICATION_METHOD_DIDIT,
  isDiditSessionStatus,
  mapDiditStatusToProfile,
  type DiditSessionStatus
} from "@/lib/identity/didit";
import {
  parseIdentityVerificationStatus,
  type IdentityVerificationRole,
  type IdentityVerificationStatus
} from "@/lib/identity/identity-verification";
import { isPostgrestSchemaDriftError } from "@/lib/supabase/postgrest-schema";
import { PROFILES_TABLE } from "@/lib/supabase/profiles";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseUuid(raw: unknown): string | null {
  const value = String(raw ?? "").trim();
  return UUID_RE.test(value) ? value.toLowerCase() : null;
}

export async function insertDiditSession(
  supabase: SupabaseClient,
  input: {
    sessionId: string;
    userId: string;
    role: IdentityVerificationRole;
    workflowId: string;
    status?: string;
    metadata?: Record<string, unknown> | null;
  }
): Promise<{ error: string | null; missingSchema: boolean }> {
  const { error } = await supabase.from(DIDIT_SESSIONS_TABLE).insert({
    session_id: input.sessionId,
    user_id: input.userId,
    role: input.role,
    vendor_data: input.userId,
    workflow_id: input.workflowId,
    status: isDiditSessionStatus(input.status) ? input.status : "Not Started",
    metadata: input.metadata ?? null,
    updated_at: new Date().toISOString()
  });

  if (error) {
    return {
      error: error.message,
      missingSchema: isPostgrestSchemaDriftError(error.message)
    };
  }
  return { error: null, missingSchema: false };
}

export async function markDiditProfilePending(
  supabase: SupabaseClient,
  userId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from(PROFILES_TABLE)
    .update({
      identity_verification_status: "pending",
      identity_verification_method: IDENTITY_VERIFICATION_METHOD_DIDIT,
      updated_at: new Date().toISOString()
    })
    .eq("id", userId)
    .neq("identity_verification_status", "verified");

  if (error) return { error: error.message };
  return { error: null };
}

export async function alreadyProcessedDiditEvent(
  admin: SupabaseClient,
  eventId: string
): Promise<boolean> {
  const { data, error } = await admin
    .from(DIDIT_WEBHOOK_EVENTS_TABLE)
    .select("event_id")
    .eq("event_id", eventId)
    .maybeSingle();
  if (error) {
    if (isPostgrestSchemaDriftError(error.message)) return false;
    throw new Error(error.message);
  }
  return Boolean(data);
}

export async function markDiditEventProcessed(
  admin: SupabaseClient,
  input: {
    eventId: string;
    sessionId: string | null;
    webhookType: string | null;
    status: string | null;
  }
): Promise<void> {
  const { error } = await admin.from(DIDIT_WEBHOOK_EVENTS_TABLE).upsert(
    {
      event_id: input.eventId,
      session_id: input.sessionId,
      webhook_type: input.webhookType,
      status: input.status,
      processed_at: new Date().toISOString()
    },
    { onConflict: "event_id" }
  );
  if (error && !isPostgrestSchemaDriftError(error.message)) {
    throw new Error(error.message);
  }
}

async function loadCurrentStatus(
  admin: SupabaseClient,
  userId: string
): Promise<IdentityVerificationStatus> {
  const { data } = await admin
    .from(PROFILES_TABLE)
    .select("identity_verification_status")
    .eq("id", userId)
    .maybeSingle();
  return parseIdentityVerificationStatus(
    (data as { identity_verification_status?: unknown } | null)?.identity_verification_status
  );
}

export async function applyDiditWebhookDecision(
  admin: SupabaseClient,
  payload: Record<string, unknown>
): Promise<void> {
  const status = String(payload.status ?? "");
  const sessionId = parseUuid(payload.session_id);
  const vendorData = String(payload.vendor_data ?? "").trim();
  const userId = parseUuid(vendorData);
  const metadata =
    payload.metadata && typeof payload.metadata === "object" && !Array.isArray(payload.metadata)
      ? (payload.metadata as Record<string, unknown>)
      : null;
  const role = metadata?.role === "sitter" ? "sitter" : "parent";
  const decision = payload.decision && typeof payload.decision === "object" ? payload.decision : null;
  const resubmitInfo =
    payload.resubmit_info && typeof payload.resubmit_info === "object" ? payload.resubmit_info : null;

  if (sessionId) {
    const sessionPatch: Record<string, unknown> = {
      updated_at: new Date().toISOString()
    };
    if (isDiditSessionStatus(status)) sessionPatch.status = status;
    if (decision) sessionPatch.decision = decision;
    if (resubmitInfo) sessionPatch.resubmit_info = resubmitInfo;
    if (userId) sessionPatch.user_id = userId;
    if (vendorData) sessionPatch.vendor_data = vendorData;

    const existing = await admin
      .from(DIDIT_SESSIONS_TABLE)
      .select("session_id")
      .eq("session_id", sessionId)
      .maybeSingle();

    if (!existing.error && existing.data) {
      await admin.from(DIDIT_SESSIONS_TABLE).update(sessionPatch).eq("session_id", sessionId);
    } else if (userId) {
      await admin.from(DIDIT_SESSIONS_TABLE).upsert(
        {
          session_id: sessionId,
          user_id: userId,
          vendor_data: vendorData || userId,
          workflow_id: String(payload.workflow_id ?? ""),
          role,
          status: isDiditSessionStatus(status) ? status : "Not Started",
          decision,
          resubmit_info: resubmitInfo,
          metadata,
          updated_at: new Date().toISOString()
        },
        { onConflict: "session_id" }
      );
    }
  }

  if (!userId || !isDiditSessionStatus(status)) return;

  const current = await loadCurrentStatus(admin, userId);
  const nextStatus = mapDiditStatusToProfile(status, current);
  const now = new Date().toISOString();
  const profilePatch: Record<string, unknown> = {
    identity_verification_status: nextStatus,
    identity_verification_method: IDENTITY_VERIFICATION_METHOD_DIDIT,
    updated_at: now
  };

  if (nextStatus === "verified") {
    profilePatch.identity_verified_at = now;
  } else if (status === "Kyc Expired") {
    profilePatch.identity_verified_at = null;
  }

  const { error } = await admin.from(PROFILES_TABLE).update(profilePatch).eq("id", userId);
  if (error) throw new Error(error.message);
}

export type LatestDiditSession = {
  status: DiditSessionStatus | string;
  created_at: string | null;
};

export async function fetchLatestDiditSession(
  supabase: SupabaseClient,
  userId: string
): Promise<{ session: LatestDiditSession | null; missingSchema: boolean }> {
  const { data, error } = await supabase
    .from(DIDIT_SESSIONS_TABLE)
    .select("status, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return { session: null, missingSchema: isPostgrestSchemaDriftError(error.message) };
  }
  if (!data) return { session: null, missingSchema: false };
  return {
    session: {
      status: String((data as { status?: unknown }).status ?? ""),
      created_at: String((data as { created_at?: unknown }).created_at ?? "") || null
    },
    missingSchema: false
  };
}
