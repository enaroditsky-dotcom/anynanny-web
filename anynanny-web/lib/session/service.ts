import { listSessions, saveSessions } from "@/lib/session/repository";
import type { SessionParty, SessionRecord, SessionView } from "@/lib/session/types";

function roundTwo(value: number): number {
  return Math.round(value * 100) / 100;
}

function diffMinutes(startIso: string, endIso: string): number {
  const startMs = new Date(startIso).getTime();
  const endMs = new Date(endIso).getTime();
  return Math.max(0, Math.floor((endMs - startMs) / 60000));
}

function toView(record: SessionRecord): SessionView {
  const endRef = record.endedAt ?? new Date().toISOString();
  const exactMinutes = record.startedAt ? diffMinutes(record.startedAt, endRef) : 0;
  const accumulatedCostNis = roundTwo((record.hourlyRateNis / 60) * exactMinutes);
  let waitingFor: SessionParty | undefined;
  if (record.status === "waiting_start") waitingFor = record.startConfirmations.parent ? "sitter" : "parent";
  if (record.status === "waiting_end") waitingFor = record.endConfirmations.parent ? "sitter" : "parent";
  return { ...record, waitingFor, exactMinutes, accumulatedCostNis };
}

export async function getSession(sessionId: string): Promise<SessionView | null> {
  const all = await listSessions();
  const record = all.find((item) => item.sessionId === sessionId);
  return record ? toView(record) : null;
}

export async function confirmSession(input: {
  sessionId?: string;
  bookingId: string;
  sitterId: string;
  parentName: string;
  hourlyRateNis: number;
  party: SessionParty;
  action: "start" | "end";
  reassurancePingEnabled?: boolean;
}): Promise<SessionView> {
  const all = await listSessions();
  const existingIndex = input.sessionId ? all.findIndex((item) => item.sessionId === input.sessionId) : -1;

  let record: SessionRecord;
  if (existingIndex === -1) {
    record = {
      sessionId: `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      bookingId: input.bookingId,
      sitterId: input.sitterId,
      parentName: input.parentName,
      hourlyRateNis: input.hourlyRateNis,
      status: "waiting_start",
      startConfirmations: {},
      endConfirmations: {},
      reassurancePingEnabled: input.reassurancePingEnabled ?? true,
      pingedHours: []
    };
    all.push(record);
  } else {
    record = all[existingIndex];
  }

  const nowIso = new Date().toISOString();
  if (input.action === "start") {
    record.startConfirmations[input.party] = nowIso;
    record.status = record.startConfirmations.parent && record.startConfirmations.sitter ? "active" : "waiting_start";
    if (record.status === "active") record.startedAt = nowIso;
  } else {
    record.endConfirmations[input.party] = nowIso;
    record.status = record.endConfirmations.parent && record.endConfirmations.sitter ? "completed" : "waiting_end";
    if (record.status === "completed") record.endedAt = nowIso;
  }

  const idx = all.findIndex((item) => item.sessionId === record.sessionId);
  all[idx] = record;
  await saveSessions(all);
  return toView(record);
}

function hourKey(iso: string): string {
  return iso.slice(0, 13);
}

function listElapsedHourKeys(startIso: string, endIso: string): string[] {
  const startMs = new Date(startIso).getTime();
  const endMs = new Date(endIso).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return [];

  const firstFullHour = new Date(startMs);
  firstFullHour.setMinutes(0, 0, 0);
  if (firstFullHour.getTime() <= startMs) {
    firstFullHour.setHours(firstFullHour.getHours() + 1);
  }

  const keys: string[] = [];
  for (let cursor = firstFullHour.getTime(); cursor <= endMs; cursor += 60 * 60 * 1000) {
    keys.push(hourKey(new Date(cursor).toISOString()));
  }
  return keys;
}

export async function getDueReassurancePings(sessionId: string): Promise<{ session: SessionView; dueHours: string[] }> {
  const all = await listSessions();
  const index = all.findIndex((item) => item.sessionId === sessionId);
  if (index === -1) {
    throw new Error("Session not found.");
  }

  const record = all[index];
  if (!record.reassurancePingEnabled || !record.startedAt || record.status !== "active") {
    return { session: toView(record), dueHours: [] };
  }

  const dueHourKeys = listElapsedHourKeys(record.startedAt, new Date().toISOString());
  const sent = new Set(record.pingedHours);
  const newlyDue = dueHourKeys.filter((key) => !sent.has(key));
  if (newlyDue.length === 0) {
    return { session: toView(record), dueHours: [] };
  }

  record.pingedHours = [...record.pingedHours, ...newlyDue].sort();
  all[index] = record;
  await saveSessions(all);
  return { session: toView(record), dueHours: newlyDue };
}
