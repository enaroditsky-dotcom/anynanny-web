export type PushPermissionState = NotificationPermission | "unsupported";

export type PushCapability = {
  serviceWorker: boolean;
  notifications: boolean;
  pushManager: boolean;
  ios: boolean;
  standalone: boolean;
  /** iOS/iPadOS can only use Web Push from an installed Home Screen PWA. */
  iosRequiresStandalone: boolean;
  canSubscribe: boolean;
};

export function isIosLikeUserAgent(
  userAgent: string,
  maxTouchPoints = 0,
  platform = ""
): boolean {
  const ua = userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return true;
  // iPadOS 13+ desktop UA
  return platform === "MacIntel" && maxTouchPoints > 1;
}

export function isStandaloneDisplayMode(
  displayModeStandalone: boolean,
  navigatorStandalone: boolean
): boolean {
  return displayModeStandalone || navigatorStandalone;
}

export function detectPushCapability(input: {
  hasWindow: boolean;
  hasServiceWorker: boolean;
  hasNotifications: boolean;
  hasPushManager: boolean;
  userAgent: string;
  maxTouchPoints: number;
  platform: string;
  displayModeStandalone: boolean;
  navigatorStandalone: boolean;
}): PushCapability {
  const ios = isIosLikeUserAgent(input.userAgent, input.maxTouchPoints, input.platform);
  const standalone = isStandaloneDisplayMode(
    input.displayModeStandalone,
    input.navigatorStandalone
  );
  const baseSupported =
    input.hasWindow &&
    input.hasServiceWorker &&
    input.hasNotifications &&
    input.hasPushManager;
  const canSubscribe = baseSupported && (!ios || standalone);

  return {
    serviceWorker: input.hasServiceWorker,
    notifications: input.hasNotifications,
    pushManager: input.hasPushManager,
    ios,
    standalone,
    iosRequiresStandalone: ios && !standalone,
    canSubscribe
  };
}

export function readBrowserPushCapability(): PushCapability {
  if (typeof window === "undefined") {
    return {
      serviceWorker: false,
      notifications: false,
      pushManager: false,
      ios: false,
      standalone: false,
      iosRequiresStandalone: false,
      canSubscribe: false
    };
  }

  const nav = window.navigator;
  return detectPushCapability({
    hasWindow: true,
    hasServiceWorker: "serviceWorker" in nav,
    hasNotifications: typeof Notification !== "undefined",
    hasPushManager: "PushManager" in window,
    userAgent: nav.userAgent ?? "",
    maxTouchPoints: nav.maxTouchPoints ?? 0,
    platform: nav.platform ?? "",
    displayModeStandalone:
      typeof window.matchMedia === "function" &&
      window.matchMedia("(display-mode: standalone)").matches,
    navigatorStandalone: Boolean((nav as Navigator & { standalone?: boolean }).standalone)
  });
}

export function currentNotificationPermission(): PushPermissionState {
  if (typeof window === "undefined" || typeof Notification === "undefined") {
    return "unsupported";
  }
  return Notification.permission;
}

export type EffectivePushState = {
  pushEnabled: boolean;
  permission: PushPermissionState;
  hasSubscription: boolean;
  capable: boolean;
  /** User preference + OS grant + stored subscription. */
  active: boolean;
};

export function resolveEffectivePush(input: {
  pushEnabled: boolean;
  permission: PushPermissionState;
  hasSubscription: boolean;
  capable: boolean;
}): EffectivePushState {
  const active =
    input.pushEnabled &&
    input.permission === "granted" &&
    input.hasSubscription &&
    input.capable;
  return {
    ...input,
    active
  };
}

/** Toggle is the preference; helper copy must not claim the OS path is live. */
export function pushSettingsStatusCopy(state: EffectivePushState, iosRequiresStandalone: boolean): string | null {
  if (iosRequiresStandalone) {
    return "כדי לקבל התראות באייפון, הוסיפו את AnyNanny למסך הבית דרך שיתוף → הוספה למסך הבית.";
  }
  if (!state.pushEnabled) return null;
  if (state.permission === "denied") {
    return "ההתראות חסומות בהגדרות המכשיר";
  }
  if (state.permission === "unsupported" || !state.capable) {
    return "התראות דחיפה אינן נתמכות בדפדפן זה.";
  }
  if (state.active) return null;
  if (state.permission === "default" || !state.hasSubscription) {
    return "ההעדפה פעילה, אך נדרש אישור במכשיר כדי לקבל התראות כשהאפליקציה סגורה.";
  }
  return null;
}
