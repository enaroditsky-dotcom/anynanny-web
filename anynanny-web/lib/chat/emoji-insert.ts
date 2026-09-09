/** Insert Unicode text at an `<input>` selection. Indices are UTF-16, matching `selectionStart`. */
export function insertTextAtSelection(
  text: string,
  insertion: string,
  selectionStart: number | null | undefined,
  selectionEnd: number | null | undefined
): { value: string; selectionStart: number } {
  const len = text.length;
  const rawStart = selectionStart == null ? len : selectionStart;
  const rawEnd = selectionEnd == null ? rawStart : selectionEnd;
  const start = Math.max(0, Math.min(Math.floor(rawStart), len));
  const end = Math.max(start, Math.min(Math.floor(rawEnd), len));
  return {
    value: `${text.slice(0, start)}${insertion}${text.slice(end)}`,
    selectionStart: start + insertion.length
  };
}

/** Same rule the composer uses before send — emoji-only drafts are sendable. */
export function isChatDraftSendable(text: string): boolean {
  return text.trim().length > 0;
}

export type EmojiPickerDismissReason = "toggle" | "outside" | "escape" | "select";

/** Selecting an emoji inserts text and must leave the picker open. */
export function nextEmojiPickerOpen(open: boolean, reason: EmojiPickerDismissReason): boolean {
  if (reason === "toggle") return !open;
  if (reason === "outside" || reason === "escape") return false;
  if (reason === "select") return open;
  return open;
}
