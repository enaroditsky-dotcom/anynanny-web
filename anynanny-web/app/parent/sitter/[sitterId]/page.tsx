"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { Calendar, ArrowRight, ChevronDown, Star, User, Wallet } from "lucide-react";
import {
  formatSitterLanguagesDisplay,
  type PublicSitterReview,
  type SitterProfilePublic
} from "@/lib/sitter/sitter-profile";
import { publicSitterDisplayName, formatPublicSitterAgeLabel } from "@/lib/sitter/fetch-parent-sitter-profile";
import { BookShiftModal } from "@/components/parent/book-shift-modal";
import { UserSafetyActions } from "@/components/safety/user-safety-actions";
import {
  VERIFIED_SITTER_IDENTITY_LABEL,
  VerifiedUserBadge
} from "@/components/identity/verified-user-badge";
import {
  formatParentFacingPriceLabel,
  formatPublicExperienceLabel,
  formatPublicLanguagesLabel
} from "@/lib/sitter/public-search-card";
import { broadcastRadarHref } from "@/lib/broadcast/parent-active-broadcast";
import { requestedShiftFromSearchParams } from "@/lib/bookings/requested-shift";
import { preferredReceivingMethodLabel } from "@/lib/wallet/sitter-payout-methods";

function formatReviewDate(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  try {
    return new Date(t).toLocaleDateString("he-IL");
  } catch {
    return "";
  }
}

