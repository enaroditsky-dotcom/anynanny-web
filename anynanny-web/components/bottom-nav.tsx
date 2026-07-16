"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, MessageCircle, User, UserRound, Settings } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { useWalletNotification } from "@/features/wallet/hooks/useWalletNotification";
import { useChatNotification } from "@/features/chat/hooks/useChatNotification";

type NavItem = {
  href: string;
  label: string;
  match: (path: string) => boolean;
  Icon: typeof LayoutDashboard;
  badgeKey?: "messages" | "wallet";
};

const parentItems: NavItem[] = [
  { href: "/parent/dashboard", label: "דשבורד", match: (p) => p === "/parent/dashboard", Icon: LayoutDashboard },
  { href: "/parent/messages", label: "הודעות", match: (p) => p.startsWith("/parent/messages"), Icon: MessageCircle, badgeKey: "messages" },
  { href: "/parent/settings", label: "הגדרות", match: (p) => p.startsWith("/parent/settings"), Icon: Settings },
  { href: "/parent/profile", label: "פרופיל", match: (p) => p.startsWith("/parent/profile") || p.startsWith("/parent/wallet"), Icon: UserRound, badgeKey: "wallet" }
];

const sitterItems: NavItem[] = [
  { href: "/sitter/dashboard", label: "דשבורד", match: (p) => p === "/sitter/dashboard", Icon: LayoutDashboard },
  { href: "/sitter/messages", label: "הודעות", match: (p) => p.startsWith("/sitter/messages"), Icon: MessageCircle, badgeKey: "messages" },
  { href: "/sitter/profile", label: "אזור אישי", match: (p) => p.startsWith("/sitter/profile") || p.startsWith("/sitter/personal"), Icon: User },
  { href: "/sitter/settings", label: "הגדרות", match: (p) => p.startsWith("/sitter/settings"), Icon: Settings }
];

/** Fixed bottom navigation for authenticated parent/sitter routes. */
export function BottomNav() {
  const pathname = usePathname();
  const { signedIn, currentRole, user } = useAuth();

  const { hasWalletUpdate, clearWalletNotification } = useWalletNotification(user?.id);
  const { hasUnreadMessages, clearChatNotification } = useChatNotification("global-chat-channel", user?.id);

  if (!signedIn) return null;
  if (!pathname.startsWith("/parent/") && !pathname.startsWith("/sitter/")) return null;

  const items = currentRole === "sitter" ? sitterItems : parentItems;

  return (
    <nav
      aria-label="ניווט ראשי"
      className="fixed bottom-0 left-0 right-0 z-50 w-full border-t bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
    >
      <div className="mx-auto flex w-full max-w-md items-center justify-around">
        {items.map(({ href, label, match, Icon, badgeKey }) => {
          const active = match(pathname);
          const showBadge =
            (badgeKey === "messages" && hasUnreadMessages) ||
            (badgeKey === "wallet" && hasWalletUpdate);

          return (
            <Link
              key={href}
              href={href}
              onClick={() => {
                if (badgeKey === "wallet") clearWalletNotification();
                if (badgeKey === "messages") clearChatNotification();
              }}
              className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-2 py-1 text-[10px] font-semibold leading-tight transition ${
                active ? "text-emerald-700" : "text-navy-header/70 hover:bg-slate-50 hover:text-navy-header"
              }`}
            >
              <div className="relative">
                <Icon className={`h-5 w-5 shrink-0 ${active ? "stroke-[2.25]" : "stroke-[1.85]"}`} aria-hidden />
                {showBadge ? (
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