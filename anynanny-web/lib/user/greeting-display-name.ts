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

/** Auth metadata name when it is a real name (not an email local-part). */
export function resolveFullNameFromAuthUser(user: {
  email?: string | null;
  user_metadata?: Record<string, unknown>;
}): string | null {
  const meta = user.user_metadata;
  if (!meta || typeof meta !== "object") return null;

  const first = typeof meta.first_name === "string" ? meta.first_name.trim() : "";
  const last = typeof meta.last_name === "string" ? meta.last_name.trim() : "";
  const combined = `${first} ${last}`.trim();
  if (combined) {
    const sanitized = sanitizeGreetingDisplayName(combined, user.email);
    if (sanitized) return sanitized;
  }

  const name = meta.name;
  if (typeof name === "string") {
    const sanitized = sanitizeGreetingDisplayName(name, user.email);
    if (sanitized) return sanitized;
  }

  return null;
}

/** Split auth display name into first/last for profiles writes. */
export function resolveNamePartsFromAuthUser(user: {
  email?: string | null;
  user_metadata?: Record<string, unknown>;
}): { first_name?: string; last_name?: string } {
  const meta = user.user_metadata;
  if (meta && typeof meta === "object") {
    const first = typeof meta.first_name === "string" ? meta.first_name.trim() : "";
    const last = typeof meta.last_name === "string" ? meta.last_name.trim() : "";
    if (first || last) {
      return {
        ...(first ? { first_name: first } : {}),
        ...(last ? { last_name: last } : {})
      };
    }
  }

  const combined = resolveFullNameFromAuthUser(user);
  if (!combined) return {};
  const parts = combined.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return { first_name: parts[0] };
  return { first_name: parts[0], last_name: parts.slice(1).join(" ") };
}
