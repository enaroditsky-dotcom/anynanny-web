import Link from "next/link";
import { Star } from "lucide-react";
import type { PublicSitterSearchCard } from "@/lib/sitter/sitter-profile";
import {
  bioExcerpt,
  experienceBadgeLabel,
  formatHourlyRateNis,
  resolveSitterCardTitle,
  transportBadgeLabel
} from "@/lib/sitter/public-search-card";

function formatAvgLine(avg: number | null, count: number): string {
  if (count <= 0 || avg == null) return "אין דירוג עדיין";
  return `${Number(avg).toFixed(1)} ★ (${count})`;
}

export function parentSitterProfilePath(sitterId: string): string {
  const id = sitterId.trim();
  if (!id || id === "undefined" || id === "null") return "/parent/search";
  return `/parent/sitter/${encodeURIComponent(id)}`;
}

export function PublicSitterSearchCardLink({ sitter }: { sitter: PublicSitterSearchCard }) {
  const title = resolveSitterCardTitle(sitter);
  const rate = sitter.hourly_rate_nis;
  const rateLabel = formatHourlyRateNis(rate);
  const profileHref = parentSitterProfilePath(sitter.id);

  return (
    <Link
      href={profileHref}
      className="block rounded-3xl border border-navy-header/12 bg-white p-4 shadow-soft transition hover:border-navy-header/25 hover:shadow-md active:scale-[0.99]"
    >
      <div className="flex flex-row-reverse items-start justify-between gap-3">
        <div className="min-w-0 flex-1 text-right">
          <p className="text-base font-bold text-[#001F3F]">{title}</p>
          {sitter.nanny_serial ? (
            <p className="mt-0.5 text-xs font-medium text-slate-500">{sitter.nanny_serial}</p>
          ) : null}
          <div className="mt-2 flex flex-wrap justify-end gap-1.5">
            <span className="rounded-full bg-sky-50 px-2.5 py-0.5 text-xs font-semibold text-sky-900 ring-1 ring-sky-200/80">
              {experienceBadgeLabel(sitter.years_experience)}
            </span>
            <span className="rounded-full bg-violet-50 px-2.5 py-0.5 text-xs font-semibold text-violet-900 ring-1 ring-violet-200/80">
              {transportBadgeLabel(sitter.has_car)}
            </span>
          </div>
          <p className="mt-2 line-clamp-3 text-sm leading-snug text-slate-700">{bioExcerpt(sitter.bio) || "—"}</p>
          <p
            className={`mt-2 text-sm font-semibold ${rateLabel === "מחיר לא צוין" ? "text-slate-500" : "text-navy-800"}`}
          >
            {rateLabel}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-center gap-0.5 rounded-2xl bg-amber-50 px-3 py-2 ring-1 ring-amber-200/80">
          <Star className="h-5 w-5 fill-amber-400 text-amber-500" aria-hidden />
          <span className="text-sm font-bold tabular-nums text-amber-950">
            {formatAvgLine(sitter.avg_rating, sitter.rating_count)}
          </span>
        </div>
      </div>
      <p className="mt-3 text-right text-xs font-semibold text-emerald-700">פרופיל וחוות דעת ←</p>
    </Link>
  );
}
