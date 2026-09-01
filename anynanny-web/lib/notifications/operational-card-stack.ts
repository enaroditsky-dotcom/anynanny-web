export const MAX_EXPANDED_OPERATIONAL_CARDS = 2;
export const MAX_COLLAPSED_OPERATIONAL_CARDS = 3;

export type OperationalCardStack<T extends { id: string }> = {
  expanded: T[];
  collapsed: T[];
  overflowCount: number;
};

export function partitionOperationalCards<T extends { id: string }>(
  items: readonly T[],
  hiddenIds: ReadonlySet<string>,
  minimizedIds: ReadonlySet<string>,
  options?: { maxExpanded?: number; maxCollapsed?: number }
): OperationalCardStack<T> {
  const maxExpanded = options?.maxExpanded ?? MAX_EXPANDED_OPERATIONAL_CARDS;
  const maxCollapsed = options?.maxCollapsed ?? MAX_COLLAPSED_OPERATIONAL_CARDS;
  const visible = items.filter((item) => item.id && !hiddenIds.has(item.id));

  const expanded: T[] = [];
  const remainder: T[] = [];
  for (const item of visible) {
    if (minimizedIds.has(item.id) || expanded.length >= maxExpanded) {
      remainder.push(item);
    } else {
      expanded.push(item);
    }
  }

  return {
    expanded,
    collapsed: remainder.slice(0, maxCollapsed),
    overflowCount: Math.max(0, remainder.length - maxCollapsed)
  };
}

/** Collapse the oldest expanded card so `expandId` can take an expanded slot. */
export function minimizedIdsAfterExpand<T extends { id: string }>(
  items: readonly T[],
  hiddenIds: ReadonlySet<string>,
  minimizedIds: ReadonlySet<string>,
  expandId: string,
  maxExpanded = MAX_EXPANDED_OPERATIONAL_CARDS
): Set<string> {
  const id = expandId.trim();
  const next = new Set(minimizedIds);
  if (!id) return next;
  next.delete(id);

  const preview = partitionOperationalCards(items, hiddenIds, next, {
    maxExpanded,
    maxCollapsed: Number.POSITIVE_INFINITY
  });
  if (preview.expanded.some((item) => item.id === id) && preview.expanded.length <= maxExpanded) {
    return next;
  }

  const currentlyExpanded = partitionOperationalCards(items, hiddenIds, minimizedIds, {
    maxExpanded,
    maxCollapsed: Number.POSITIVE_INFINITY
  }).expanded;
  const oldest = currentlyExpanded[currentlyExpanded.length - 1];
  if (oldest && oldest.id !== id) next.add(oldest.id);
  next.delete(id);
  return next;
}
