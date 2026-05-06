import { appendChatInitiation } from "@/lib/chat/repository";
import type { ChatInitiationInput, ChatInitiationLog } from "@/lib/chat/types";

function buildPrefilledMessage(input: ChatInitiationInput): string {
  return `Hi ${input.sitterName}, I'm ${input.parentName} reaching out from AnyNanny regarding the booking on ${new Date(
    input.bookingDate
  ).toLocaleString()}.`;
}

function sanitizePhone(phone: string): string {
  return phone.replace(/[^\d+]/g, "");
}

export function generateExternalChatLink(input: ChatInitiationInput): string {
  const message = encodeURIComponent(buildPrefilledMessage(input));

  if (input.platform === "whatsapp") {
    const phone = sanitizePhone(input.sitterPhone ?? "");
    if (!phone) {
      throw new Error("Missing sitter WhatsApp phone.");
    }
    return `https://wa.me/${phone}?text=${message}`;
  }

  const username = (input.sitterTelegramUsername ?? "").replace("@", "").trim();
  if (!username) {
    throw new Error("Missing sitter Telegram username.");
  }
  return `https://t.me/${username}?text=${message}`;
}

export async function initiateExternalChat(input: ChatInitiationInput): Promise<{ externalLink: string; log: ChatInitiationLog }> {
  const externalLink = generateExternalChatLink(input);

  const log: ChatInitiationLog = {
    bookingId: input.bookingId,
    bookingDate: input.bookingDate,
    parentName: input.parentName,
    sitterName: input.sitterName,
    platform: input.platform,
    externalLink,
    initiatedAt: new Date().toISOString()
  };

  await appendChatInitiation(log);
  return { externalLink, log };
}
