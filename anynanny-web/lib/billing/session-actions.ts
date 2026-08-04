"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { calculateBillingFromSession } from "@/lib/billing/session-calculator";
import {
  BILLING_SESSION_STATUS,
  DEFAULT_HOURLY_RATE,
  SESSIONS_TABLE,
  type BillingSessionRow
} from "@/lib/billing/session-types";
import { SITTER_PROFILES_TABLE } from "@/lib/sitter/sitter-profile";

export type SessionActionResult<T> =
  | { ok: true; row: T }
  | { ok: false; error: unknown };

export async function fetchSitterHourlyRate(
  supabase: SupabaseClient,
  sitterId: string
): Promise<number> {
  const { data } = await supabase
    .from(SITTER_PROFILES_TABLE)
    .select("hourly_rate_nis")
    .eq("id", sitterId)
    .maybeSingle();

  const rate = Number(data?.hourly_rate_nis);
  return Number.isFinite(rate) && rate > 0 ? rate : DEFAULT_HOURLY_RATE;
}

/** Parent Double-Shake: open a pending session with start_time_requested. */
export async function insertPendingSession(
  supabase: SupabaseClient,
  params: { parentId: string; sitterId: string; hourlyRate: number }
): Promise<SessionActionResult<BillingSessionRow>> {
  const startRequestedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from(SESSIONS_TABLE)
    .insert({
      parent_id: params.parentId,
      sitter_id: params.sitterId,
      hourly_rate: params.hourlyRate,
      status: BILLING_SESSION_STATUS.PENDING,
      start_time_requested: startRequestedAt
    })
    .select("*")
    .single();

  if (error) return { ok: false, error };
  return { ok: true, row: data as BillingSessionRow };
}

/** Sitter Double-Shake: confirm shift start — billable clock begins. */
export async function confirmSessionStartBySitter(
  supabase: SupabaseClient,
  params: { sessionId: string; sitterId: string }
): Promise<SessionActionResult<BillingSessionRow>> {
  const confirmedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from(SESSIONS_TABLE)
    .update({
      status: BILLING_SESSION_STATUS.ACTIVE,
      sitter_id: params.sitterId,
      start_time_confirmed_by_sitter: confirmedAt
    })
    .eq("id", params.sessionId)
    .select("*")
    .single();

  if (error) return { ok: false, error };
  return { ok: true, row: data as BillingSessionRow };
}

/** Parent requests end — live timer caps at this timestamp. */
export async function requestSessionEnd(
  supabase: SupabaseClient,
  sessionId: string
): Promise<SessionActionResult<BillingSessionRow>> {
  const endRequestedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from(SESSIONS_TABLE)
    .update({ end_time_requested: endRequestedAt })
    .eq("id", sessionId)
    .select("*")
    .single();

  if (error) return { ok: false, error };
  return { ok: true, row: data as BillingSessionRow };
}

/** Parent confirms end — finalize minute-level billing. */
export async function confirmSessionEndByParent(
  supabase: SupabaseClient,
  row: Pick<
    BillingSessionRow,
    "id" | "start_time_confirmed_by_sitter" | "hourly_rate"
  >
): Promise<SessionActionResult<BillingSessionRow>> {
  const endConfirmedAt = new Date().toISOString();
  const hourlyRate = Number(row.hourly_rate) || DEFAULT_HOURLY_RATE;
  const { totalMinutes, totalAmount } = calculateBillingFromSession(
    {
      startTimeConfirmedBySitter: row.start_time_confirmed_by_sitter,
      endTimeConfirmedByParent: endConfirmedAt
    },
    hourlyRate
  );

  const { data, error } = await supabase
    .from(SESSIONS_TABLE)
    .update({
      status: BILLING_SESSION_STATUS.COMPLETED,
      end_time_confirmed_by_parent: endConfirmedAt,
      total_minutes: totalMinutes,
      total_amount: totalAmount
    })
    .eq("id", row.id)
    .select("*")
    .single();

  if (error) return { ok: false, error };
  return { ok: true, row: data as BillingSessionRow };
}
