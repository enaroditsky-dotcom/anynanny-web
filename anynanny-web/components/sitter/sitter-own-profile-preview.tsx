"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ChevronDown, Star, User, Wallet, X } from "lucide-react";
import { VerifiedUserBadge, VERIFIED_IDENTITY_LABEL } from "@/components/identity/verified-user-badge";
import { ProfileImage } from "@/components/profile/profile-image";
import {
  fetchParentSitterProfile,
  formatPublicSitterAgeLabel,
  publicSitterDisplayName
} from "@/lib/sitter/fetch-parent-sitter-profile";
import {
  formatSitterLanguagesDisplay,
  type PublicSitterReview,
  type SitterProfilePublic
} from "@/lib/sitter/sitter-profile";
import {
  formatParentFacingPriceLabel,
  formatPublicExperienceLabel,
  formatPublicLanguagesLabel
} from "@/lib/sitter/public-search-card";
import { sitterDashboardSerialLabel } from "@/lib/public/sequential-display-id";
import { appShellScrollElement } from "@/lib/ui/app-shell";
import { preferredReceivingMethodLabel } from "@/lib/wallet/sitter-payout-methods";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type SitterOwnProfilePreviewProps = {
  open: boolean;
  sitterId: string;
  onClose: () => void;
};

function formatReviewDate(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  try {
    return new Date(t).toLocaleDateString("he-IL");
  } catch {
    return "";
  }
}

/**
 * In-flow read-only preview of the sitter's parent-facing profile.
 * Loaded only through the public profile RPC. No booking, message, or rating actions.
 */
