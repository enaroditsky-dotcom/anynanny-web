import Link from "next/link";
import { Star } from "lucide-react";
import type { PublicSitterSearchCard } from "@/lib/sitter/sitter-profile";
import {
  ExpertServiceBadge,
  resolveExpertServiceKind,
  type ExpertServiceKind
} from "@/components/sitter/expert-service-icons";
import { isExpertOnlyServiceKind } from "@/lib/sitter/expert-profile";
import {
  bioExcerpt,
  formatParentFacingPriceLabel,
  formatPublicExperienceLabel,
  formatPublicLanguagesLabel,
  formatSearchCardRatingLine,
  formatSearchCardWorkingCities,
  resolveSitterCardTitle,
  transportBadgeLabel
} from "@/lib/sitter/public-search-card";

export function parentSitterProfilePath(sitterId: string, query?: string): string {
  const id = sitterId.trim();
  if (!id || id === "undefined" || id === "null") return "/parent/search";
  const base = `/parent/sitter/${encodeURIComponent(id)}`;
  const trimmedQuery = (query ?? "").replace(/^\?/, "").trim();
  return trimmedQuery ? `${base}?${trimmedQuery}` : base;
}

/** Full public profile href when opened from an active Broadcast Radar session. */
export function parentSitterProfilePathFromBroadcast(
  sitterId: string,
  broadcast: { alertId: string; city: string; serviceType?: string | null }
): string {
  const base = parentSitterProfilePath(sitterId);
  if (base === "/parent/search") return base;

  const params = new URLSearchParams({
    from: "broadcast",
    alertId: broadcast.alertId,
    city: broadcast.city
  });
  const serviceType = (broadcast.serviceType ?? "").trim();
  if (serviceType && serviceType !== "sitter") {
    params.set("type", serviceType);
  }
  return `${base}?${params.toString()}`;
}

function resolveCardServiceKinds(sitter: PublicSitterSearchCard): ExpertServiceKind[] {
  const raw = sitter.service_types;
  if (!Array.isArray(raw) || raw.length === 0) return ["babysitter"];
  const kinds = Array.from(new Set(raw.map((v) => resolveExpertServiceKind(v))));
  return kinds.length > 0 ? kinds : ["babysitter"];
}

export function PublicSitterSearchCardLink({
  sitter,
  query
}: {
  sitter: PublicSitterSearchCard;
  query?: string;
}) {
  const title = resolveSitterCardTitle(sitter);
  const rateLabel = formatParentFacingPriceLabel({
    pricing_model: sitter.pricing_model,
    hourly_rate_nis: sitter.hourly_rate_nis,
    package_price_nis: sitter.package_price_nis
  });
  const profileHref = parentSitterProfilePath(sitter.id, query);
  const serviceAreas = formatSearchCardWorkingCities(sitter.working_cities);
  const serviceKinds = resolveCardServiceKinds(sitter);
  const isExpertCard = serviceKinds.some((kind) => isExpertOnlyServiceKind(kind));
  const experienceLabel = formatPublicExperienceLabel({
    isExpert: isExpertCard,
    years_experience: sitter.years_experience,
    certifications: sitter.certifications,
    service_types: sitter.service_types
  });
  const languagesLabel = formatPublicLanguagesLabel(sitter.languages);

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
            {serviceKinds.map((kind) => (
              <ExpertServiceBadge key={kind} kind={kind} />
            ))}
            <span
              className="rounded-full bg-sky-50 px-2.5 py-0.5 text-xs font-semibold text-sky-900 ring-1 ring-sky-200/80"
              dir="rtl"
            >
              {experienceLabel}
            </span>
            {!isExpertCard ? (
              <span className="rounded-full bg-violet-50 px-2.5 py-0.5 text-xs font-semibold text-violet-900 ring-1 ring-violet-200/80">
                {transportBadgeLabel(sitter.has_car)}
              </span>
            ) : null}
          </div>
          {languagesLabel ? (
            <p className="mt-1.5 text-sm font-semibold text-[#001F3F]" dir="rtl">
              <span className="font-bold text-slate-700">שפות: </span>
              {languagesLabel}
            </p>
          ) : null}
          <p className="mt-1.5 text-xs text-slate-600 unicode-bidi-isolate" dir="rtl">
            <span className="font-semibold text-slate-700">אזורי שירות: </span>
            <span>{serviceAreas}</span>
          </p>
          <p
            className={`mt-1.5 text-sm font-semibold ${rateLabel === "מחיר לא צוין" ? "text-slate-500" : "text-navy-800"}`}
            dir="rtl"
          >
            {rateLabel}
          </p>
          <p className="mt-2 line-clamp-3 text-sm leading-snug text-slate-700" dir="rtl">
            {bioExcerpt(sitter.bio) || "—"}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-center gap-0.5 rounded-2xl bg-amber-50 px-3 py-2 ring-1 ring-amber-200/80">
          <Star className="h-5 w-5 fill-amber-400 text-amber-500" aria-hidden />
          <span className="text-sm font-bold tabular-nums text-amber-950">
            {formatSearchCardRatingLine(sitter)}
          </span>
        </div>
      </div>
      <p className="mt-3 text-right text-xs font-semibold text-emerald-700">פרופיל וחוות דעת ←</p>
    </Link>
  );
}
