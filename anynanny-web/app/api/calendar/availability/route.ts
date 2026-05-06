import { setDayAvailability } from "@/lib/calendar/service";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    sitterId?: string;
    date?: string;
    availableSlots?: number[];
  };

  const sitterId = String(body.sitterId ?? "").trim();
  const date = String(body.date ?? "").trim();
  const availableSlots = Array.isArray(body.availableSlots) ? body.availableSlots : [];

  if (!sitterId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  await setDayAvailability(sitterId, date, availableSlots);
  return NextResponse.json({ ok: true });
}
