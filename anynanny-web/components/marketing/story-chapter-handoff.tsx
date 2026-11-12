"use client";

import { useEffect } from "react";
import { storyAnchorFromHash, storyLocationForAnchor } from "@/lib/marketing/chapters";

/**
 * Fragments never reach the server. Shared links such as
 * `www.anynanny.org/#parents` stay on `/` unless the browser moves them.
 */
export function StoryChapterHandoff() {
  useEffect(() => {
    const anchor = storyAnchorFromHash(window.location.hash);
    if (!anchor) return;
    window.location.replace(storyLocationForAnchor(anchor, window.location.search));
  }, []);

  return null;
}
