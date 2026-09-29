/** Leftward travel that opens the delete confirmation. */
export const SWIPE_DELETE_THRESHOLD_PX = 80;

/** Movement inside this box is a tap, not a swipe. The card does not move yet. */
export const SWIPE_DEADZONE_PX = 12;

/**
 * Claim the touch for a leftward drag before the browser's scroll gesture commits.
 * This is earlier than the deadzone so a real swipe is not stolen by the page scroller.
 */
export const SWIPE_CLAIM_PX = 8;

/**
 * The winning axis must clearly exceed the other by this factor.
 * A small diagonal jitter does not lock either axis.
 */
export const SWIPE_AXIS_LOCK_RATIO = 1.2;

/** How far the card is allowed to follow the finger. */
export const SWIPE_MAX_DRAG_PX = 112;

export type SwipeAxis = "undecided" | "horizontal" | "vertical";

export type SwipeGestureState = {
  offsetPx: number;
  confirmOpen: boolean;
};

export function classifySwipeAxis(dx: number, dy: number): SwipeAxis {
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  if (absX < SWIPE_DEADZONE_PX && absY < SWIPE_DEADZONE_PX) return "undecided";
  if (absX >= SWIPE_DEADZONE_PX && absX >= absY * SWIPE_AXIS_LOCK_RATIO) return "horizontal";
  if (absY >= SWIPE_DEADZONE_PX && absY >= absX * SWIPE_AXIS_LOCK_RATIO) return "vertical";
  return "undecided";
}

/**
 * One sample of an in-progress swipe.
 * Once an axis is locked, later samples stay on that axis so a finger curve
 * does not cancel a swipe that already started, and a scroll does not become a swipe.
 * blockScroll is true only while the card should follow the finger.
 */
export function activeSwipeFrame(
  dx: number,
  dy: number,
  locked: SwipeAxis
): { axis: SwipeAxis; offsetPx: number; blockScroll: boolean } {
  if (locked === "vertical") {
    return { axis: "vertical", offsetPx: 0, blockScroll: false };
  }
  const axis = locked === "horizontal" ? "horizontal" : classifySwipeAxis(dx, dy);
  if (axis !== "horizontal") {
    return { axis, offsetPx: 0, blockScroll: false };
  }
  return { axis: "horizontal", offsetPx: swipeOffsetPx(dx), blockScroll: true };
}

/** True when this touch should not scroll the page or the conversation list. */
export function shouldClaimHorizontalTouch(dx: number, dy: number, locked: SwipeAxis): boolean {
  if (locked === "vertical") return false;
  if (locked === "horizontal") return true;
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  return dx < 0 && absX > absY && absX >= SWIPE_CLAIM_PX;
}

/** Screen-left is negative clientX delta. Rightward drags do not reveal delete. */
export function swipeOffsetPx(dx: number): number {
  if (dx >= 0) return 0;
  return Math.max(dx, -SWIPE_MAX_DRAG_PX);
}

export function swipeReleaseAction(dx: number): "confirm" | "snap-back" {
  if (dx <= -SWIPE_DELETE_THRESHOLD_PX) return "confirm";
  return "snap-back";
}

export function initialSwipeGestureState(): SwipeGestureState {
  return { offsetPx: 0, confirmOpen: false };
}

export function reduceSwipeRelease(dx: number, dy: number): SwipeGestureState {
  if (classifySwipeAxis(dx, dy) !== "horizontal" || swipeReleaseAction(dx) !== "confirm") {
    return { offsetPx: 0, confirmOpen: false };
  }
  return { offsetPx: swipeOffsetPx(dx), confirmOpen: true };
}

export function reduceSwipeCancel(): SwipeGestureState {
  return { offsetPx: 0, confirmOpen: false };
}
