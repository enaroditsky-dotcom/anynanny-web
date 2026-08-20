export const PUSH_SUBSCRIPTIONS_TABLE = "push_subscriptions" as const;
export const NOTIFICATION_PUSH_DISPATCHES_TABLE = "notification_push_dispatches" as const;
export const UPSERT_PUSH_SUBSCRIPTION_RPC = "upsert_push_subscription" as const;

export const PUSH_SERVICE_WORKER_URL = "/sw.js";
export const PUSH_ICON_URL = "/icon-192.png";
export const DEFAULT_PUSH_TITLE = "AnyNanny";

export const PUSH_PROMPT_DISMISS_STORAGE_KEY = "anynanny_push_prompt_dismissed_until";
export const PUSH_PROMPT_DISMISS_MS = 7 * 24 * 60 * 60 * 1000;

export const ANYNANNY_PUSH_NAVIGATE_MESSAGE = "ANYNANNY_PUSH_NAVIGATE";
