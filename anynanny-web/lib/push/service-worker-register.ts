import { PUSH_SERVICE_WORKER_URL } from "@/lib/push/constants";

let registrationPromise: Promise<ServiceWorkerRegistration | null> | null = null;

export async function registerAnyNannyServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined") return null;
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
