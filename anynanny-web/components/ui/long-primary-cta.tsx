import type { ReactNode } from "react";
import { LONG_PRIMARY_CTA_CLUSTER_CLASS } from "@/lib/ui/long-primary-cta";

/** Decorative CTA icon + label as one centered cluster. Icon is physically left (RTL-safe). */
export function LongPrimaryCtaContent({
  icon,
  children
}: {
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <span className={LONG_PRIMARY_CTA_CLUSTER_CLASS} dir="ltr">
      <span className="flex shrink-0" data-cta-icon-side="left" aria-hidden>
        {icon}
      </span>
      <span dir="rtl">{children}</span>
    </span>
  );
}
