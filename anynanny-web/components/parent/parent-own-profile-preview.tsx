"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ShieldAlert, Star, User, X } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import {
  VERIFIED_PARENT_IDENTITY_LABEL,
  VerifiedUserBadge
} from "@/components/identity/verified-user-badge";
import { ProfileImage } from "@/components/profile/profile-image";
import {
  PARENT_CHILDREN_AGES_EMPTY,
  PARENT_CHILDREN_COUNT_EMPTY,
  PARENT_FULL_ADDRESS_DISCLOSURE,
  normalizeParentRatingAverage,
  normalizeParentRatingCount
} from "@/components/sitter/parent-details-modal";
import { isIdentityVerified, fetchIdentityVerification } from "@/lib/identity/identity-verification";
import {
  parentProfileCityOnly,
  projectOwnParentProfileCard
} from "@/lib/parent/own-profile-card-preview";
import { parentDashboardSerialLabel } from "@/lib/public/sequential-display-id";
import { appShellScrollElement } from "@/lib/ui/app-shell";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { isPostgrestSchemaDriftError } from "@/lib/supabase/postgrest-schema";
import { PROFILES_TABLE } from "@/lib/supabase/profiles";

type ParentOwnProfilePreviewProps = {
  open: boolean;
  onClose: () => void;
  firstName: string;
  avatarUrl: string | null;
  ratingAverage: number;
  ratingCount: number;
  publicId?: string | null;
};

/**
 * In-flow read-only preview of the parent's sitter-facing card.
 * It stays inside the app shell. The full address stays hidden.
 */
