/** Gap between the floating Back button and the admin column. */
export const ADMIN_FLOATING_BACK_CONTENT_GAP = 12;

/** Gap between the floating Back button and the bottom of the shell header. */
export const ADMIN_FLOATING_BACK_HEADER_GAP = 16;

export type AdminFloatingBackFrame = {
  viewportWidth: number;
  viewportHeight: number;
  safeLeft: number;
  safeRight: number;
  safeTop: number;
  safeBottom: number;
  /** Top of the visible admin scrollport, just below the shell header. */
  contentViewportTop: number;
  /** Left edge of the admin main column. */
  contentLeft: number;
  buttonWidth: number;
  buttonHeight: number;
};

export function placeFloatingAdminBackButton(frame: AdminFloatingBackFrame): { top: number; left: number } {
  const minLeft = Math.max(0, frame.safeLeft, 8);
  const minRight = Math.max(0, frame.safeRight, 8);
  const maxLeft = Math.max(minLeft, frame.viewportWidth - frame.buttonWidth - minRight);
  const besideContent = frame.contentLeft - ADMIN_FLOATING_BACK_CONTENT_GAP - frame.buttonWidth;
  const left =
    besideContent >= minLeft && besideContent <= maxLeft
      ? besideContent
      : Math.min(maxLeft, Math.max(minLeft, frame.contentLeft));

  const belowHeader = Math.max(frame.contentViewportTop + ADMIN_FLOATING_BACK_HEADER_GAP, frame.safeTop);
  const top = frame.contentViewportTop >= 48
    ? belowHeader
    : Math.max(120, frame.safeTop + ADMIN_FLOATING_BACK_HEADER_GAP);
  const maxTop = Math.max(frame.safeTop, frame.viewportHeight - frame.buttonHeight - Math.max(frame.safeBottom, 12));
  return { top: Math.min(Math.max(top, frame.safeTop), maxTop), left };
}
