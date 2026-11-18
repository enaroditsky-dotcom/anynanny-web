"use client";

import { usePathname } from "next/navigation";
import { LOGOUT_BUTTON_CLASS, LogoutButton, LogoutButtonContent } from "@/components/account/logout-button";
import { useAuth } from "@/components/auth-provider";
import { setBroadcastMinimized } from "@/lib/broadcast/broadcast-minimize-preference";
import { isAppDrawerRoute } from "@/lib/navigation/app-side-drawer";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

/** Home-dashboard logout, pinned under the drawer menu. Handlers stay role-specific. */
export function AppSideDrawerLogout() {
  const pathname = usePathname();
  const { signedIn, currentRole } = useAuth();

  if (!signedIn || !isAppDrawerRoute(pathname)) return null;

  return (
    <div
      data-app-side-drawer-logout={currentRole}
      className="shrink-0 border-t border-[#001F3F]/10 bg-[#FFFEFC] px-3 py-3"
    >
      {currentRole === "sitter" ? (
        <LogoutButton />
      ) : (
        <button
          type="button"
          onClick={() => {
            const supabase = getSupabaseBrowserClient();
            setBroadcastMinimized(false);
            if (supabase) void supabase.auth.signOut().then(() => (window.location.href = "/login"));
          }}
          className={LOGOUT_BUTTON_CLASS}
        >
          <LogoutButtonContent />
        </button>
      )}
    </div>
  );
}
