import { initiateExternalChat } from "@/lib/chat/service";
import type { ChatInitiationInput } from "@/lib/chat/types";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = (await request.json()) as Partial<ChatInitiationInput>;

  const payload: ChatInitiationInput = {
    bookingId: String(body.bookingId ?? "").trim(),
    bookingDate: String(body.bookingDate ?? "").trim(),
    parentName: String(body.parentName ?? "").trim(),
    sitterName: String(body.sitterName ?? "").trim(),
    platform: body.platform === "telegram" ? "telegram" : "whatsapp",
    sitterPhone: String(body.sitterPhone ?? "").trim() || undefined,
    sitterTelegramUsername: String(body.sitterTelegramUsername ?? "").trim() || undefined
  };

  if (!payload.bookingId || !payload.bookingDate || !payload.parentName || !payload.sitterName) {
    return NextResponse.json({ error: "Missing required booking/chat fields." }, { status: 400 });
  }

  try {
    const result = await initiateExternalChat(payload);
    return NextResponse.json({ ok: true, externalLink: result.externalLink, initiatedAt: result.log.initiatedAt });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not initiate external chat.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