export default function ParentSitterProfileView() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const sitterId = typeof params?.sitterId === "string" ? params.sitterId : "";
  const { isLoading, signedIn, effectiveRole } = useAuth();

  const [profile, setProfile] = useState<SitterProfilePublic | null>(null);
  const [reviews, setReviews] = useState<PublicSitterReview[]>([]);
  const [fetching, setFetching] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
  const [reviewsOpen, setReviewsOpen] = useState(false);

  const fromBroadcast = searchParams.get("from") === "broadcast";
  const broadcastAlertId = (searchParams.get("alertId") ?? "").trim();
  const broadcastCity = (searchParams.get("city") ?? "").trim();
  const broadcastType = (searchParams.get("type") ?? "sitter").trim() || "sitter";
  const backToBroadcast =
    fromBroadcast && broadcastAlertId.length > 0 && broadcastCity.length > 0
      ? broadcastRadarHref({
          id: broadcastAlertId,
          city: broadcastCity,
          service_type: broadcastType
        })
      : null;
  const resultsQuery = searchParams.toString();
  const backHref =
    backToBroadcast ??
    (resultsQuery && !fromBroadcast
      ? `/parent/search/results?${resultsQuery}`
      : "/parent/search/results");
  const backLabel = backToBroadcast ? "חזרה לשידור" : "חזרה לחיפוש";
  const requestedShift = useMemo(
    () => (fromBroadcast ? null : requestedShiftFromSearchParams(searchParams)),
    [fromBroadcast, searchParams]
  );

  useEffect(() => {
    if (isLoading) return;
    if (!signedIn) {
      router.replace(`/auth/login?next=/parent/sitter/${sitterId}`);
      return;
    }
    if (effectiveRole === "sitter") {
      router.replace("/sitter/dashboard");
    }
  }, [isLoading, signedIn, effectiveRole, sitterId, router]);

  useEffect(() => {
    async function loadSitter() {
      if (!sitterId) return;

      try {
        const res = await fetch(`/api/parent/sitter/${encodeURIComponent(sitterId)}/public`, {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store"
        });
        const json = (await res.json().catch(() => ({}))) as {
          profile?: SitterProfilePublic | null;
          reviews?: PublicSitterReview[];
          error?: string;
        };

        if (!res.ok || !json.profile) {
          setErrorMsg(json.error || "הפרופיל אינו נמצא.");
          setProfile(null);
          setReviews([]);
        } else {
          setProfile(json.profile);
          setReviews(Array.isArray(json.reviews) ? json.reviews : []);
          setErrorMsg(null);
        }
      } catch {
        setErrorMsg("שגיאה בטעינת הפרופיל.");
        setProfile(null);
        setReviews([]);
      } finally {
        setFetching(false);
      }
    }

    if (signedIn && effectiveRole === "parent") {
      void loadSitter();
    }
  }, [sitterId, signedIn, effectiveRole]);

  useEffect(() => {
    setReviewsOpen(false);
  }, [sitterId]);

  const displayName =
    publicSitterDisplayName(profile) || profile?.nanny_serial || "בייביסיטר";
  const workingCity = profile?.working_cities?.[0] || "חיפה";
  const rateLabel = formatParentFacingPriceLabel({
    pricing_model: profile?.pricing_model,
    hourly_rate_nis: profile?.hourly_rate_nis,
    package_price_nis: profile?.package_price_nis
  });
  const experienceLabel = formatPublicExperienceLabel({
    isExpert: false,
    years_experience:
      profile?.years_experience != null && Number.isFinite(Number(profile.years_experience))
        ? Number(profile.years_experience)
        : null,
    certifications: profile?.certifications ?? null,
    service_types: profile?.service_types
  });
  const languagesLabel =
    formatPublicLanguagesLabel(profile?.languages) ||
    formatSitterLanguagesDisplay(profile?.languages) ||
    null;

  const serialNumber = profile?.nanny_serial;
  const serialRaw = serialNumber ? String(serialNumber).trim() : "";
  const serialDisplay = serialRaw
    ? /^AN-/i.test(serialRaw)
      ? serialRaw
      : /^\d+$/.test(serialRaw)
        ? `AN-${serialRaw}`
        : serialRaw
    : null;

  const avgRating =
    profile?.avg_rating != null && Number.isFinite(Number(profile.avg_rating))
      ? Number(profile.avg_rating)
      : null;
  const ratingCount =
    profile?.rating_count != null && Number.isFinite(Number(profile.rating_count))
      ? Math.max(0, Math.floor(Number(profile.rating_count)))
      : 0;
  const hasPublishedRating = avgRating != null && avgRating > 0 && ratingCount > 0;
  const writtenReviews = reviews.filter((r) => String(r.comment ?? "").trim().length > 0);
  const preferredPaymentLabel = preferredReceivingMethodLabel(profile?.payout_preferred_method);
  const ageLabel = formatPublicSitterAgeLabel(profile?.age_years);

  return (
    <main className="mx-auto w-full max-w-md space-y-4 bg-[#FDFBF6] py-4 pb-24 px-2" dir="rtl">
      <div className="px-1">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 text-sm font-bold text-[#001F3F] transition hover:opacity-80"
        >
          <ArrowRight className="h-4 w-4" />
          {backLabel}
        </Link>
      </div>

      {fetching ? (
        <p className="text-right text-sm text-slate-600 px-1">טוען פרופיל…</p>
      ) : errorMsg ? (
        <p className="text-right text-sm text-rose-700 px-1">{errorMsg}</p>
      ) : profile ? (
        <div className="rounded-3xl border border-navy-header/12 bg-white p-5 shadow-soft space-y-4">
          <div className="flex flex-col items-center text-center">
            <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full border border-slate-200 bg-slate-100 shadow-sm">
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt={displayName} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-slate-400">
                  <User className="h-10 w-10" />
                </div>
              )}
            </div>
            <h1 className="mt-3 max-w-full truncate text-xl font-bold text-[#001F3F]">{displayName}</h1>
            {serialDisplay ? (
              <p className="mt-0.5 text-xs font-semibold text-violet-600">מזהה: {serialDisplay}</p>
            ) : null}
            {profile.identity_verified ? (
              <div className="mt-2 flex justify-center">
                <VerifiedUserBadge size="xl" label={VERIFIED_SITTER_IDENTITY_LABEL} />
              </div>
            ) : null}
            <div className="mt-2">
              {hasPublishedRating ? (
                <div className="inline-flex flex-row-reverse items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-bold text-amber-900">
                  <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden />
                  <span>{avgRating!.toFixed(1)}</span>
                  <span className="font-medium text-amber-700">
                    · {ratingCount === 1 ? "דירוג אחד" : `${ratingCount} דירוגים`}
                  </span>
                </div>
              ) : (
                <div className="inline-flex flex-row-reverse items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-500">
                  <Star className="h-3.5 w-3.5 text-slate-300" aria-hidden />
                  <span>טרם דורג</span>
                </div>
              )}
            </div>
          </div>

          <div className="text-right space-y-1">
            {ageLabel ? (
              <p className="text-sm font-bold text-[#001F3F] pt-0.5" dir="rtl">
                {ageLabel}
              </p>
            ) : null}
            <div className="flex items-center gap-1 text-xs text-slate-600 pt-1" dir="rtl">
              <span className="font-semibold text-slate-700">{experienceLabel}</span>
            </div>
            {languagesLabel ? (
              <p className="text-sm font-bold text-[#001F3F] pt-0.5" dir="rtl">
                <span className="text-slate-600">שפות: </span>
                {languagesLabel}
              </p>
            ) : null}
            <div className="flex items-center gap-1 text-xs text-slate-600" dir="rtl">
              <span className="font-semibold text-slate-700">אזור עבודה:</span>
              <span>{workingCity}</span>
            </div>
            <p className="text-xs text-violet-700 font-medium">
              {profile.has_car ? "דרך הגעה: עצמאית" : "דרך הגעה: תחבורה ציבורית"}
            </p>
            {preferredPaymentLabel ? (
              <div className="flex items-center gap-1.5 pt-1 text-sm font-bold text-[#001F3F]" dir="rtl">
                <Wallet className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
                <span className="font-semibold text-slate-600">דרך קבלת תשלום מועדפת:</span>
                <span>{preferredPaymentLabel}</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 pt-1 text-sm" dir="rtl">
                <Wallet className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
                <span className="font-semibold text-slate-600">דרך קבלת תשלום מועדפת:</span>
                <span className="font-medium italic text-slate-400">לא הוגדר</span>
              </div>
            )}
            <p className="text-sm font-semibold text-navy-800 pt-1">{rateLabel}</p>
          </div>

          <div className="border-t border-slate-100 pt-3 text-right">
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider">אודות</h2>
            <p className="mt-1 text-sm text-slate-700">{profile.bio || "אין פירוט זמין"}</p>
          </div>

          <div className="border-t border-slate-100 pt-3 text-right">
            <button
              type="button"
              aria-expanded={reviewsOpen}
              aria-controls="sitter-profile-reviews"
              onClick={() => setReviewsOpen((open) => !open)}
              className="flex min-h-9 w-full items-center justify-between gap-2 text-right"
            >
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                חוות דעת ({writtenReviews.length})
              </span>
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-slate-400 transition ${reviewsOpen ? "rotate-180" : ""}`}
                aria-hidden
              />
            </button>
            {reviewsOpen ? (
              <div id="sitter-profile-reviews" className="mt-2 space-y-2">
                {writtenReviews.length === 0 ? (
                  <p className="text-sm text-slate-500">עדיין אין חוות דעת</p>
                ) : (
                  <ul className="space-y-2.5">
                    {writtenReviews.map((review, idx) => (
                      <li
                        key={`${review.created_at}-${idx}`}
                        className="rounded-2xl border border-slate-100 bg-slate-50/80 px-3 py-2.5 text-right"
                      >
                        <div className="flex flex-row-reverse items-center justify-between gap-2">
                          <span className="inline-flex flex-row-reverse items-center gap-1 text-xs font-bold text-amber-900">
                            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden />
                            {Number(review.rating).toFixed(0)}
                          </span>
                          {review.created_at ? (
                            <span className="text-[13px] tabular-nums text-slate-400">
                              {formatReviewDate(review.created_at)}
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1.5 text-sm leading-relaxed text-slate-700">{review.comment}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}
          </div>

          <div className="border-t border-slate-100 pt-3 space-y-2">
            <UserSafetyActions targetUserId={sitterId} targetName={displayName} />

            <button
              type="button"
              onClick={() => setIsBookingModalOpen(true)}
              className="flex w-full items-center justify-between rounded-2xl bg-[#001F3F] p-3 text-white transition hover:bg-[#002b5c] active:scale-[0.99]"
            >
              <div className="text-right">
                <p className="text-sm font-bold">תיאום משמרת</p>
                <p className="text-xs text-slate-200">
                  {requestedShift
                    ? "אשרו את המשמרת שחיפשתם — הבקשה תישלח לאישור"
                    : "בחרו תאריך ושעות — הבקשה תישלח לאישור"}
                </p>
              </div>
              <Calendar className="h-5 w-5 text-white" />
            </button>
          </div>
        </div>
      ) : null}

      <BookShiftModal
        open={isBookingModalOpen}
        sitterId={sitterId}
        sitterName={displayName}
        requestedShift={requestedShift}
        onClose={() => setIsBookingModalOpen(false)}
        onSuccess={() => {
          setIsBookingModalOpen(false);
          router.push("/parent/dashboard");
        }}
      />
    </main>
  );
}
