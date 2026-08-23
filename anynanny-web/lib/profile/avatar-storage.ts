import type { SupabaseClient } from "@supabase/supabase-js";

/** Shared public bucket used by sitter (and now parent) profile photos. */
export const AVATARS_BUCKET = "avatars" as const;

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const ALLOWED_AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export type AvatarUploadResult =
  | { ok: true; publicUrl: string }
  | { ok: false; error: string };

/** One file per user — replace upserts the same object instead of creating orphans. */
export function avatarObjectPath(userId: string): string {
  return `${userId.trim()}/avatar`;
}

export function validateAvatarFile(file: File): string | null {
  if (file.size > MAX_AVATAR_BYTES) {
    return "גודל הקובץ חייב להיות עד 5MB.";
  }
  if (!ALLOWED_AVATAR_TYPES.includes(file.type as (typeof ALLOWED_AVATAR_TYPES)[number])) {
    return "יש להעלות תמונה בפורמט JPEG, PNG או WEBP בלבד.";
  }
  return null;
}

export function avatarPublicUrl(supabase: SupabaseClient, userId: string): string {
  const { data } = supabase.storage.from(AVATARS_BUCKET).getPublicUrl(avatarObjectPath(userId));
  return `${data.publicUrl}?t=${Date.now()}`;
}

export async function uploadOwnAvatar(
  supabase: SupabaseClient,
  userId: string,
  file: File
): Promise<AvatarUploadResult> {
  const validationError = validateAvatarFile(file);
  if (validationError) return { ok: false, error: validationError };

  const { error } = await supabase.storage.from(AVATARS_BUCKET).upload(avatarObjectPath(userId), file, {
    upsert: true,
    contentType: file.type,
    cacheControl: "3600"
  });

  if (error) {
    return { ok: false, error: error.message || "העלאת התמונה נכשלה." };
  }

  return { ok: true, publicUrl: avatarPublicUrl(supabase, userId) };
}

export async function removeOwnAvatar(
  supabase: SupabaseClient,
  userId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.storage.from(AVATARS_BUCKET).remove([avatarObjectPath(userId)]);
  return { error: error?.message ?? null };
}

function isSafeAvatarObjectName(name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed) return false;
  if (trimmed === "." || trimmed === "..") return false;
  if (trimmed.includes("/") || trimmed.includes("\\")) return false;
  return true;
}

/**
 * Best-effort Storage cleanup for account deletion.
 * User id comes only from the authenticated session — never from caller input.
 */
export async function removeAuthenticatedUserAvatars(
  supabase: SupabaseClient
): Promise<{ error: string | null }> {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  const userId = String(authData?.user?.id ?? "").trim();
  if (authError || !userId) {
    return { error: authError?.message || "Not authenticated." };
  }

  const { data: objects, error: listError } = await supabase.storage
    .from(AVATARS_BUCKET)
    .list(userId);

  if (listError) {
    return { error: listError.message };
  }

  const paths = (objects ?? [])
    .map((object) => String(object.name ?? "").trim())
    .filter(isSafeAvatarObjectName)
    .map((name) => `${userId}/${name}`);

  if (paths.length === 0) {
    return { error: null };
  }

  const { error: removeError } = await supabase.storage.from(AVATARS_BUCKET).remove(paths);
  return { error: removeError?.message ?? null };
}
