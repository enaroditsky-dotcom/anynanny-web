"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Calendar, MessageCircle, Star } from "lucide-react";
import { BookShiftModal } from "@/components/parent/book-shift-modal";
import { getOrCreateChatRoom } from "@/lib/chat/parent-chat";
import { useAuth } from "@/components/auth-provider";
import {
  formatTransportationMode,
  normalizeSitterProfilePublic,
  parseRouteSitterId,
  unwrapRpcProfilePayload
} from "@/lib/sitter/fetch-parent-sitter-profile";
import type { PublicSitterReview, SitterProfilePublic } from "@/lib/sitter/sitter-profile";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

function formatAvg(avg: number | null | undefined, count: number | null | undefined): string {
  const c = count ?? 0;
  if (c <= 0 || avg == null) return "אין דירוג עדיין";
  return `${Number(avg).toFixed(1)} ★ (${c} ביקורות)`;
}

function parseReviews(raw: unknown): PublicSitterReview[] {
  if (raw == null) return [];
  let list: unknown = raw;
  if (typeof raw === "string") {
    try {
      list = JSON.parse(raw) as unknown;
    } catch {
      return [];
    }
  }
  if (!Array.isArray(list)) return [];
  return list.filter((x): x is PublicSitterReview => x != null && typeof x === "object");
}

