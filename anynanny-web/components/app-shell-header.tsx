"use client";

import Image from "next/image";
import Link from "next/link";
import { Home, Mail, UserRound, Users } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Role = "parent" | "sitter";

export function AppShellHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [role, setRole] = useState<Role>("sitter");

  useEffect(() => {
    if (pathname.includes("/parent")) {
      setRole("parent");
      localStorage.setItem("active_role", "parent");
      return;
    }
    if (pathname.includes("/session") || pathname.includes("/sitter")) {
      setRole("sitter");
      localStorage.setItem("active_role", "sitter");
      return;
    }
    const saved = localStorage.getItem("active_role");
    if (saved === "parent" || saved === "sitter") {
      setRole(saved);
    }
  }, [pathname]);

  const onToggle = () => {
    const nextRole: Role = role === "parent" ? "sitter" : "parent";
    setRole(nextRole);
    localStorage.setItem("active_role", nextRole);
    router.push(nextRole === "parent" ? "/parent/dashboard" : "/session");
  };

  return (
    <header className="w-full border-b border-navy-header/10 bg-white">
      <div className="flex w-full items-center justify-between px-4 py-3">
        <button
          type="button"
          className="relative ml-1 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white text-navy-header shadow-sm transition hover:bg-brand-cream"
          aria-label="Messages"
        >
          <Mail className="h-5 w-5" />
          <span className="absolute right-2 top-1.5 h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-white" aria-hidden />
        </button>

        <div className="inline-flex items-center gap-2">
          <div className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1">
            <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold ${role === "sitter" ? "text-navy-header" : "text-slate-500"}`}>
              <UserRound className="h-3 w-3" />
              בייביסיטר
            </span>
            <button
              type="button"
              onClick={onToggle}
              className={`relative h-5 w-9 rounded-full transition ${role === "parent" ? "bg-[#E8E2D6]" : "bg-[#E8E2D6]"}`}
              aria-label="Role switch"
            >
              <span
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-[#001F3F] transition-all ${role === "parent" ? "right-0.5" : "right-4.5"}`}
              />
            </button>
            <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold ${role === "parent" ? "text-navy-header" : "text-slate-500"}`}>
              <Users className="h-3 w-3" />
              הורה
            </span>
          </div>

          <Link
            href="/?manual=true"
            className="mr-1 inline-flex items-center gap-1 rounded-full bg-[#F5EEDC] px-2.5 py-1.5 text-navy-header shadow-sm transition hover:brightness-95"
            aria-label="Home"
          >
            <Home className="h-4 w-4" />
            <span className="relative h-7 w-7 overflow-hidden rounded-full ring-1 ring-navy-header/15">
              <Image src="/logo.png" alt="AnyNanny" fill className="object-cover object-center" priority />
            </span>
            <span className="text-lg font-bold">AnyNanny</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
