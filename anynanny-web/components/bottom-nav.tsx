"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, MessageCircle, UserRound, Settings } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { useWalletNotification } from "@/features/wallet/hooks/useWalletNotification";
import { useChatNotification } from "@/features/chat/hooks/useChatNotification";
import { useSitterPendingBookingCount } from "@/lib/bookings/use-sitter-pending-booking-count";

type NavItem = {
  href: string;
  label: string;
  match: (path: string) => boolean;
  Icon: typeof LayoutDashboard;
  badgeKey?: "messages" | "wallet" | "pending";
};

const parentItems: NavItem[] = [
  {
    href: "/parent/dashboard",
    label: "דשבורד",
    match: (p) => p === "/parent/dashboard",
    Icon: LayoutDashboard
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
    label: "דשבורד",
    match: (p) => p === "/sitter/dashboard",
    Icon: LayoutDashboard,
    badgeKey: "pending"
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

/** Fixed bottom navigation for authenticated parent/sitter routes. */
export function BottomNav() {
  const pathname = usePathname();
  const { signedIn, currentRole, user } = useAuth();
  const role = currentRole === "sitter" ? "sitter" : "parent";

  const { hasWalletUpdate, clearWalletNotification } = useWalletNotification(user?.id, role);
  const { hasUnreadMessages, clearChatNotification } = useChatNotification(user?.id);
  const pendingBookingCount = useSitterPendingBookingCount(
    role === "sitter" ? user?.id ?? null : null,
    role === "sitter" && Boolean(user?.id)
  );

  if (!signedIn) return null;
  if (!pathname.startsWith("/parent/") && !pathname.startsWith("/sitter/")) return null;

  const items = role === "sitter" ? sitterItems : parentItems;

  return (
    <nav
      aria-label="ניווט ראשי"
      className="fixed bottom-0 left-0 right-0 z-50 w-full border-t bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
    >
      <div className="mx-auto grid w-full max-w-md grid-cols-4 items-center">
        {items.map(({ href, label, match, Icon, badgeKey }) => {
          const active = match(pathname);
          const showMessageBadge = badgeKey === "messages" && hasUnreadMessages;
          const showWalletBadge = badgeKey === "wallet" && hasWalletUpdate;
          const showPendingBadge = badgeKey === "pending" && pendingBookingCount > 0;
          const showBadge = showMessageBadge || showWalletBadge || showPendingBadge;

          return (
            <Link
              key={href}
              href={href}
              onClick={() => {
                if (badgeKey === "wallet") clearWalletNotification();
                if (badgeKey === "messages") clearChatNotification();
              }}
              className={`flex min-w-0 w-full flex-col items-center justify-center gap-1 rounded-xl px-2 py-1 text-[10px] font-semibold leading-tight transition ${
                active ? "text-emerald-700" : "text-navy-header/70 hover:bg-slate-50 hover:text-navy-header"
              }`}
              aria-label={
                showPendingBadge
                  ? `${label} — ${pendingBookingCount} בקשות ממתינות`
                  : showMessageBadge
                    ? `${label} — הודעות חדשות`
                    : showWalletBadge
                      ? `${label} — עדכון בארנק`
                      : label
              }
            >
              <div className="relative">
                <Icon className={`h-5 w-5 shrink-0 ${active ? "stroke-[2.25]" : "stroke-[1.85]"}`} aria-hidden />
                {showPendingBadge ? (
                  <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold leading-none text-white ring-2 ring-white">
                    {pendingBookingCount > 9 ? "9+" : pendingBookingCount}
                  </span>
                ) : showBadge ? (
                  <span className="absolute -right-0.5 -top-0.5 flex h-2 w-2 rounded-full bg-red-500 ring-2 ring-white animate-pulse" />
                ) : null}
              </div>
              <span className="max-w-[5rem] truncate text-center">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