export default function ParentSitterProfilePage() {
  const params = useParams();
  const sitterId = parseRouteSitterId(params?.sitterId);

  const router = useRouter();
  const { isLoading, signedIn, effectiveRole } = useAuth();
  const [profile, setProfile] = useState<SitterProfilePublic | null>(null);
  const [reviews, setReviews] = useState<PublicSitterReview[]>([]);
  const [pageState, setPageState] = useState<"loading" | "missing" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [bookModalOpen, setBookModalOpen] = useState(false);
  const [bookingToast, setBookingToast] = useState<string | null>(null);
  const [messageBusy, setMessageBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

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

    const { data, error: profErr } = await supabase.rpc("get_sitter_profile_public", {
      target_id: sitterId
    });

    console.log("Fetched profile data:", data);

    if (profErr) {
      console.warn("[parent/sitter profile] RPC Error details:", profErr.message, profErr.details, profErr.hint);
      setLoadError(profErr.message || "שגיאה בביצוע החיפוש");
      setProfile(null);
      setReviews([]);
      setPageState("missing");
      return;
    }

    const rawRow = Array.isArray(data) ? data[0] : data;
    const payload = unwrapRpcProfilePayload(rawRow) ?? unwrapRpcProfilePayload(data);

    if (!payload) {
      setProfile(null);
      setReviews([]);
      setPageState("missing");
      return;
    }

    const normalized = normalizeSitterProfilePublic(payload, sitterId);
    setProfile(normalized);

    const { data: reviewsRaw, error: revErr } = await supabase.rpc("get_sitter_public_reviews", {
      p_sitter_id: sitterId,
      p_limit: 10
    });

    if (revErr) {
      console.warn("[parent/sitter profile] reviews:", revErr.message);
      setReviews([]);
    } else {
      setReviews(parseReviews(reviewsRaw));
    }

    setPageState("ready");
  }, [sitterId]);

  useEffect(() => {
    if (isLoading || !signedIn || effectiveRole !== "parent") return;
    void loadProfile();
  }, [isLoading, signedIn, effectiveRole, loadProfile]);

  const showWait = isLoading || (signedIn && effectiveRole === null);
  const showContent = !isLoading && signedIn && effectiveRole === "parent";
  const isReady = showContent && pageState === "ready" && profile != null;
  const profileId = profile?.id ?? sitterId ?? "";

  const resolveSitterId = useCallback(() => profile?.id ?? sitterId ?? null, [profile?.id, sitterId]);

  const handleSendMessage = useCallback(async () => {
    const id = resolveSitterId();
    if (!id) return;

    setActionError(null);
    setMessageBusy(true);

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setActionError("Supabase לא זמין");
      setMessageBusy(false);
      return;
    }

    const { roomId, error } = await getOrCreateChatRoom(supabase, id);
    setMessageBusy(false);

    if (error || !roomId) {
      setActionError(error ?? "לא ניתן לפתוח שיחה");
      return;
    }

    router.push(`/parent/chat/${encodeURIComponent(roomId)}`);
  }, [resolveSitterId, router]);

  const handleBookShift = useCallback(() => {
    setActionError(null);
    setBookModalOpen(true);
  }, []);

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

  const years = profile?.years_of_experience ?? profile?.years_experience;
  const transportLabel = profile
    ? formatTransportationMode(profile.transportation_mode, profile.has_car)
    : null;

  return (
    <main className="mx-auto min-h-[calc(100dvh-6rem)] w-full max-w-md space-y-5 bg-[#FDFBF6] py-3 pb-24" dir="rtl">
      {bookingToast ? (
        <div
          className="fixed bottom-24 left-1/2 z-[140] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-center text-sm font-bold text-emerald-950 shadow-lg"
          role="status"
          aria-live="polite"
        >
          {bookingToast}
        </div>
      ) : null}
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
      ) : isReady ? (
        <>
          <section className="mx-1 rounded-3xl border border-navy-header/12 bg-white p-5 shadow-soft">
            <div className="flex flex-row-reverse items-start justify-between gap-3">
              <div className="min-w-0 flex-1 text-right">
                <h2 className="text-xl font-bold text-[#001F3F]">
                  {profile.full_name || "בייביסיטר"}
                </h2>
                {profile.nanny_serial ? (
                  <p className="mt-0.5 text-xs font-medium text-slate-500">{profile.nanny_serial}</p>
                ) : null}
                {years != null ? (
                  <p className="mt-1 text-sm text-slate-600">{years} שנות ניסיון</p>
                ) : null}
                {transportLabel ? (
                  <p className="mt-1 text-sm text-violet-800">דרך הגעה: {transportLabel}</p>
                ) : null}
                <p className="mt-2 text-base font-semibold text-navy-800">
                  {profile.hourly_rate_nis
                    ? `${profile.hourly_rate_nis} ₪ / שעה`
                    : "מחיר לא צוין"}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-center gap-1 rounded-2xl bg-amber-50 px-3 py-2 ring-1 ring-amber-200/80">
                <Star className="h-6 w-6 fill-amber-400 text-amber-500" aria-hidden />
                <span className="text-center text-sm font-bold tabular-nums leading-tight text-amber-950">
                  {formatAvg(profile.avg_rating, profile.rating_count)}
                </span>
              </div>
            </div>

            <div className="mt-4 border-t border-navy-header/10 pt-4">
              <p className="text-right text-sm font-semibold text-navy-header">אודות</p>
              <p className="mt-2 whitespace-pre-wrap text-right text-sm leading-relaxed text-slate-700">
                {profile.bio || "אין פירוט זמין"}
              </p>
            </div>

            {profileId ? (
              <div className="mt-6 space-y-2">
                {actionError ? (
                  <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-right text-xs text-rose-900">
                    {actionError}
                  </p>
                ) : null}
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => void handleSendMessage()}
                    disabled={messageBusy}
                    className="inline-flex flex-row-reverse items-center justify-center gap-2 rounded-2xl border-2 border-[#001F3F]/20 bg-white px-4 py-3.5 text-sm font-semibold text-[#001F3F] shadow-sm transition hover:bg-brand-cream focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#001F3F] disabled:opacity-60 active:scale-[0.99]"
                  >
                    <MessageCircle className="h-5 w-5 shrink-0" aria-hidden />
                    {messageBusy ? "פותחים שיחה…" : "שלח הודעה"}
                  </button>
                  <button
                    type="button"
                    onClick={handleBookShift}
                    className="inline-flex flex-row-reverse items-center justify-center gap-2 rounded-2xl bg-[#001F3F] px-4 py-3.5 text-sm font-bold text-white shadow-soft transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#001F3F] active:scale-[0.99]"
                  >
                    <Calendar className="h-5 w-5 shrink-0" aria-hidden />
                    תיאום משמרת
                  </button>
                </div>
              </div>
            ) : null}

            {profile && profileId ? (
              <BookShiftModal
                open={bookModalOpen}
                sitterId={profileId}
                sitterName={profile.full_name || "בייביסיטר"}
                onClose={() => setBookModalOpen(false)}
                onSuccess={() => {
                  setBookingToast("הבקשה נשלחה בהצלחה לבייביסיטר!");
                  window.setTimeout(() => setBookingToast(null), 4000);
                }}
              />
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
