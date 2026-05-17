"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Calendar, Star } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import {
  fetchParentSitterProfile,
  parseRouteSitterId,
  resolveParentSitterDisplayName
} from "@/lib/sitter/fetch-parent-sitter-profile";
import type { PublicSitterReview, SitterProfilePublic } from "@/lib/sitter/sitter-profile";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

function formatAvg(avg: number | null | undefined, count: number | null | undefined): string {
  const c = count ?? 0;
  if (c <= 0 || avg == null) return "אין דירוג עדיין";
  return `${Number(avg).toFixed(1)} ★ (${c} ביקורות)`;
}

export default function ParentSitterProfilePage() {
  const params = useParams();
  const router = useRouter();
  const sitterId = parseRouteSitterId(params?.sitterId);

  const { isLoading, signedIn, effectiveRole } = useAuth();
  const [profile, setProfile] = useState<SitterProfilePublic | null>(null);
  const [reviews, setReviews] = useState<PublicSitterReview[]>([]);
  const [pageState, setPageState] = useState<"loading" | "missing" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (isLoading) return;
    if (!signedIn) {
      const next = sitterId ? `/parent/sitter/${sitterId}` : "/parent/search";
      router.replace(`/auth/login?next=${encodeURIComponent(next)}`);
      return;
    }
    if (effectiveRole === "sitter") {
      router.replace("/sitter/dashboard");
    }
  }, [isLoading, signedIn, effectiveRole, router, sitterId]);

  const loadProfile = useCallback(async () => {
    if (!sitterId) {
      setPageState("missing");
      return;
    }
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setPageState("error");
      return;
    }

    setPageState("loading");
    setLoadError(null);

    const { profile: loaded, reviews: loadedReviews, error } = await fetchParentSitterProfile(
      supabase,
      sitterId
    );

    if (error) {
      console.warn("[parent/sitter profile] load error:", error);
      setLoadError(error);
    }

    if (!loaded) {
      setProfile(null);
      setReviews([]);
      setPageState("missing");
      return;
    }

    setProfile(loaded);
    setReviews(loadedReviews);
    setPageState("ready");
  }, [sitterId]);

  useEffect(() => {
    if (isLoading || !signedIn || effectiveRole !== "parent") return;
    void loadProfile();
  }, [isLoading, signedIn, effectiveRole, loadProfile]);

  const showWait = isLoading || (signedIn && effectiveRole === null);
  const showContent = !isLoading && signedIn && effectiveRole === "parent";

  if (showContent && pageState === "missing") {
    return (
      <main className="mx-auto min-h-[40vh] w-full max-w-md bg-[#FDFBF6] py-10 text-center text-sm text-slate-600" dir="rtl">
        {!sitterId ? "מזהה בייביסיטר לא תקין." : "לא נמצא פרופיל ציבורי לבייביסיטר זה."}
        {loadError ? <p className="mt-2 text-xs text-rose-700">{loadError}</p> : null}
        <div className="mt-4">
          <Link href="/parent/search" className="font-semibold text-emerald-800 underline">
            חזרה לחיפוש
          </Link>
        </div>
      </main>
    );
  }

  if (showContent && pageState === "error") {
    return (
      <main className="mx-auto min-h-[40vh] w-full max-w-md bg-[#FDFBF6] py-10 text-center text-sm text-slate-600" dir="rtl">
        Supabase לא זמין.
      </main>
    );
  }

  const displayName = profile ? resolveParentSitterDisplayName(profile) : "בייביסיטר";

  return (
    <main className="mx-auto min-h-[calc(100dvh-6rem)] w-full max-w-md space-y-5 bg-[#FDFBF6] py-3 pb-24" dir="rtl">
      <div className="flex items-center justify-between px-1">
        <Link
          href="/parent/search"
          className="inline-flex items-center gap-1 rounded-full border border-navy-header/20 bg-white px-3 py-1.5 text-xs font-semibold text-navy-header shadow-sm transition hover:bg-brand-cream"
        >
          <ArrowRight className="h-4 w-4" />
          חזרה לחיפוש
        </Link>
        <h1 className="text-lg font-bold text-navy-header">פרופיל</h1>
      </div>

      {showWait || !showContent ? (
        <p className="px-1 text-right text-sm text-slate-600">טוען…</p>
      ) : pageState === "loading" ? (
        <p className="px-1 text-right text-sm text-slate-600">טוען פרופיל…</p>
      ) : pageState === "ready" && profile ? (
        <>
          <section className="mx-1 rounded-3xl border border-navy-header/12 bg-white p-5 shadow-soft">
            <div className="flex flex-row-reverse items-start justify-between gap-3">
              <div className="min-w-0 flex-1 text-right">
                <h2 className="text-xl font-bold text-[#001F3F]">{displayName}</h2>
                {profile.nanny_serial ? (
                  <p className="mt-0.5 text-xs font-medium text-slate-500">{profile.nanny_serial}</p>
                ) : null}
                {profile.years_experience != null ? (
                  <p className="mt-1 text-sm text-slate-600">{profile.years_experience} שנות ניסיון</p>
                ) : null}
                {profile.hourly_rate_nis != null && profile.hourly_rate_nis > 0 ? (
                  <p className="mt-2 text-base font-semibold text-navy-800">
                    ₪{Number(profile.hourly_rate_nis).toFixed(0)} לשעה
                  </p>
                ) : (
                  <p className="mt-2 text-sm text-slate-500">מחיר לא צוין</p>
                )}
              </div>
              <div className="flex shrink-0 flex-col items-center gap-1 rounded-2xl bg-amber-50 px-3 py-2 ring-1 ring-amber-200/80">
                <Star className="h-6 w-6 fill-amber-400 text-amber-500" aria-hidden />
                <span className="text-center text-sm font-bold tabular-nums leading-tight text-amber-950">
                  {formatAvg(profile.avg_rating, profile.rating_count)}
                </span>
              </div>
            </div>

            {profile.bio ? (
              <div className="mt-4 border-t border-navy-header/10 pt-4">
                <p className="text-right text-sm font-semibold text-navy-header">אודות</p>
                <p className="mt-2 whitespace-pre-wrap text-right text-sm leading-relaxed text-slate-700">
                  {profile.bio}
                </p>
              </div>
            ) : null}

            {sitterId ? (
              <div className="mt-6 flex flex-col gap-2 sm:flex-row-reverse">
                <Link
                  href={`/parent/sitter/${encodeURIComponent(sitterId)}/calendar`}
                  className="inline-flex flex-row-reverse items-center justify-center gap-2 rounded-2xl bg-[#001F3F] px-4 py-3 text-sm font-semibold text-white shadow-md transition hover:brightness-110"
                >
                  <Calendar className="h-4 w-4" aria-hidden />
                  זמינות ויומן
                </Link>
              </div>
            ) : null}
          </section>

          <section className="mx-1 rounded-3xl border border-navy-header/12 bg-white p-5 shadow-soft">
            <h3 className="text-right text-base font-bold text-[#001F3F]">מה הורים כתבו</h3>
            <p className="mt-1 text-right text-xs text-slate-500">ביקורות אחרונות עם טקסט (ללא שמות — פרטיות).</p>

            {reviews.length === 0 ? (
              <p className="mt-4 text-right text-sm text-slate-600">עדיין אין הערות טקסט ציבוריות להצגה.</p>
            ) : (
              <ul className="mt-4 space-y-4">
                {reviews.map((r, i) => (
                  <li
                    key={`${r.created_at}-${i}`}
                    className="rounded-2xl border border-navy-header/8 bg-[#FDFBF6]/80 p-3 text-right"
                  >
                    <div className="flex flex-row-reverse items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-amber-800">
                        {r.rating} <span className="text-amber-500">★</span>
                      </span>
                      <time className="text-xs text-slate-500" dateTime={r.created_at}>
                        {new Date(r.created_at).toLocaleDateString("he-IL", { dateStyle: "medium" })}
                      </time>
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-slate-800">{r.comment}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </main>
  );
}