export function ParentOwnProfilePreview({
  open,
  onClose,
  firstName,
  avatarUrl,
  ratingAverage,
  ratingCount,
  publicId = null
}: ParentOwnProfilePreviewProps) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  const pushedRef = useRef(false);
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [identityVerified, setIdentityVerified] = useState(false);
  const [city, setCity] = useState<string | null>(null);

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
      { ...(window.history.state ?? {}), anynannyParentProfilePreview: true },
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
    const userId = user?.id ?? "";
    const supabase = getSupabaseBrowserClient();
    if (!userId || !supabase) {
      setIdentityVerified(false);
      setCity(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    void (async () => {
      const [identityResult, cityResult] = await Promise.all([
        fetchIdentityVerification(supabase, userId, { role: "parent" }).catch(() => null),
        readOwnParentCity(supabase, userId)
      ]);
      if (cancelled) return;
      setIdentityVerified(
        identityResult ? isIdentityVerified(identityResult.record.status) : false
      );
      setCity(cityResult);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [open, user?.id]);

  if (!open) return null;

  const parent = projectOwnParentProfileCard({
    firstName,
    avatarUrl,
    ratingAverage,
    ratingCount,
    identityVerified,
    reviews: [],
    city,
    publicId
  });
  const displayName = parent.first_name || firstName || "הורה";
  const shownRating = normalizeParentRatingAverage(parent.rating_average);
  const shownRatingCount = normalizeParentRatingCount(parent.rating_count);
  const hasRating = shownRating != null && shownRatingCount > 0;
  const shownPublicId = parentDashboardSerialLabel(parent.public_id);

  return (
    <section
      aria-labelledby={titleId}
      className="bg-[linear-gradient(180deg,#F5F8FF_0%,#E5EEFF_52%,#F5F8FF_100%)] px-3 pt-[max(0.25rem,env(safe-area-inset-top,0px))] pb-[max(0.25rem,env(safe-area-inset-bottom,0px))]"
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
        ) : (
          <div className="space-y-1.5 px-3 pb-2.5 pt-0.5">
            <div className="flex items-center gap-3">
              <div className="h-[84px] w-[84px] shrink-0 overflow-hidden rounded-full border border-[#D6E5FF] bg-[#E5EEFF]">
                <ProfileImage
                  src={parent.avatar_url}
                  name={displayName}
                  className="h-full w-full bg-[#E5EEFF] text-[#001F3F]/45"
                  fallback={<User className="h-8 w-8" aria-hidden />}
                />
              </div>

              <div className="flex min-w-0 flex-1 flex-col items-start gap-1 text-right">
                <h3 className="w-full text-base font-extrabold leading-tight text-[#001F3F]">
                  {displayName}
                </h3>
                {shownPublicId ? (
                  <p
                    dir="ltr"
                    className="inline-flex max-w-full items-center rounded-md border border-purple-200 bg-purple-50 px-1.5 py-px text-[12px] font-bold tracking-wide text-purple-800"
                  >
                    {shownPublicId}
                  </p>
                ) : null}
                {parent.identity_verified ? (
                  <VerifiedUserBadge size="sm" label={VERIFIED_PARENT_IDENTITY_LABEL} />
                ) : (
                  <div className="inline-flex max-w-full items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold leading-tight text-amber-700">
                    <ShieldAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    <span>זהות ההורה טרם אומתה</span>
                  </div>
                )}
                {hasRating ? (
                  <div className="inline-flex max-w-full flex-row-reverse items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-bold leading-tight text-amber-800">
                    <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400" aria-hidden />
                    <span>{shownRating.toFixed(1)}</span>
                    <span className="font-medium text-amber-700">
                      · {shownRatingCount === 1 ? "חוות דעת אחת" : `${shownRatingCount} חוות דעת`}
                    </span>
                  </div>
                ) : (
                  <div className="inline-flex max-w-full flex-row-reverse items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium leading-tight text-slate-500">
                    <Star className="h-3.5 w-3.5 shrink-0 text-slate-300" aria-hidden />
                    טרם דורג
                  </div>
                )}
              </div>
            </div>

            <section className="rounded-xl border border-[#D6E5FF] bg-white px-3 py-1.5">
              <h3 className="text-sm font-extrabold leading-tight text-[#001F3F]">פרטי הילדים</h3>
              <p className="mt-0.5 text-sm font-bold leading-tight text-[#001F3F]">
                {parent.children_count != null
                  ? `${parent.children_count} ילדים`
                  : PARENT_CHILDREN_COUNT_EMPTY}
              </p>
              <p className="mt-0.5 text-xs leading-tight text-slate-600">
                {parent.children_ages
                  ? `גילאים: ${parent.children_ages}`
                  : PARENT_CHILDREN_AGES_EMPTY}
              </p>
            </section>

            <section className="rounded-xl border border-[#D6E5FF] bg-white px-3 py-1.5">
              <h3 className="text-sm font-extrabold leading-tight text-[#001F3F]">עיר מגורים</h3>
              <p className="mt-0.5 text-sm font-bold leading-tight text-[#001F3F]">
                {parent.city ?? "העיר לא צוינה"}
              </p>
              <p className="mt-0.5 text-xs leading-snug text-slate-500">
                {PARENT_FULL_ADDRESS_DISCLOSURE}
              </p>
            </section>
          </div>
        )}
      </article>
    </section>
  );
}

async function readOwnParentCity(
  supabase: NonNullable<ReturnType<typeof getSupabaseBrowserClient>>,
  userId: string
): Promise<string | null> {
  const primary = await supabase
    .from(PROFILES_TABLE)
    .select("city, address")
    .eq("id", userId)
    .maybeSingle();

  if (!primary.error) return parentProfileCityOnly(primary.data);
  if (!isPostgrestSchemaDriftError(primary.error.message)) return null;

  const addressOnly = await supabase
    .from(PROFILES_TABLE)
    .select("address")
    .eq("id", userId)
    .maybeSingle();
  if (!addressOnly.error) return parentProfileCityOnly(addressOnly.data);

  const cityOnly = await supabase
    .from(PROFILES_TABLE)
    .select("city")
    .eq("id", userId)
    .maybeSingle();
  if (cityOnly.error) return null;
  return parentProfileCityOnly(cityOnly.data);
}
