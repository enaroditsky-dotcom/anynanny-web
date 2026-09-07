"use client";

import { Unplug } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { logoutAndRedirect } from "@/lib/auth/logout";

export const LOGOUT_BUTTON_LABEL = "התנתקות";

/** Canonical destructive logout surface — matches the parent dashboard button. */
export const LOGOUT_BUTTON_CLASS =
  "flex w-full items-center justify-center rounded-xl border border-rose-200 bg-rose-50/30 py-2.5 text-sm font-semibold text-rose-700 shadow-2xs transition hover:bg-rose-50 disabled:opacity-60";

const LOGOUT_LABEL_CLUSTER_CLASS = "inline-flex flex-row items-center gap-[0.5em]";

/** Unplug icon physically left of the label, centered as one cluster (RTL-safe). */
export function LogoutButtonContent({ label = LOGOUT_BUTTON_LABEL }: { label?: string }) {
  return (
    <span className={LOGOUT_LABEL_CLUSTER_CLASS} dir="ltr">
      <Unplug className="h-5 w-5 shrink-0" aria-hidden />
      <span dir="rtl">{label}</span>
    </span>
  );
}

type LogoutButtonProps = {
  className?: string;
  label?: string;
};

export function LogoutButton({
  className = LOGOUT_BUTTON_CLASS,
  label = LOGOUT_BUTTON_LABEL
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
      <LogoutButtonContent label={busy ? "מתנתק…" : label} />
    </button>
  );
}
