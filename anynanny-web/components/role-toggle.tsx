"use client";

import { usePathname, useRouter } from "next/navigation";
import { startTransition, useCallback } from "react";
import { useAuth } from "@/components/auth-provider";
import { getSitterOnboardingGateRedirect } from "@/lib/auth/post-auth-destination";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

const STORAGE_KEY = "active_role";

export function RoleToggle() {
  const { signedIn, currentRole, user } = useAuth();
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
    void (async () => {
      const supabase = getSupabaseBrowserClient();
      if (supabase && user?.id) {
        const dest = await getSitterOnboardingGateRedirect(supabase, user.id, "/sitter/dashboard");
        startTransition(() => {
          router.replace(dest ?? "/sitter/dashboard");
        });
        return;
      }
      startTransition(() => {
        router.replace("/sitter/dashboard");
      });
    })();
  }, [router, pathname, user]);

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
      className={`relative inline-flex h-10 shrink-0 select-none rounded-full p-1 shadow-inner transition-colors duration-500 ease-out ${
        isParent ? "bg-[#001F3F]/14" : "bg-emerald-600/16"
      }`}
      dir="rtl"
    >
      <div
        className={`pointer-events-none absolute inset-y-1 z-0 w-[calc(50%-4px)] rounded-full bg-white shadow-md ring-1 ring-black/[0.06] transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[transform,opacity] ${
          isParent ? "start-1 scale-100" : "end-1 scale-100"
        }`}
        aria-hidden
      />
      <button
        type="button"
        onClick={goParent}
        className={`relative z-10 flex min-w-[4.25rem] flex-1 items-center justify-center rounded-full px-2 py-1 text-[11px] font-bold transition-colors duration-500 ${
          isParent ? "text-[#001F3F]" : "text-slate-500"
        }`}
      >
        הורה
      </button>
      <button
        type="button"
        onClick={goSitter}
        className={`relative z-10 flex min-w-[4.25rem] flex-1 items-center justify-center rounded-full px-2 py-1 text-[11px] font-bold transition-colors duration-500 ${
          !isParent ? "text-emerald-800" : "text-slate-500"
        }`}
      >
        בייביסיטר
      </button>
    </div>
  );
}
