"use client";

import type { LucideIcon } from "lucide-react";
import { Globe, Settings, Sparkles, Ticket, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import {
  appDrawerLinks,
  appDrawerSoonItems,
  isAppDrawerLinkActive,
  type AppDrawerLinkItem,
  type AppDrawerRole,
  type AppDrawerSoonItem
} from "@/lib/navigation/app-side-drawer-destinations";

const ROW =
  "flex min-h-11 w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-right outline-none transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3A9A44]";

const WHITE_CARD =
  "border border-[#001F3F]/10 bg-[#FFFEFC] text-[#001F3F] shadow-[0_1px_2px_rgba(15,23,42,0.05),0_6px_14px_rgba(15,23,42,0.06)] hover:bg-white";

const ACTIVE_CARD =
  "border border-[#3A9A44]/45 bg-[#FFFEFC] text-[#001F3F] shadow-[inset_0_0_0_1px_rgba(58,154,68,0.35),0_6px_14px_rgba(15,23,42,0.06)]";

const LINK_ICONS: Record<AppDrawerLinkItem["id"], LucideIcon> = {
  "personal-area": UserRound,
  settings: Settings,
  "public-site": Globe
};

const SOON_ICONS: Record<AppDrawerSoonItem["id"], LucideIcon> = {
  offers: Ticket,
  ai: Sparkles
};

function DrawerSoonRow({ item }: { item: AppDrawerSoonItem }) {
  const Icon = SOON_ICONS[item.id];
  const gold = item.tone === "gold";
  return (
    <li>
      <div
        data-app-drawer-soon={item.id}
        className={[ROW, gold ? "drawer-gold-bar" : WHITE_CARD].join(" ")}
      >
        <Icon className="relative z-[1] h-5 w-5 shrink-0 text-[#165B73]" aria-hidden />
        <span className="relative z-[1] min-w-0 flex-1 whitespace-normal break-words text-[15px] font-semibold leading-snug text-[#001F3F]">
          {item.label}
        </span>
        <span
          className={[
            "relative z-[1] shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold",
            gold ? "bg-[#FFFDF8] text-[#001F3F] ring-1 ring-[#875508]/35" : "bg-[#F4F1EA] text-[#5C4314]"
          ].join(" ")}
        >
          {item.soonLabel}
        </span>
      </div>
    </li>
  );
}

function DrawerLinkRow({
  item,
  active,
  onNavigate
}: {
  item: AppDrawerLinkItem;
  active: boolean;
  onNavigate?: () => void;
}) {
  const Icon = LINK_ICONS[item.id];
  const className = [ROW, active ? ACTIVE_CARD : WHITE_CARD].join(" ");
  const body = (
    <>
      <Icon className="h-5 w-5 shrink-0 text-[#165B73]" aria-hidden />
      <span className="min-w-0 flex-1 text-[15px] font-semibold leading-snug">{item.label}</span>
    </>
  );

  if (item.external) {
    return (
      <li>
        <a
          href={item.href}
          target="_blank"
          rel="noopener noreferrer"
          data-app-drawer-link={item.id}
          className={className}
          onClick={onNavigate}
        >
          {body}
          <span className="sr-only">נפתח בלשונית חדשה</span>
        </a>
      </li>
    );
  }

  return (
    <li>
      <Link
        href={item.href}
        data-app-drawer-link={item.id}
        {...(item.tour ? { "data-tour": item.tour } : {})}
        aria-current={active ? "page" : undefined}
        className={className}
        onClick={onNavigate}
      >
        {body}
      </Link>
    </li>
  );
}

type AppSideDrawerMenuProps = {
  role?: AppDrawerRole;
  pathname?: string;
  onNavigate?: () => void;
};

export function AppSideDrawerMenu({ role, pathname, onNavigate }: AppSideDrawerMenuProps) {
  const auth = useAuth();
  const livePath = usePathname();
  const resolvedRole: AppDrawerRole = role ?? auth.currentRole;
  const resolvedPath = pathname ?? livePath;
  const links = appDrawerLinks(resolvedRole);
  const soon = appDrawerSoonItems();

  return (
    <nav
      aria-label="ניווט"
      data-app-side-drawer-menu={resolvedRole}
      className="relative z-[1] min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-3 py-3"
    >
      <ul className="flex flex-col gap-2">
        {links.map((item) => (
          <DrawerLinkRow
            key={item.id}
            item={item}
            active={isAppDrawerLinkActive(resolvedPath, item.href, item.external)}
            onNavigate={onNavigate}
          />
        ))}
      </ul>
      <div className="mx-1 my-3 border-t border-[#001F3F]/10" role="separator" />
      <ul className="flex flex-col gap-2" aria-label="שירותים בקרוב">
        {soon.map((item) => (
          <DrawerSoonRow key={item.id} item={item} />
        ))}
      </ul>
    </nav>
  );
}
