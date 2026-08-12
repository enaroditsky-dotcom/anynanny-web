import { RATINGS_TABLE } from "@/lib/ratings/constants";
import type { SupabaseClient } from "@supabase/supabase-js";

const LOCAL_RATED_PREFIX = "anynanny_sitter_rated_session_";

export function markSitterSessionRatedLocally(sessionId: string): void {
  if (typeof window === "undefined") return;
  const id = sessionId.trim();
  if (!id) return;
  try {
    sessionStorage.setItem(`${LOCAL_RATED_PREFIX}${id}`, "1");
  } catch {
    /* ignore */
  }
}

export function isSitterSessionRatedLocally(sessionId: string): boolean {
  if (typeof window === "undefined") return false;
  const id = sessionId.trim();
  if (!id) return false;
  try {
    return sessionStorage.getItem(`${LOCAL_RATED_PREFIX}${id}`) === "1";
  } catch {
    return false;
  }
}

/** True when the sitter already submitted a rating for this session. */
export async function sitterHasRatedSession(
  supabase: SupabaseClient,
  sessionId: string,
  sitterId: string
): Promise<boolean> {
  const sid = sessionId.trim();
  const uid = sitterId.trim();
  if (!sid || !uid) return false;

  if (isSitterSessionRatedLocally(sid)) return true;

  const { data, error } = await supabase
    .from(RATINGS_TABLE)
    .select("id")
    .eq("session_id", sid)
    .eq("from_user_id", uid)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn("[sitterHasRatedSession]", error.message);
    return isSitterSessionRatedLocally(sid);
  }

  const rated = Boolean(data?.id);
  if (rated) markSitterSessionRatedLocally(sid);
  return rated;
}
