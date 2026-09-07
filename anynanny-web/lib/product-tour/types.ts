export type ProductTourAdvanceMode = "click-target" | "next-button";

export type ProductTourPlacement = "top" | "bottom" | "left" | "right" | "auto";

export type ProductTourKey = "parent";

export type ProductTourStep = {
  id: string;
  route: string;
  routeExact?: boolean;
  targetSelector: string | null;
  /** Used when the primary target is absent, e.g. no eligible WhatsApp button. */
  fallbackSelector?: string | null;
  title: string;
  description: string;
  advanceMode: ProductTourAdvanceMode;
  placement?: ProductTourPlacement;
  /** Detect the click but do not keep a toggled control in the new state. */
  preserveTargetState?: boolean;
  /** Intercept target clicks without advancing, e.g. do not open WhatsApp. */
  blockTargetAction?: boolean;
};

export type UserProductTourRow = {
  user_id: string;
  tour_key: ProductTourKey;
  offered_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  declined_at: string | null;
  skipped_at: string | null;
};

export type ParentTourPhase = "idle" | "invite" | "declined-ack" | "touring" | "complete";
