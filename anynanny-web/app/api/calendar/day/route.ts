import { getSlotsForDay } from "@/lib/calendar/service";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sitterId = String(searchParams.get("sitterId") ?? "").trim();
  const date = String(searchParams.get("date") ?? "").trim();

  if (!sitterId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Invalid sitterId or date." }, { status: 400 });
  }

  const slots = await getSlotsForDay(sitterId, date);
  return NextResponse.json({ slots });
}
