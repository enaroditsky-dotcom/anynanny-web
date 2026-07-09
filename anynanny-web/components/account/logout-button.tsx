"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { logoutAndRedirect } from "@/lib/auth/logout";

type LogoutButtonProps = {
  className?: string;
  label?: string;
};

export function LogoutButton({
  className = "inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-white px-4 py-3 text-sm font-bold text-rose-700 shadow-sm transition hover:bg-rose-50 active:scale-[0.98]",
  label = "התנתקות"
}: LogoutButtonProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        void logoutAndRedirect(router).finally(() => setBusy(false));
      }}
      className={className}
    >
      <LogOut className="h-4 w-4 shrink-0" aria-hidden />
      <span>{busy ? "מתנתק…" : label}</span>
    </button>
  );
}
