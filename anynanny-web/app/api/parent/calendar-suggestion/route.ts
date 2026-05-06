import { buildSuggestionsForEveningDates } from "@/lib/parent/service";
import { NextResponse } from "next/server";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(request: Request) {
  const body = (await request.json()) as { parentName?: string; eveningDates?: unknown };
  const parentName = String(body.parentName ?? "").trim();
  const rawDates = Array.isArray(body.eveningDates) ? body.eveningDates : [];

  if (!parentName) {
    return NextResponse.json({ error: "parentName is required." }, { status: 400 });
  }

  const eveningDates = rawDates
    .map((d) => String(d ?? "").trim())
    .filter((d) => DATE_ONLY.test(d));

  const suggestions = await buildSuggestionsForEveningDates(parentName, eveningDates);
  return NextResponse.json({ ok: true, suggestions });
}
