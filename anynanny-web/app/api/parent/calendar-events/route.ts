/**
 * Calendar integration model: read-only Free/Busy (no titles or descriptions persisted).
 * Google OAuth should request only `calendar.freebusy` scope — never full calendar read/write.
 */
import { listBusySlotsForParent, upsertBusySlot } from "@/lib/parent/service";
import type { ParentBusySlot } from "@/lib/parent/types";
import { NextResponse } from "next/server";

function hasForbiddenPayload(body: Record<string, unknown>): boolean {
  const title = body.title;
  const description = body.description;
  const location = body.location;
  const summary = body.summary;
  if (typeof title === "string" && title.trim()) return true;
  if (typeof description === "string" && description.trim()) return true;
  if (typeof location === "string" && location.trim()) return true;
  if (typeof summary === "string" && summary.trim()) return true;
  return false;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parentName = String(searchParams.get("parentName") ?? "הורה").trim();
  const busySlots = await listBusySlotsForParent(parentName);
  return NextResponse.json({ busySlots });
}

export async function POST(request: Request) {
  const body = (await request.json()) as Record<string, unknown>;
  if (hasForbiddenPayload(body)) {
    return NextResponse.json(
      { error: "Event details cannot be stored. Send only free/busy start and end times." },
      { status: 400 }
    );
  }

  const parentName = String(body.parentName ?? "").trim();
  const startsAt = String(body.startsAt ?? "").trim();
  const endsAt = String(body.endsAt ?? "").trim();

  if (!parentName || !startsAt || !endsAt) {
    return NextResponse.json({ error: "Invalid free/busy payload." }, { status: 400 });
  }

  const slot: ParentBusySlot = {
    id: String(body.id ?? `fb_${Date.now()}`),
    parentName,
    startsAt,
    endsAt
  };
  const saved = await upsertBusySlot(slot);
  return NextResponse.json({ ok: true, busySlot: saved });
}
