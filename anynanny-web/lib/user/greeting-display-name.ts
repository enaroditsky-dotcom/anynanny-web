/**
 * Display names for dashboard greetings — never show raw email or local-parts.
 */

export function sanitizeGreetingDisplayName(
  name: string | null | undefined,
  userEmail?: string | null
): string | null {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return null;
  if (trimmed.includes("@")) return null;

  const emailLocal = userEmail?.split("@")[0]?.trim().toLowerCase() ?? "";
  const normalized = trimmed.toLowerCase();

  if (emailLocal && normalized === emailLocal) return null;

  if (emailLocal && normalized.includes("+")) {
    const emailBase = emailLocal.split("+")[0] ?? "";
    const nameBase = normalized.split("+")[0] ?? "";
    if (emailBase && nameBase === emailBase) return null;
    if (emailLocal && normalized.startsWith(`${emailLocal.split("+")[0]}+`)) return null;
  }

  return trimmed;
}

export function pickGreetingDisplayName(
  userEmail: string | null | undefined,
  ...candidates: (string | null | undefined)[]
): string | null {
  for (const candidate of candidates) {
    const sanitized = sanitizeGreetingDisplayName(candidate, userEmail);
    if (sanitized) return sanitized;
  }
  return null;
}

/** Auth metadata full_name when it is a real name (not an email local-part). */
export function resolveFullNameFromAuthUser(user: {
  email?: string | null;
  user_metadata?: Record<string, unknown>;
}): string | null {
  const meta = user.user_metadata;
  if (!meta || typeof meta !== "object") return null;

  const fullName = meta.full_name;
  if (typeof fullName === "string") {
    const sanitized = sanitizeGreetingDisplayName(fullName, user.email);
    if (sanitized) return sanitized;
  }

  const name = meta.name;
  if (typeof name === "string") {
    const sanitized = sanitizeGreetingDisplayName(name, user.email);
    if (sanitized) return sanitized;
  }

  return null;
}
