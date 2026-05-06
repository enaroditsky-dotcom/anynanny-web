import { createBookingRequest } from "@/lib/calendar/service";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    sitterId?: string;
    date?: string;
    slotIndex?: number;
    parentName?: string;
  };

  const sitterId = String(body.sitterId ?? "").trim();
  const date = String(body.date ?? "").trim();
  const slotIndex = Number(body.slotIndex);
  const parentName = String(body.parentName ?? "").trim();

  if (!sitterId || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !parentName) {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const result = await createBookingRequest({ sitterId, date, slotIndex, parentName });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, booking: result.booking });
}
