import type { CSSProperties } from "react";

/** Fixed square footprint — compact for mobile card (no overflow). */
export const SESSION_CIRCLE_SIZE_CLASS =
  "size-48 w-48 h-48 max-h-48 max-w-48 shrink-0 aspect-square";

/** Shared outer classes for session action / summary circles (parent + sitter dashboards). */
export const SESSION_CIRCLE_SHELL_CLASS =
  "relative rounded-full overflow-visible ring-2 text-base font-bold leading-tight text-white sm:text-lg [border-radius:50%!important]";

/** Locked circle geometry — fixed 12rem square so height/width never diverge. */
export const SESSION_ACTION_CIRCLE_STYLE: CSSProperties = {
  width: "12rem",
  height: "12rem",
  minWidth: "12rem",
  minHeight: "12rem",
  maxWidth: "12rem",
  maxHeight: "12rem",
  flexShrink: 0,
  borderRadius: "50%",
  aspectRatio: "1 / 1",
  overflow: "visible",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexDirection: "column",
  textAlign: "center",
  boxSizing: "border-box"
};

/** Inner content stack — absolute fill keeps timer/price dead-center. */
export const SESSION_CIRCLE_INNER_CLASS =
  "absolute inset-0 flex flex-col items-center justify-center gap-0.5 px-2 text-center";
