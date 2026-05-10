import type { CSSProperties } from "react";

/** Locked circle geometry — text cannot stretch the hit target (Double-Shake primary control). */
export const SESSION_ACTION_CIRCLE_STYLE: CSSProperties = {
  width: 260,
  height: 260,
  flexShrink: 0,
  borderRadius: "50%",
  aspectRatio: "1 / 1",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexDirection: "column",
  textAlign: "center",
  padding: "2rem",
  boxSizing: "border-box"
};
