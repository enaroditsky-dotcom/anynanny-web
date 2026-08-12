import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/** Shared subtle back-nav style for regular app pages: ← חזרה (top-left). */
export const PAGE_BACK_NAV_CLASS =
  "inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 transition-colors hover:text-slate-900";

/** Shared primary full-width back button for status / error / completion cards. */
export const HOME_BACK_BUTTON_CLASS =
  "mt-5 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#001F3F] px-4 py-3 text-sm font-bold text-white transition hover:brightness-110";

type PageBackLinkProps = {
  href: string;
  className?: string;
};

/**
 * Regular-page back control: arrow on the left of "חזרה".
 * Place inside a physical-left row (`dir="ltr"` + `justify-start` / `justify-between`).
 */
export function PageBackLink({ href, className = "" }: PageBackLinkProps) {
  return (
    <Link href={href} dir="ltr" className={`${PAGE_BACK_NAV_CLASS} ${className}`.trim()} aria-label="חזרה">
      <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
      <span dir="rtl">חזרה</span>
    </Link>
  );
}

type PageBackButtonProps = {
  onClick: () => void;
  className?: string;
};

/** Regular-page back button (same look as PageBackLink). */
export function PageBackButton({ onClick, className = "" }: PageBackButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      dir="ltr"
      className={`${PAGE_BACK_NAV_CLASS} ${className}`.trim()}
      aria-label="חזרה"
    >
      <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
      <span dir="rtl">חזרה</span>
    </button>
  );
}

/** Full-width left-aligned row for a standalone page back control. */
export function PageBackRow({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex w-full justify-start ${className}`.trim()} dir="ltr">
      {children}
    </div>
  );
}
