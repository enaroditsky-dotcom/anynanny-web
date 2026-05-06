import { upsertNannyProfile } from "@/lib/ratings/service";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    anyNannyId?: string;
    nannyName?: string;
    gender?: "male" | "female";
    hourlyRateNis?: number;
    age?: number;
    experienceYears?: number;
  };

  const nannyName = String(body.nannyName ?? "").trim();
  const gender = body.gender === "male" ? "male" : "female";
  const hourlyRateNis = Number(body.hourlyRateNis ?? 0);
  const age = Number(body.age ?? 0);
  const experienceYears = Number(body.experienceYears ?? 0);

  if (!nannyName || hourlyRateNis <= 0 || age < 18 || experienceYears < 0) {
    return NextResponse.json({ error: "Invalid profile payload." }, { status: 400 });
  }

  const profile = await upsertNannyProfile({
    anyNannyId: String(body.anyNannyId ?? "").trim() || undefined,
    nannyName,
    gender,
    hourlyRateNis,
    age,
    experienceYears
  });
  return NextResponse.json({ ok: true, profile });
}
