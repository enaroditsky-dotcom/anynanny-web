"use client";



import Link from "next/link";

import { usePathname } from "next/navigation";

import { CalendarClock, CalendarRange, LayoutDashboard, MessageCircle, UserRound } from "lucide-react";

import { useAuth } from "@/components/auth-provider";



type NavItem = { href: string; label: string; match: (path: string) => boolean; Icon: typeof LayoutDashboard };



const parentItems: NavItem[] = [

  { href: "/parent/dashboard", label: "דשבורד", match: (p) => p === "/parent/dashboard", Icon: LayoutDashboard },

  {

    href: "/parent/history",

    label: "משמרות",

    match: (p) => p.startsWith("/parent/history"),

    Icon: CalendarClock

  },

  {

    href: "/parent/messages",

    label: "הודעות",

    match: (p) => p.startsWith("/parent/messages"),

    Icon: MessageCircle

  },

  {

    href: "/parent/settings",

    label: "פרופיל",

    match: (p) => p.startsWith("/parent/settings") || p.startsWith("/parent/wallet"),

    Icon: UserRound

  }

];



const sitterItems: NavItem[] = [

  { href: "/sitter/dashboard", label: "דשבורד", match: (p) => p === "/sitter/dashboard", Icon: LayoutDashboard },

  {

    href: "/sitter/shifts",

    label: "המשמרות שלי",

    match: (p) => p.startsWith("/sitter/shifts"),

    Icon: CalendarClock

  },

  {

    href: "/sitter/availability",

    label: "סידור עבודה",

    match: (p) => p.startsWith("/sitter/availability"),

    Icon: CalendarRange

  },

  {

    href: "/sitter/messages",

    label: "הודעות",

    match: (p) => p.startsWith("/sitter/messages"),

    Icon: MessageCircle

  },

  {

    href: "/sitter/personal",

    label: "פרופיל",

    match: (p) => p.startsWith("/sitter/personal"),

    Icon: UserRound

  }

];



export function BottomNavigation() {

  const pathname = usePathname();

  const { signedIn, currentRole } = useAuth();



  if (!signedIn) return null;

  if (!pathname.startsWith("/parent/") && !pathname.startsWith("/sitter/")) return null;



  const items = currentRole === "sitter" ? sitterItems : parentItems;



  return (

    <nav

      aria-label="ניווט ראשי"

      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center pb-[max(0px,env(safe-area-inset-bottom))]"

    >

      <div className="pointer-events-auto flex h-16 w-full max-w-md items-stretch justify-around gap-0.5 border-t border-navy-header/10 bg-white/95 px-0.5 shadow-[0_-8px_24px_-8px_rgba(0,31,63,0.08)] backdrop-blur-md supports-[backdrop-filter]:bg-white/90">

        {items.map(({ href, label, match, Icon }) => {

          const active = match(pathname);

          return (

            <Link

              key={href}

              href={href}

              className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl py-1.5 text-[9px] font-semibold leading-tight transition sm:text-[10px] ${

                active ? "text-emerald-700" : "text-navy-header/70 hover:bg-slate-50 hover:text-navy-header"

              }`}

            >

              <Icon className={`h-5 w-5 shrink-0 sm:h-[1.35rem] sm:w-[1.35rem] ${active ? "stroke-[2.25]" : "stroke-[1.85]"}`} aria-hidden />

              <span className="max-w-[4.5rem] truncate text-center">{label}</span>

            </Link>

          );

        })}

      </div>

    </nav>

  );

}


