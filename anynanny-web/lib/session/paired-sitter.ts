/** Resolved nanny/sitter user id for pairing pending sessions (localStorage override or dev env). */
export function getPairedSitterUserId(): string | null {
  if (typeof window === "undefined") return null;
  const fromStorage = window.localStorage.getItem("anynanny_paired_sitter_user_id")?.trim();
  const fromEnv = process.env.NEXT_PUBLIC_DEV_SITTER_USER_ID?.trim();
  return fromStorage || fromEnv || null;
}
