import { NextResponse } from "next/server";
import { parseDownloadClickRequest } from "@/lib/marketing/parent-download";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 2048;

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") || "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return new NextResponse(null, { status: 413 });
  }

  let raw = "";
  try {
    raw = await request.text();
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  if (raw.length > MAX_BODY_BYTES) {
    return new NextResponse(null, { status: 413 });
  }

  let body: unknown = null;
  try {
    body = JSON.parse(raw);
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  const event = parseDownloadClickRequest(body);
  if (!event) {
    return new NextResponse(null, { status: 400 });
  }

  console.info("[download-click]", event);
  return new NextResponse(null, { status: 204 });
}
