/**
 * App icon badge:
 * unread canonical notifications excluding chat_message
 * + distinct booking_id of incoming unread public.messages
 */
export function computeAppBadgeCount(input: {
  unreadNonChatNotifications: number;
  distinctUnreadIncomingChatBookings: number;
}): number {
  const notifications = Math.max(0, Math.floor(input.unreadNonChatNotifications) || 0);
  const chats = Math.max(0, Math.floor(input.distinctUnreadIncomingChatBookings) || 0);
  return notifications + chats;
}

export async function setAppBadgeCount(count: number): Promise<void> {
  if (typeof navigator === "undefined") return;
  const nav = navigator as Navigator & {
    setAppBadge?: (n?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  try {
    if (count <= 0) {
      if (typeof nav.clearAppBadge === "function") await nav.clearAppBadge();
      return;
    }
    if (typeof nav.setAppBadge === "function") await nav.setAppBadge(count);
  } catch {
    /* unsupported or permission — ignore */
  }
}

export async function clearAppBadge(): Promise<void> {
  await setAppBadgeCount(0);
}
