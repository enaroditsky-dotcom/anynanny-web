"use client";

import { useEffect } from "react";
import { registerAnyNannyServiceWorker } from "@/lib/push/service-worker-register";

/** Registers the notification service worker. Safe on SSR and logged-out pages. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    void registerAnyNannyServiceWorker();
  }, []);
  return null;
}
