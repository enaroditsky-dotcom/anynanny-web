import { RATINGS_TABLE } from "@/lib/ratings/constants";
import type { SupabaseClient } from "@supabase/supabase-js";

const LOCAL_RATED_PREFIX = "anynanny_parent_rated_session_";

export function markParentSessionRatedLocally(sessionId: string): void {
  if (typeof window === "undefined") return;
  const id = sessionId.trim();
  if (!id) return;
  try {
    sessionStorage.setItem(`${LOCAL_RATED_PREFIX}${id}`, "1");
  } catch {
    /* ignore */
  }
}

export function isParentSessionRatedLocally(sessionId: string): boolean {
  if (typeof window === "undefined") return false;
  const id = sessionId.trim();
  if (!id) return false;
  try {
    return sessionStorage.getItem(`${LOCAL_RATED_PREFIX}${id}`) === "1";
  } catch {
    return false;
  }
}

export function clearParentSessionRatedLocally(sessionId: string): void {
  if (typeof window === "undefined") return;
  const id = sessionId.trim();
  if (!id) return;
  try {
    sessionStorage.removeItem(`${LOCAL_RATED_PREFIX}${id}`);
  } catch {
    /* ignore */
  }
}

/** True when the parent already submitted a rating for this session. */
export async function parentHasRatedSession(
  supabase: SupabaseClient,
  sessionId: string,
  parentId: string
): Promise<boolean> {
  const sid = sessionId.trim();
  const uid = parentId.trim();
  if (!sid || !uid) return false;

  if (isParentSessionRatedLocally(sid)) return true;

  const { data, error } = await supabase
    .from(RATINGS_TABLE)
    .select("id")
    .eq("session_id", sid)
    .eq("from_user_id", uid)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn("[parentHasRatedSession]", error.message);
    return isParentSessionRatedLocally(sid);
  }

  const rated = Boolean(data?.id);
  if (rated) markParentSessionRatedLocally(sid);
  return rated;
}
