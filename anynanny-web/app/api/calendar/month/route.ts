import { getMonthSummary } from "@/lib/calendar/service";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sitterId = String(searchParams.get("sitterId") ?? "").trim();
  const year = Number(searchParams.get("year"));
  const month = Number(searchParams.get("month"));

  if (!sitterId || !Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return NextResponse.json({ error: "Invalid parameters." }, { status: 400 });
  }

  const summary = await getMonthSummary(sitterId, year, month - 1);
  const days = Object.fromEntries(summary.entries());
  return NextResponse.json({ days });
}
