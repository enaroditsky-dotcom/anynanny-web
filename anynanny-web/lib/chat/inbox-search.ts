export type InboxSearchableConversation = {
  partner_name?: string | null;
  partner_public_id?: string | null;
};

export function normalizeInboxSearchQuery(query: string): string {
  return query.trim().toLowerCase();
}

function compactId(value: string): string {
  return value.replace(/[\s-]+/g, "");
}

/**
 * Matches a participant display name or AnyNanny public id.
 * "AN-1004", "RAN-1001", "RP-1001", and the numeric fragment "1004" all match that stored id.
 * An empty query matches every conversation.
 */
export function conversationMatchesInboxQuery(
  row: InboxSearchableConversation,
  query: string
): boolean {
  const normalized = normalizeInboxSearchQuery(query);
  if (!normalized) return true;

  const name = (row.partner_name ?? "").trim().toLowerCase();
  const publicId = (row.partner_public_id ?? "").trim().toLowerCase();
  if (name.includes(normalized)) return true;
  if (publicId.includes(normalized)) return true;

  const compactPublicId = compactId(publicId);
  const compactQuery = compactId(normalized);
  if (compactQuery && compactPublicId.includes(compactQuery)) return true;

  const queryHasLetters = /[a-z\u0590-\u05ff]/i.test(normalized);
  const queryDigits = normalized.replace(/\D/g, "");
  const idDigits = publicId.replace(/\D/g, "");
  if (!queryHasLetters && queryDigits.length > 0 && idDigits.includes(queryDigits)) return true;

  return false;
}

export function inboxSearchHasNoMatches(query: string, matchCount: number): boolean {
  return normalizeInboxSearchQuery(query).length > 0 && matchCount === 0;
}