export function SitterOwnProfilePreview({ open, sitterId, onClose }: SitterOwnProfilePreviewProps) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  const pushedRef = useRef(false);
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<SitterProfilePublic | null>(null);
  const [reviews, setReviews] = useState<PublicSitterReview[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [reviewsOpen, setReviewsOpen] = useState(false);

  onCloseRef.current = onClose;

  const requestClose = useCallback(() => {
    if (pushedRef.current) {
      pushedRef.current = false;
      window.history.back();
    }
    onCloseRef.current();
  }, []);

  useEffect(() => {
    if (!open) return;
    window.history.pushState(
      { ...(window.history.state ?? {}), anynannySitterProfilePreview: true },
      ""
    );
    pushedRef.current = true;
    const onPop = () => {
      pushedRef.current = false;
      onCloseRef.current();
    };
    window.addEventListener("popstate", onPop);
    appShellScrollElement()?.scrollTo({ top: 0 });
    return () => {
      window.removeEventListener("popstate", onPop);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        requestClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    closeRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, requestClose]);

  useEffect(() => {
    if (!open) return;
    const supabase = getSupabaseBrowserClient();
    if (!sitterId || !supabase) {
      setProfile(null);
      setReviews([]);
      setErrorMessage("לא ניתן לטעון את הפרופיל הציבורי כרגע.");
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setErrorMessage(null);
    setReviewsOpen(false);
    void (async () => {
      const loaded = await fetchParentSitterProfile(supabase, sitterId);
      if (cancelled) return;
      if (loaded.error) {
        setProfile(null);
        setReviews([]);
        setErrorMessage(loaded.error);
      } else {
        setProfile(loaded.profile);
        setReviews(loaded.reviews);
        setErrorMessage(null);
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [open, sitterId]);

  if (!open) return null;

  const displayName = publicSitterDisplayName(profile) || "בייביסיטר";
  const publicId = sitterDashboardSerialLabel(profile?.nanny_serial);
  const ageLabel = formatPublicSitterAgeLabel(profile?.age_years);
  const experienceLabel = profile
    ? formatPublicExperienceLabel({
        isExpert: false,
        years_experience:
          profile.years_experience != null && Number.isFinite(Number(profile.years_experience))
            ? Number(profile.years_experience)
            : null,
        certifications: profile.certifications ?? null,
        service_types: profile.service_types
      })
    : null;
  const languagesLabel = profile
    ? formatPublicLanguagesLabel(profile.languages) || formatSitterLanguagesDisplay(profile.languages) || null
    : null;
  const cities = (profile?.working_cities ?? []).map((city) => String(city).trim()).filter(Boolean);
  const rateLabel = profile
    ? formatParentFacingPriceLabel({
        pricing_model: profile.pricing_model,
        hourly_rate_nis: profile.hourly_rate_nis,
        package_price_nis: profile.package_price_nis
      })
    : null;
  const preferredPaymentLabel = preferredReceivingMethodLabel(profile?.payout_preferred_method);
  const avgRating =
    profile?.avg_rating != null && Number.isFinite(Number(profile.avg_rating))
      ? Number(profile.avg_rating)
      : null;
  const ratingCount =
    profile?.rating_count != null && Number.isFinite(Number(profile.rating_count))
      ? Math.max(0, Math.floor(Number(profile.rating_count)))
      : 0;
  const hasPublishedRating = avgRating != null && avgRating > 0 && ratingCount > 0;
  const writtenReviews = reviews.filter((review) => String(review.comment ?? "").trim().length > 0);

  return (
    <section
      aria-labelledby={titleId}
      className="bg-[linear-gradient(180deg,#F5F8FF_0%,#E5EEFF_52%,#F5F8FF_100%)] px-1 pt-[max(0.25rem,env(safe-area-inset-top,0px))] pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]"
      dir="rtl"
    >
      <article className="mx-auto w-full rounded-[1.75rem] border border-[#D6E5FF] bg-[#FFFEFA] shadow-[0_18px_40px_-28px_rgba(15,40,70,0.35)]">
        <div className="flex items-center justify-between gap-3 px-3.5 pb-0.5 pt-2">
          <h2 id={titleId} className="min-w-0 flex-1 text-base font-extrabold text-[#001F3F]">
            כרטיס הביקור שלי
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={requestClose}
            aria-label="סגירת הכרטיס"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#D6E5FF] bg-white text-[#001F3F] transition hover:bg-[#E5EEFF]"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        {loading ? (
          <p className="px-3.5 py-8 text-center text-sm text-slate-500" aria-busy="true">
            טוען את כרטיס הפרופיל…
          </p>
        ) : errorMessage ? (
          <p className="px-3.5 py-8 text-center text-sm text-rose-700">{errorMessage}</p>
        ) : !profile ? (
          <p className="px-3.5 py-8 text-center text-sm leading-relaxed text-slate-600">
            הפרופיל הציבורי עדיין לא גלוי להורים. הוא מוצג רק אחרי השלמת ההרשמה וכאשר הפרופיל ציבורי.
          </p>
        ) : (
          <div className="space-y-3 px-3.5 pb-4 pt-1">
            <div className="flex flex-col items-center text-center">
              <div className="h-20 w-20 overflow-hidden rounded-full border border-slate-200 bg-slate-100">
                <ProfileImage
                  src={profile.avatar_url}
                  name={displayName}
                  className="h-full w-full rounded-full bg-slate-100 text-slate-400"
                  fallback={<User className="h-10 w-10" aria-hidden />}
                />
              </div>
              <h3 className="mt-3 max-w-full break-words text-xl font-bold text-[#001F3F]">{displayName}</h3>
              {publicId ? (
                <p className="mt-0.5 text-xs font-semibold text-violet-600">
                  מזהה: <span dir="ltr">{publicId}</span>
                </p>
              ) : null}
              {profile.identity_verified ? (
                <div className="mt-2 flex justify-center">
                  <VerifiedUserBadge size="xl" label={VERIFIED_IDENTITY_LABEL} />
                </div>
              ) : null}
              <div className="mt-2">
                {hasPublishedRating ? (
                  <div className="inline-flex flex-row-reverse items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-bold text-amber-900">
                    <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden />
                    <span>{avgRating.toFixed(1)}</span>
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

            <div className="space-y-1 text-right">
              {ageLabel ? <p className="text-sm font-bold text-[#001F3F]">{ageLabel}</p> : null}
              {experienceLabel ? (
                <p className="text-xs font-semibold text-slate-700">{experienceLabel}</p>
              ) : null}
              {languagesLabel ? (
                <p className="text-sm font-bold text-[#001F3F]">
                  <span className="text-slate-600">שפות: </span>
                  {languagesLabel}
                </p>
              ) : null}
              <p className="text-xs text-slate-600">
                <span className="font-semibold text-slate-700">אזור עבודה: </span>
                <span>{cities.length > 0 ? cities.join(" · ") : "לא צוין"}</span>
              </p>
              <p className="text-xs font-medium text-violet-700">
                {profile.has_car ? "דרך הגעה: עצמאית" : "דרך הגעה: תחבורה ציבורית"}
              </p>
              <div className="flex items-center gap-1.5 pt-1 text-sm" dir="rtl">
                <Wallet className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
                <span className="font-semibold text-slate-600">דרך קבלת תשלום מועדפת:</span>
                {preferredPaymentLabel ? (
                  <span className="font-bold text-[#001F3F]">{preferredPaymentLabel}</span>
                ) : (
                  <span className="font-medium italic text-slate-400">לא הוגדר</span>
                )}
              </div>
              {rateLabel ? <p className="pt-1 text-sm font-semibold text-navy-800">{rateLabel}</p> : null}
            </div>

            <div className="border-t border-slate-100 pt-3 text-right">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">אודות</h3>
              <p className="mt-1 text-sm text-slate-700">{profile.bio || "אין פירוט זמין"}</p>
            </div>

            <div className="border-t border-slate-100 pt-3 text-right">
              <button
                type="button"
                aria-expanded={reviewsOpen}
                aria-controls="sitter-own-profile-reviews"
                onClick={() => setReviewsOpen((value) => !value)}
                className="flex min-h-11 w-full items-center justify-between gap-2 text-right"
              >
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  חוות דעת ({writtenReviews.length})
                </span>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-slate-400 transition ${reviewsOpen ? "rotate-180" : ""}`}
                  aria-hidden
                />
              </button>
              {reviewsOpen ? (
                <div id="sitter-own-profile-reviews" className="mt-2 space-y-2">
                  {writtenReviews.length === 0 ? (
                    <p className="text-sm text-slate-500">עדיין אין חוות דעת</p>
                  ) : (
                    <ul className="space-y-2.5">
                      {writtenReviews.map((review, index) => (
                        <li
                          key={`${review.created_at}-${index}`}
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
          </div>
        )}
      </article>
    </section>
  );
}
