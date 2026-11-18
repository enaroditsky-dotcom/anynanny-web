"use client";

import { useEffect, type ReactNode } from "react";
import { hasPasswordRecoveryEvent } from "@/lib/auth/password-recovery-state";
import {
  forwardExplicitRecoveryCallback,
  readAuthCallbackParams
} from "@/lib/auth/password-reset";

/**
 * Hash fragments never reach the host classifier. When www `/` renders the
 * marketing homepage, recovery and verification-error links still follow the
 * same handoff as the application entry.
 */
export function MarketingHomeAuthHandoff({ children }: { children: ReactNode }) {
  useEffect(() => {
    const hash = window.location.hash;
    const search = window.location.search;
    if (forwardExplicitRecoveryCallback()) return;

    if (hasPasswordRecoveryEvent()) {
      window.location.replace(`/auth/reset-password${search}${hash}`);
      return;
    }

    const callback = readAuthCallbackParams(search, hash);
    if (callback.isRecoveryType) {
      window.location.replace(`/auth/reset-password${search}${hash}`);
      return;
    }

    if (hash.includes("error") || search.includes("error")) {
      const queryString = search ? search : `?${hash.replace("#", "")}`;
      window.location.replace(`/auth/verified${queryString}`);
    }
  }, []);

  return children;
}
