import { DuplicateSessionRatingError, getNannyProfiles, submitNannyRating } from "@/lib/ratings/service";
import { NextResponse } from "next/server";

export async function GET() {
  const profiles = await getNannyProfiles();
  return NextResponse.json({ profiles });
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    sessionId?: string;
    nannyName?: string;
    parentName?: string;
    stars?: number;
    comment?: string;
  };

  const sessionId = String(body.sessionId ?? "").trim();
  const nannyName = String(body.nannyName ?? "").trim();
  const parentName = String(body.parentName ?? "").trim();
  const stars = Number(body.stars ?? 0);
  const comment = String(body.comment ?? "").trim();

  if (!sessionId || !nannyName || !parentName || !comment || !Number.isInteger(stars) || stars < 1 || stars > 5) {
    return NextResponse.json({ error: "Invalid rating payload." }, { status: 400 });
  }

  try {
    const result = await submitNannyRating({
      sessionId,
      nannyName,
      parentName,
      stars,
      comment
    });

    return NextResponse.json({ ok: true, rating: result.rating, profile: result.profile });
  } catch (error) {
    if (error instanceof DuplicateSessionRatingError) {
      return NextResponse.json({ error: "This session has already been rated." }, { status: 409 });
    }

    return NextResponse.json({ error: "Could not submit rating." }, { status: 500 });
  }
}
