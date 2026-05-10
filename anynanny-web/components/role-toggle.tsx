"use client";

import { usePathname, useRouter } from "next/navigation";
import { startTransition, useCallback } from "react";
import { useAuth } from "@/components/auth-provider";

const STORAGE_KEY = "active_role";

export function RoleToggle() {
  const { signedIn, currentRole } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const isParent = currentRole === "parent";

  const goParent = useCallback(() => {
    if (pathname.startsWith("/parent")) return;
    try {
      localStorage.setItem(STORAGE_KEY, "parent");
    } catch {
      /* ignore */
    }
    startTransition(() => {
      router.replace("/parent/dashboard");
    });
  }, [router, pathname]);

  const goSitter = useCallback(() => {
    if (pathname.startsWith("/sitter") || pathname.startsWith("/session")) return;
    try {
      localStorage.setItem(STORAGE_KEY, "sitter");
    } catch {
      /* ignore */
    }
    startTransition(() => {
      router.replace("/sitter/dashboard");
    });
  }, [router, pathname]);

  const show =
    signedIn &&
    !pathname.startsWith("/auth") &&
    !pathname.startsWith("/admin") &&
    pathname !== "/auth" &&
    pathname !== "/admin/login";

  if (!show) return null;

  return (
    <div
      role="group"
      aria-label="מצב תצוגה: הורה או בייביסיטר"
      className={`relative inline-flex h-10 shrink-0 select-none rounded-full p-1 shadow-inner transition-colors duration-300 ${
        isParent ? "bg-[#001F3F]/14" : "bg-emerald-600/16"
      }`}
      dir="rtl"
    >
      <div
        className={`pointer-events-none absolute inset-y-1 z-0 w-[calc(50%-4px)] rounded-full bg-white shadow-md ring-1 ring-black/[0.06] transition-all duration-300 ease-[cubic-bezier(0.34,1.23,0.64,1)] will-change-transform ${
          isParent ? "start-1" : "end-1"
        }`}
        aria-hidden
      />
      <button
        type="button"
        onClick={goParent}
        className={`relative z-10 flex min-w-[4.25rem] flex-1 items-center justify-center rounded-full px-2 py-1 text-[11px] font-bold transition-colors duration-200 ${
          isParent ? "text-[#001F3F]" : "text-slate-500"
        }`}
      >
        הורה
      </button>
      <button
        type="button"
        onClick={goSitter}
        className={`relative z-10 flex min-w-[4.25rem] flex-1 items-center justify-center rounded-full px-2 py-1 text-[11px] font-bold transition-colors duration-200 ${
          !isParent ? "text-emerald-800" : "text-slate-500"
        }`}
      >
        בייביסיטר
      </button>
    </div>
  );
}
