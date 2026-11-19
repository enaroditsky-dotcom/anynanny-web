"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LOGOUT_BUTTON_CLASS, LogoutButton, LogoutButtonContent } from "@/components/account/logout-button";
import { useAuth } from "@/components/auth-provider";
import { LOGOUT_SIGN_OUT_FAILED_MESSAGE, logoutAndRedirect } from "@/lib/auth/logout";
import { isAppDrawerRoute } from "@/lib/navigation/app-side-drawer";

/** Home-dashboard logout, pinned under the drawer menu. Handlers stay role-specific. */
export function AppSideDrawerLogout() {
  const pathname = usePathname();
  const router = useRouter();
  const { signedIn, currentRole } = useAuth();
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  if (!signedIn || !isAppDrawerRoute(pathname)) return null;

  return (
    <div
      data-app-side-drawer-logout={currentRole}
      className="shrink-0 border-t border-[#001F3F]/10 bg-[#FFFEFC] px-3 py-3"
    >
      {currentRole === "sitter" ? (
        <LogoutButton />
      ) : (
        <div className="flex flex-col gap-1.5">
          {logoutError ? (
            <p role="alert" className="text-center text-xs text-rose-800">
              {logoutError}
            </p>
          ) : null}
          <button
            type="button"
            disabled={logoutBusy}
            onClick={() => {
              if (logoutBusy) return;
              setLogoutBusy(true);
              setLogoutError(null);
              void logoutAndRedirect(router, "/login").then((result) => {
                if (result.ok) return;
                setLogoutError(LOGOUT_SIGN_OUT_FAILED_MESSAGE);
                setLogoutBusy(false);
              });
            }}
            className={LOGOUT_BUTTON_CLASS}
          >
            <LogoutButtonContent />
          </button>
        </div>
      )}
    </div>
  );
}
