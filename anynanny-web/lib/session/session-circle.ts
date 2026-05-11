import type { CSSProperties } from "react";

/** Locked circle geometry — text cannot stretch the hit target (Double-Shake primary control). */
export const SESSION_ACTION_CIRCLE_STYLE: CSSProperties = {
  width: 240,
  height: 240,
  minWidth: 240,
  minHeight: 240,
  maxWidth: 240,
  maxHeight: 240,
  flexShrink: 0,
  borderRadius: "50%",
  aspectRatio: "1 / 1",
  overflow: "hidden",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexDirection: "column",
  textAlign: "center",
  padding: "2rem",
  boxSizing: "border-box"
};
