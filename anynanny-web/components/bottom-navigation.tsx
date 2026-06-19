"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, MessageCircle, UserRound, Settings } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
// ייבוא ה-Hook המבודד של הארנק
import { useWalletNotification } from "@/features/wallet/hooks/useWalletNotification";
// ייבוא ה-Hook המבודד החדש של הצ'אט
import { useChatNotification } from "@/features/chat/hooks/useChatNotification";

type NavItem = { 
  href: string; 
  label: string; 
  match: (path: string) => boolean; 
  Icon: typeof LayoutDashboard;
  badgeKey?: "messages" | "wallet";
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
    match: (p) => p.startsWith("/parent/messages"),
    Icon: MessageCircle,
    badgeKey: "messages"
  },
  {
    href: "/parent/settings",
    label: "הגדרות",
    match: (p) => p === "/parent/settings",
    Icon: Settings
  },
  {
    href: "/parent/profile",
    label: "פרופיל",
    match: (p) => p.startsWith("/parent/profile") || p.startsWith("/parent/wallet"),
    Icon: UserRound,
    badgeKey: "wallet"
  }
];

const sitterItems: NavItem[] = [
  { 
    href: "/sitter/dashboard", 
    label: "דשבורד", 
    match: (p) => p === "/sitter/dashboard", 
    Icon: LayoutDashboard 
  },
  {
    href: "/sitter/messages",
    label: "הודעות",
    match: (p) => p.startsWith("/sitter/messages"),
    Icon: MessageCircle,
    badgeKey: "messages"
  },
  {
    href: "/sitter/account-settings",
    label: "הגדרות",
    match: (p) => p.startsWith("/sitter/account-settings"),
    Icon: Settings
  },
  {
    href: "/sitter/personal",
    label: "פרופיל",
    match: (p) => p.startsWith("/sitter/personal") || p.startsWith("/sitter/wallet"),
    Icon: UserRound,
    badgeKey: "wallet"
  }
];

export function BottomNavigation() {
  const pathname = usePathname();
  const { signedIn, currentRole, user } = useAuth();
  
  // 1. שימוש ב-Hook הריל-טיים של הארנק
  const { hasWalletUpdate, clearWalletNotification } = useWalletNotification(user?.id);

  // לצורך האזנה גלובלית לצ'אט בסרגל
  const currentTestBookingId = "global-chat-channel"; 
  
  // 2. שימוש ב-Hook הריל-טיים של הצ'אט
  const { hasUnreadMessages, clearChatNotification } = useChatNotification(currentTestBookingId, user?.id);

  if (!signedIn) return null;
  if (!pathname.startsWith("/parent/") && !pathname.startsWith("/sitter/")) return null;

  const items = currentRole === "sitter" ? sitterItems : parentItems;

  return (
    <nav
      aria-label="ניווט ראשי"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center pb-[max(0px,env(safe-area-inset-bottom))]"
    >
      <div className="pointer-events-auto flex h-16 w-full max-w-md items-stretch justify-around gap-0.5 border-t border-navy-header/10 bg-white/95 px-0.5 shadow-[0_-8px_24px_-8px_rgba(0,31,63,0.08)] backdrop-blur-md supports-[backdrop-filter]:bg-white/90">
        {items.map(({ href, label, match, Icon, badgeKey }) => {
          const active = match(pathname);
          
          const showBadge = 
            (badgeKey === "messages" && hasUnreadMessages) || 
            (badgeKey === "wallet" && hasWalletUpdate);

          const handleClick = () => {
            if (badgeKey === "wallet") clearWalletNotification();
            if (badgeKey === "messages") clearChatNotification();
          };

          return (
            <Link
              key={href}
              href={href}
              onClick={handleClick}
              className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl py-1.5 text-[9px] font-semibold leading-tight transition sm:text-[10px] ${
                active ? "text-emerald-700" : "text-navy-header/70 hover:bg-slate-50 hover:text-navy-header"
              }`}
            >
              <div className="relative">
                <Icon className={`h-5 w-5 shrink-0 sm:h-[1.35rem] sm:w-[1.35rem] ${active ? "stroke-[2.25]" : "stroke-[1.85]"}`} aria-hidden />
                
                {showBadge && (
                  <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2 rounded-full bg-red-500 ring-2 ring-white animate-pulse" />
                )}
              </div>

              <span className="max-w-[4.5rem] truncate text-center">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}