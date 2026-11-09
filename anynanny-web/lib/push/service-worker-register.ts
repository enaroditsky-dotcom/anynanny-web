import { WEB_APP_ORIGIN } from "@/lib/hosts/app-entry";
import { resolveRootEntry } from "@/lib/hosts/root-entry";
import {
  DOMAIN_SEPARATION_ENABLED,
  WWW_MARKETING_ROOT_ENABLED,
  classifySitePath
} from "@/lib/hosts/site-classifier";
import { PUSH_SERVICE_WORKER_URL } from "@/lib/push/constants";

let registrationPromise: Promise<ServiceWorkerRegistration | null> | null = null;

/**
 * The application origin always keeps push once domain separation is on.
 * Marketing pages on any other host do not register a worker, so they are not
 * offered as the AnyNanny PWA. An existing registration is left in place.
 * While domain separation is off, every page still registers, because www is
 * the current application origin.
 */
export function shouldRegisterPushServiceWorker(
  origin: string,
  pathname: string,
  options?: {
    domainSeparationEnabled?: boolean;
    wwwMarketingRootEnabled?: boolean;
  }
): boolean {
  const domainSeparationEnabled = options?.domainSeparationEnabled ?? DOMAIN_SEPARATION_ENABLED;
  if (!domainSeparationEnabled) return true;
  if (origin === WEB_APP_ORIGIN) return true;
  let host = origin;
  try {
    host = new URL(origin).host;
  } catch {
    host = origin;
  }
  if (
    resolveRootEntry({
      host,
      pathname,
      domainSeparationEnabled,
      wwwMarketingRootEnabled: options?.wwwMarketingRootEnabled ?? WWW_MARKETING_ROOT_ENABLED
    }) === "marketing"
  ) {
    return false;
  }
  return classifySitePath(pathname) !== "marketing";
}

export async function registerAnyNannyServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined") return null;
  if (!shouldRegisterPushServiceWorker(window.location.origin, window.location.pathname)) return null;
  if (!("serviceWorker" in navigator)) return null;
  if (!window.isSecureContext && window.location.hostname !== "localhost") return null;

  if (!registrationPromise) {
    registrationPromise = navigator.serviceWorker
      .register(PUSH_SERVICE_WORKER_URL, { scope: "/" })
      .catch((err) => {
        console.warn("[push] service worker registration failed:", err);
        registrationPromise = null;
        return null;
      });
  }
  return registrationPromise;
}
