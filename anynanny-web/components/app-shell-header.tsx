"use client";

import { useEffect, useState, type Ref } from "react";
import { Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { AnyNannyAppLogo } from "@/components/brand/anynanny-app-logo";
import { APP_SIDE_DRAWER_ID } from "@/lib/navigation/app-side-drawer";

/** Leaves equal gutters so the centered logo clears both 44px controls. */
const LOGO_SLOT_CLASS = "w-[min(14.3375rem,calc(100%-7.5rem))]";
const CONTROL_CLASS =
  "absolute top-1/2 z-10 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-xl text-[#001F3F] transition hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#001F3F]";
const LOGO_HOME_CLASS =
  "inline-flex max-w-full items-center justify-center rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#001F3F]";

type AppShellHeaderProps = {
  showMenu?: boolean;
  menuExpanded?: boolean;
  onOpenMenu?: () => void;
  menuButtonRef?: Ref<HTMLButtonElement>;
  /** Preview only. When set, Home stays on this screen and does not follow the signed-in route. */
  onHomePress?: () => void;
};

export function AppShellHeader({
  showMenu = false,
  menuExpanded = false,
  onOpenMenu,
  menuButtonRef,
  onHomePress
}: AppShellHeaderProps) {
  const { isLoading, currentRole } = useAuth();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  /** מניעת הידרציה שגויה מול השרת */
  const showUi = mounted && !isLoading;
  const showMenuButton = showMenu && Boolean(onOpenMenu);
  const homeHref = currentRole === "sitter" ? "/sitter/dashboard" : "/parent/dashboard";
  const homeActive = pathname === homeHref;
  const logo = (
    <AnyNannyAppLogo
      variant="shell"
      decorative={showMenuButton}
      className={showMenuButton ? "!w-full !max-w-full" : ""}
    />
  );

  return (
    <header className="z-40 w-full shrink-0 border-b border-navy-header/10 bg-white pt-[env(safe-area-inset-top,0px)] shadow-[0_4px_16px_rgba(15,23,42,0.06)]">
      <div className="relative flex h-[5.2rem] items-center justify-center px-2" dir="ltr">
        {showUi ? (
          showMenuButton ? (
            onHomePress ? (
              <button type="button" aria-label="בית" aria-current="page" className={`${LOGO_HOME_CLASS} ${LOGO_SLOT_CLASS}`} inert={menuExpanded} onClick={onHomePress}>
                {logo}
              </button>
            ) : (
              <Link
                href={homeHref}
                aria-label="בית"
                aria-current={homeActive ? "page" : undefined}
                className={`${LOGO_HOME_CLASS} ${LOGO_SLOT_CLASS}`}
                inert={menuExpanded}
              >
                {logo}
              </Link>
            )
          ) : (
            logo
          )
        ) : showMenuButton ? (
          <div
            className={`${LOGO_SLOT_CLASS} animate-pulse rounded bg-slate-100`}
            style={{ aspectRatio: "2172 / 724" }}
          />
        ) : (
          <div
            className="w-[14.3375rem] max-w-[calc(100vw-1.5rem)] animate-pulse rounded bg-slate-100"
            style={{ aspectRatio: "2172 / 724" }}
          />
        )}
        {showMenuButton ? (
          <button
            ref={menuButtonRef}
            type="button"
            className={`${CONTROL_CLASS} right-2`}
            aria-label="תפריט"
            aria-haspopup="dialog"
            aria-expanded={menuExpanded}
            aria-controls={APP_SIDE_DRAWER_ID}
            onClick={() => onOpenMenu?.()}
          >
            <Menu className="h-6 w-6" aria-hidden />
          </button>
        ) : null}
      </div>
    </header>
  );
}
