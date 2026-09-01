/** Matches notify_live_chat_message: left(btrim(content), 80) plus ellipsis. */
export const CHAT_MESSAGE_PREVIEW_MAX_CHARS = 80;

export function previewChatMessageContent(content: unknown, maxChars = CHAT_MESSAGE_PREVIEW_MAX_CHARS): string {
  const trimmed = typeof content === "string" ? content.trim() : "";
  if (!trimmed) return "";
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, maxChars)}…`;
}

export function firstNameFromPartnerDisplay(name: string | null | undefined): string | null {
  const trimmed = typeof name === "string" ? name.trim() : "";
  if (!trimmed) return null;
  const first = trimmed.split(/\s+/)[0]?.trim() ?? "";
  return first || null;
}

export function formatIncomingChatToastBody(
  preview: string,
  senderFirstName: string | null | undefined
): string {
  const body = preview.trim();
  const name = firstNameFromPartnerDisplay(senderFirstName);
  if (name && body) return `${name}: ${body}`;
  return body;
}
