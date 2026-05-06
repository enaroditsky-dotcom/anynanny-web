import { getParentPreferences, upsertParentPreferences } from "@/lib/parent/service";
import type { ParentPreferences } from "@/lib/parent/types";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parentName = String(searchParams.get("parentName") ?? "הורה").trim();
  const preferences = await getParentPreferences(parentName);
  return NextResponse.json({ preferences });
}

export async function POST(request: Request) {
  const body = (await request.json()) as Partial<ParentPreferences>;
  const parentName = String(body.parentName ?? "").trim();
  if (!parentName) {
    return NextResponse.json({ error: "parentName is required." }, { status: 400 });
  }

  const next: ParentPreferences = {
    parentName,
    favoriteSitterId: String(body.favoriteSitterId ?? "").trim(),
    reassurancePingEnabled: Boolean(body.reassurancePingEnabled),
    transportMode: body.transportMode === "self" ? "self" : body.transportMode === "no_taxi" ? "no_taxi" : "taxi",
    locationLabel: String(body.locationLabel ?? "").trim() || "תל אביב",
    minRate: Math.max(0, Number(body.minRate ?? 0)),
    maxRate: Math.max(0, Number(body.maxRate ?? 0)),
    preferredGender: body.preferredGender === "male" ? "male" : body.preferredGender === "female" ? "female" : "all",
    minAge: Math.max(18, Number(body.minAge ?? 18)),
    minExperienceYears: Math.max(0, Number(body.minExperienceYears ?? 0)),
    minRating: Math.max(0, Math.min(5, Number(body.minRating ?? 0))),
    calendarSyncGoogle: Boolean(body.calendarSyncGoogle),
    calendarSyncPhone: Boolean(body.calendarSyncPhone)
  };

  const preferences = await upsertParentPreferences(next);
  return NextResponse.json({ ok: true, preferences });
}
