"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, MessageCircle, UserRound, Settings, Zap } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { useWalletNotification } from "@/features/wallet/hooks/useWalletNotification";
import { useChatNotification } from "@/features/chat/hooks/useChatNotification";

type NavItem = {
  href: string;
  label: string;
  match: (path: string) => boolean;
  Icon: typeof Home;
  badgeKey?: "messages" | "wallet";
};

const parentSideItems: NavItem[] = [
  {
    href: "/parent/dashboard",
    label: "בית",
    match: (p) => p === "/parent/dashboard",
    Icon: Home
  },
  {
    href: "/parent/messages",
    label: "הודעות",
    match: (p) => p.startsWith("/parent/messages") || p.startsWith("/parent/chat/"),
    Icon: MessageCircle,
    badgeKey: "messages"
  },
  {
    href: "/parent/profile",
    label: "אזור אישי",
    match: (p) => p.startsWith("/parent/profile") || p.startsWith("/parent/wallet"),
    Icon: UserRound,
    badgeKey: "wallet"
  },
  {
    href: "/parent/settings",
    label: "הגדרות",
    match: (p) => p.startsWith("/parent/settings"),
    Icon: Settings
  }
];

const sitterItems: NavItem[] = [
  {
    href: "/sitter/dashboard",
    label: "בית",
    match: (p) => p === "/sitter/dashboard",
    Icon: Home
  },
  {
    href: "/sitter/messages",
    label: "הודעות",
    match: (p) => p.startsWith("/sitter/messages") || p.startsWith("/sitter/chat/"),
    Icon: MessageCircle,
    badgeKey: "messages"
  },
  {
    href: "/sitter/profile",
    label: "אזור אישי",
    match: (p) => p.startsWith("/sitter/profile") || p.startsWith("/sitter/personal"),
    Icon: UserRound
  },
  {
    href: "/sitter/settings",
    label: "הגדרות",
    match: (p) => p.startsWith("/sitter/settings"),
    Icon: Settings
  }
];

function NavLink({
  item,
  pathname,
  hasUnreadMessages,
  hasWalletUpdate,
  clearWalletNotification
}: {
  item: NavItem;
  pathname: string;
  hasUnreadMessages: boolean;
  hasWalletUpdate: boolean;
  clearWalletNotification: () => void;
}) {
  const { href, label, match, Icon, badgeKey } = item;
  const active = match(pathname);
  const showMessageBadge = badgeKey === "messages" && hasUnreadMessages;
  const showWalletBadge = badgeKey === "wallet" && hasWalletUpdate;
  const showBadge = showMessageBadge || showWalletBadge;

  return (
    <Link
      href={href}
      onClick={() => {
        if (badgeKey === "wallet") clearWalletNotification();
      }}
      className={`flex min-w-0 w-full flex-col items-center justify-center gap-1.5 rounded-xl px-1 py-1.5 text-[13px] font-semibold leading-tight transition ${
        active ? "text-emerald-700" : "text-navy-header/70 hover:bg-slate-50 hover:text-navy-header"
      }`}
      aria-label={
        showMessageBadge
            ? `${label} — הודעות חדשות`
            : showWalletBadge
              ? `${label} — עדכון בארנק`
              : label
      }
    >
      <div className="relative">
        <Icon className={`h-[26px] w-[26px] shrink-0 ${active ? "stroke-[2.25]" : "stroke-[1.85]"}`} aria-hidden />
        {showBadge ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-2 w-2 rounded-full bg-red-500 ring-2 ring-white animate-pulse" />
        ) : null}
      </div>
      <span className="max-w-[5.25rem] truncate text-center">{label}</span>
    </Link>
  );
}

/** Elevated Sitter surprises action — same center slot as Parent AnyNanny Now. */
function SitterSurprisesFab({ active }: { active: boolean }) {
  return (
    <Link
      href="/sitter/surprises"
      aria-label="הפתעות"
      className="group relative z-10 -mt-7 flex w-full flex-col items-center justify-end gap-1 outline-none"
    >
      <Image
        src="/sitter-surprises-button.png"
        alt=""
        width={1282}
        height={1227}
        sizes="72px"
        priority
        className="h-[72px] w-[72px] object-contain transition duration-200 group-active:scale-[0.96]"
      />
      <span
        className={`max-w-[5.5rem] text-center text-[11px] font-bold leading-tight ${
          active ? "text-[#9F1239]" : "text-navy-header/80"
        }`}
      >
        הפתעות
      </span>
    </Link>
  );
}

