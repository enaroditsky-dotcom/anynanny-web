import { NextResponse } from "next/server";
import {
  MARKETING_LIKE_MAX_BODY_BYTES,
  MARKETING_LIKE_UNAVAILABLE_MESSAGE,
  parseLikeRequestBody
} from "@/lib/marketing/likes";
import { hashMarketingLikeToken, likePepperFromEnv } from "@/lib/marketing/likes-hash";
import {
  allowMarketingLikeRequest,
  marketingLikeClientKey
} from "@/lib/marketing/like-rate-limit";
import { getMarketingLikeStore } from "@/lib/marketing/likes-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function POST(request: Request) {
  if (!allowMarketingLikeRequest(marketingLikeClientKey(request))) {
    return jsonError("יותר מדי בקשות. נסו שוב בעוד כמה דקות.", 429);
  }

  const contentLength = Number(request.headers.get("content-length") || "0");
  if (Number.isFinite(contentLength) && contentLength > MARKETING_LIKE_MAX_BODY_BYTES) {
    return jsonError("בקשה לא תקינה.", 413);
  }

  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    return jsonError("בקשה לא תקינה.", 400);
  }

  const parsed = parseLikeRequestBody(body);
  if (!parsed.ok) {
    return jsonError(parsed.error, 400);
  }

  try {
    const store = await getMarketingLikeStore();
    const tokenHash = hashMarketingLikeToken(parsed.token, likePepperFromEnv());
    const status = await store.insert(tokenHash);
    return NextResponse.json({ ok: true, status });
  } catch (error) {
    if (error instanceof Error && error.message === "MARKETING_LIKES_UNCONFIGURED") {
      return jsonError(MARKETING_LIKE_UNAVAILABLE_MESSAGE, 503);
    }
    return jsonError(MARKETING_LIKE_UNAVAILABLE_MESSAGE, 503);
  }
}
