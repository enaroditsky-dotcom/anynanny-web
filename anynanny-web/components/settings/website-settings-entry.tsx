import { ExternalLink, Globe } from "lucide-react";

export const ANYNANNY_WEBSITE_HREF = "https://www.anynanny.org";
export const WEBSITE_SETTINGS_TITLE = "בקרו באתר AnyNanny";
export const WEBSITE_SETTINGS_SUBTITLE = "הכירו את הסיפור שלנו, הקהילה וכל מה שחדש";

export function WebsiteSettingsEntry() {
  return (
    <div className="mt-6 rounded-3xl border border-[#001F3F]/12 bg-white p-4 shadow-soft text-right">
      <a
        href={ANYNANNY_WEBSITE_HREF}
        target="_blank"
        rel="noopener noreferrer"
        className="flex min-h-[44px] w-full items-center justify-between gap-3 rounded-xl p-2.5 text-right transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#001F3F] focus-visible:ring-offset-2"
        aria-label={`${WEBSITE_SETTINGS_TITLE}. ${WEBSITE_SETTINGS_SUBTITLE}. נפתח בדפדפן חיצוני.`}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#001F3F]/[0.06] text-[#001F3F]">
            <Globe className="h-4 w-4" aria-hidden />
          </div>
          <span className="min-w-0">
            <span className="block text-base font-extrabold leading-snug text-[#001F3F]">
              {WEBSITE_SETTINGS_TITLE}
            </span>
            <span className="mt-0.5 block text-xs font-normal leading-snug text-slate-500">
              {WEBSITE_SETTINGS_SUBTITLE}
            </span>
          </span>
        </div>
        <ExternalLink className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
      </a>
    </div>
  );
}