/** Elevated AnyNanny Now action — floats above the bottom nav rail. */
function AnyNannyNowFab({ active }: { active: boolean }) {
  return (
    <Link
      href="/parent/broadcast"
      aria-label="AnyNanny Now"
      className="group relative z-10 -mt-7 flex w-full flex-col items-center justify-end gap-1 outline-none"
    >
      <span
        className={`relative flex h-[3.85rem] w-[3.85rem] items-center justify-center rounded-full bg-gradient-to-b from-emerald-400 to-emerald-600 text-white shadow-[0_10px_24px_-4px_rgba(16,185,129,0.55),0_4px_10px_-2px_rgba(5,150,105,0.45)] ring-[3px] ring-white transition duration-200 group-hover:brightness-105 group-hover:shadow-[0_14px_28px_-4px_rgba(16,185,129,0.6)] group-active:scale-[0.96] ${
          active ? "ring-emerald-200" : ""
        }`}
      >
        <span className="pointer-events-none absolute inset-[3px] rounded-full bg-gradient-to-b from-white/25 to-transparent" aria-hidden />
        <span className="relative flex flex-col items-center justify-center leading-none">
          <Zap className="mb-0.5 h-3.5 w-3.5 fill-white text-white drop-shadow-sm" aria-hidden />
          <span className="text-[13px] font-black tracking-wide" dir="ltr">
            AN
          </span>
        </span>
      </span>
      <span
        className={`max-w-[5.5rem] text-center text-[11px] font-bold leading-tight ${
          active ? "text-emerald-700" : "text-navy-header/80"
        }`}
      >
        AnyNanny Now
      </span>
    </Link>
  );
}

/** Fixed bottom navigation for authenticated parent/sitter routes. */
export function BottomNav() {
  const pathname = usePathname();
  const { signedIn, currentRole, user } = useAuth();
  const role = currentRole === "sitter" ? "sitter" : "parent";

  const { hasWalletUpdate, clearWalletNotification } = useWalletNotification(user?.id, role);
  const { hasUnreadMessages } = useChatNotification(user?.id);

  if (!signedIn) return null;
  if (!pathname.startsWith("/parent/") && !pathname.startsWith("/sitter/")) return null;

  const nowActive = pathname.startsWith("/parent/broadcast");
  const surprisesActive = pathname.startsWith("/sitter/surprises");

  if (role === "parent") {
    const [leftA, leftB, rightA, rightB] = parentSideItems;
    return (
      <nav
        aria-label="ניווט ראשי"
        className="fixed bottom-0 left-0 right-0 z-50 w-full border-t border-slate-200/80 bg-white/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-6px_24px_-12px_rgba(15,23,42,0.12)] backdrop-blur-sm"
      >
        <div className="mx-auto grid w-full max-w-md grid-cols-5 items-end gap-0.5">
          {[leftA, leftB].map((item) => (
            <NavLink
              key={item.href}
              item={item}
              pathname={pathname}
              hasUnreadMessages={hasUnreadMessages}
              hasWalletUpdate={hasWalletUpdate}
              clearWalletNotification={clearWalletNotification}
            />
          ))}
          <AnyNannyNowFab active={nowActive} />
          {[rightA, rightB].map((item) => (
            <NavLink
              key={item.href}
              item={item}
              pathname={pathname}
              hasUnreadMessages={hasUnreadMessages}
              hasWalletUpdate={hasWalletUpdate}
              clearWalletNotification={clearWalletNotification}
            />
          ))}
        </div>
      </nav>
    );
  }

  const [leftA, leftB, rightA, rightB] = sitterItems;
  return (
    <nav
      aria-label="ניווט ראשי"
      className="fixed bottom-0 left-0 right-0 z-50 w-full border-t border-slate-200/80 bg-white/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-6px_24px_-12px_rgba(15,23,42,0.12)] backdrop-blur-sm"
    >
      <div className="mx-auto grid w-full max-w-md grid-cols-5 items-end gap-0.5">
        {[leftA, leftB].map((item) => (
          <NavLink
            key={item.href}
            item={item}
            pathname={pathname}
            hasUnreadMessages={hasUnreadMessages}
            hasWalletUpdate={hasWalletUpdate}
            clearWalletNotification={clearWalletNotification}
          />
        ))}
        <SitterSurprisesFab active={surprisesActive} />
        {[rightA, rightB].map((item) => (
          <NavLink
            key={item.href}
            item={item}
            pathname={pathname}
            hasUnreadMessages={hasUnreadMessages}
            hasWalletUpdate={hasWalletUpdate}
            clearWalletNotification={clearWalletNotification}
          />
        ))}
      </div>
    </nav>
  );
}
