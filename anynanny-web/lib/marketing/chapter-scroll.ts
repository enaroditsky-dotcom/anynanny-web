export function computeChapterScrollTop(input: {
  scrollY: number;
  headerHeight: number;
  viewportHeight: number;
  contentTop: number;
  contentHeight: number;
  headingTop: number;
  gap?: number;
  maxScroll?: number;
}): number {
  const H = input.headerHeight;
  const V = input.viewportHeight;
  const U = Math.max(0, V - H);
  const C = input.contentHeight;
  const gap = input.gap ?? Math.max(12, Math.round(V * 0.03));
  const maxScroll = input.maxScroll ?? Number.POSITIVE_INFINITY;
  const fits = C <= U - gap * 2;
  const unclamped = fits
    ? input.scrollY + input.contentTop - H - (U - C) / 2
    : input.scrollY + input.headingTop - H - gap;
  const min = 0;
  const max = Math.max(0, maxScroll);
  return Math.min(max, Math.max(min, unclamped));
}
