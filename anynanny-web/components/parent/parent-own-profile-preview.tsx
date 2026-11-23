"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { MapPin, ShieldAlert, Star, User, Users, X } from "lucide-react";
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
  ratingCount
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
    city
  });
  const displayName = parent.first_name || firstName || "הורה";
  const shownRating = normalizeParentRatingAverage(parent.rating_average);
  const shownRatingCount = normalizeParentRatingCount(parent.rating_count);
  const hasRating = shownRating != null && shownRatingCount > 0;

  return (
    <section
      aria-labelledby={titleId}
      className="min-h-[calc(100dvh-3.25rem-env(safe-area-inset-top,0px))] bg-[linear-gradient(180deg,#F5F8FF_0%,#E5EEFF_52%,#F5F8FF_100%)] pb-[calc(1rem+env(safe-area-inset-bottom,0px))]"
      dir="rtl"
    >
      <div className="flex items-center justify-between gap-3 px-4 pb-1 pt-3">
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
        <p className="px-4 py-10 text-center text-sm text-slate-500" aria-busy="true">
          טוען את כרטיס הפרופיל…
        </p>
      ) : (
        <div className="space-y-4 px-4 pb-2 pt-2">
          <div className="flex flex-col items-center text-center">
            <div className="h-[120px] w-[120px] overflow-hidden rounded-full border border-[#D6E5FF] bg-[#E5EEFF]">
              <ProfileImage
                src={parent.avatar_url}
                name={displayName}
                className="h-full w-full bg-[#E5EEFF] text-[#001F3F]/45"
                fallback={<User className="h-12 w-12" aria-hidden />}
              />
            </div>

            <h3 className="mt-3 text-xl font-extrabold text-[#001F3F]">{displayName}</h3>

            <div className="mt-2 flex justify-center">
              {parent.identity_verified ? (
                <VerifiedUserBadge size="xl" label={VERIFIED_PARENT_IDENTITY_LABEL} />
              ) : (
                <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-700">
                  <ShieldAlert className="h-4 w-4" aria-hidden />
                  זהות ההורה טרם אומתה
                </div>
              )}
            </div>

            <div className="mt-2">
              {hasRating ? (
                <div className="inline-flex flex-row-reverse items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-800">
                  <Star className="h-4 w-4 fill-amber-400 text-amber-400" aria-hidden />
                  <span>{shownRating.toFixed(1)}</span>
                  <span className="font-medium text-amber-700">
                    · {shownRatingCount === 1 ? "חוות דעת אחת" : `${shownRatingCount} חוות דעת`}
                  </span>
                </div>
              ) : (
                <div className="inline-flex flex-row-reverse items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-500">
                  <Star className="h-4 w-4 text-slate-300" aria-hidden />
                  טרם דורג
                </div>
              )}
            </div>
          </div>

          <section className="rounded-2xl border border-[#D6E5FF] bg-white p-4 shadow-[0_10px_24px_-20px_rgba(0,31,63,0.45)]">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#E5EEFF] text-[#001F3F]">
                <Users className="h-5 w-5" aria-hidden />
              </div>
              <div className="min-w-0 flex-1 text-right">
                <h3 className="text-sm font-extrabold text-[#001F3F]">פרטי הילדים</h3>
                <p className="mt-1 text-sm font-bold text-[#001F3F]">
                  {parent.children_count != null
                    ? `${parent.children_count} ילדים`
                    : PARENT_CHILDREN_COUNT_EMPTY}
                </p>
                <p className="mt-1 text-xs text-slate-600">
                  {parent.children_ages
                    ? `גילאים: ${parent.children_ages}`
                    : PARENT_CHILDREN_AGES_EMPTY}
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-[#D6E5FF] bg-white p-4 shadow-[0_10px_24px_-20px_rgba(0,31,63,0.45)]">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#E5EEFF] text-[#001F3F]">
                <MapPin className="h-5 w-5" aria-hidden />
              </div>
              <div className="min-w-0 flex-1 text-right">
                <h3 className="text-sm font-extrabold text-[#001F3F]">עיר מגורים</h3>
                <p className="mt-1 text-sm font-bold text-[#001F3F]">
                  {parent.city ?? "העיר לא צוינה"}
                </p>
                <p className="mt-2 text-xs leading-relaxed text-slate-500">
                  {PARENT_FULL_ADDRESS_DISCLOSURE}
                </p>
              </div>
            </div>
          </section>
        </div>
      )}
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
