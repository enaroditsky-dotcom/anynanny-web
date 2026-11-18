"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export const PARENT_CALENDAR_BADGE_SLOT = "parent-calendar";
export const SITTER_SHIFTS_BADGE_SLOT = "sitter-shifts";

/** Mounts existing dashboard indicators into a bottom-nav slot. No data of its own. */
export function NavBadgePortal({
  slot,
  children
}: {
  slot: typeof PARENT_CALENDAR_BADGE_SLOT | typeof SITTER_SHIFTS_BADGE_SLOT;
  children: ReactNode;
}) {
  const [node, setNode] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setNode(document.querySelector<HTMLElement>(`[data-nav-badge-slot="${slot}"]`));
  }, [slot]);

  if (!node) return null;
  return createPortal(children, node);
}
