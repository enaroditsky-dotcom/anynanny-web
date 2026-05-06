import { confirmSession, getDueReassurancePings, getSession } from "@/lib/session/service";
import type { SessionParty } from "@/lib/session/types";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sessionId = String(searchParams.get("sessionId") ?? "").trim();
  if (!sessionId) return NextResponse.json({ error: "sessionId is required." }, { status: 400 });

  const view = await getSession(sessionId);
  if (!view) return NextResponse.json({ error: "Session not found." }, { status: 404 });

  let ping;
  try {
    ping = await getDueReassurancePings(sessionId);
  } catch {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }
  return NextResponse.json({ session: ping.session, dueReassurancePings: ping.dueHours });
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    sessionId?: string;
    bookingId?: string;
    sitterId?: string;
    parentName?: string;
    hourlyRateNis?: number;
    party?: SessionParty;
    action?: "start" | "end";
    reassurancePingEnabled?: boolean;
  };

  const bookingId = String(body.bookingId ?? "").trim();
  const sitterId = String(body.sitterId ?? "").trim();
  const parentName = String(body.parentName ?? "").trim();
  const hourlyRateNis = Number(body.hourlyRateNis ?? 0);
  const party = body.party;
  const action = body.action;

  if (!bookingId || !sitterId || !parentName || hourlyRateNis <= 0 || (party !== "parent" && party !== "sitter") || (action !== "start" && action !== "end")) {
    return NextResponse.json({ error: "Invalid session confirmation payload." }, { status: 400 });
  }

  const session = await confirmSession({
    sessionId: body.sessionId,
    bookingId,
    sitterId,
    parentName,
    hourlyRateNis,
    party,
    action,
    reassurancePingEnabled: body.reassurancePingEnabled
  });

  return NextResponse.json({ ok: true, session });
}
