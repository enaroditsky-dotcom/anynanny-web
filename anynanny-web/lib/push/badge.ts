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

type BadgeCapableRegistration = ServiceWorkerRegistration & {
  clearAppBadge?: () => Promise<void>;
};

async function clearServiceWorkerAppBadge(): Promise<void> {
  try {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const registration = (await navigator.serviceWorker.getRegistration()) as
      | BadgeCapableRegistration
      | undefined;
    if (registration && typeof registration.clearAppBadge === "function") {
      await registration.clearAppBadge();
    }
  } catch {
    /* unsupported or permission — ignore */
  }
}

export async function setAppBadgeCount(count: number): Promise<void> {
  if (typeof navigator === "undefined") return;
  const nav = navigator as Navigator & {
    setAppBadge?: (n?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  if (count <= 0) {
    try {
      if (typeof nav.clearAppBadge === "function") await nav.clearAppBadge();
    } catch {
      /* unsupported or permission — ignore */
    }
    await clearServiceWorkerAppBadge();
    return;
  }
  try {
    if (typeof nav.setAppBadge === "function") await nav.setAppBadge(count);
  } catch {
    /* unsupported or permission — ignore */
  }
}

export async function clearAppBadge(): Promise<void> {
  await setAppBadgeCount(0);
}
