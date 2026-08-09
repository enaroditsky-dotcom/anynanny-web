"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MainLayout } from "@components/layout/MainLayout";
import { createBooking } from "@/lib/bookings/create-booking";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  removeRealtimeChannel,
  subscribePostgresChanges
} from "@/lib/supabase/subscribe-postgres-changes";
import {
  Zap,
  ShieldCheck,
  Star,
  Clock,
  AlertCircle,
  RefreshCw,
  PauseCircle
} from "lucide-react";

export const dynamic = "force-dynamic";

interface RespondingSitter {
  id: string;
  name: string;
  rating: number;
  experience: number;
  hourlyRate: number | null;
}

function normalizePositiveNumber(value: unknown): number | null {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue) || numberValue <= 0) {
    return null;
  }

  return numberValue;
}

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function BroadcastRadarContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = getSupabaseBrowserClient();

  const alertId = searchParams.get("alertId");

  const rawCity = searchParams.get("city") || "חיפה";
  const city = decodeURIComponent(rawCity);

  const type = searchParams.get("type") || "sitter";

  const [responders, setResponders] = useState<RespondingSitter[]>([]);
  const [dots, setDots] = useState(".");
  const [isExpired, setIsExpired] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [selectingSitterId, setSelectingSitterId] = useState<string | null>(
    null
  );

  /*
   * Waiting dots animation.
   */
  useEffect(() => {
    if (isExpired || isPaused) {
      return;
    }

    const interval = window.setInterval(() => {
      setDots((previous) => (previous.length >= 3 ? "." : previous + "."));
    }, 500);

    return () => {
      window.clearInterval(interval);
    };
  }, [isExpired, isPaused]);

  /*
   * Listen for Broadcast status changes.
   */
  useEffect(() => {
    if (!alertId || alertId === "null" || !supabase) {
      return;
    }

    const alertChannel = subscribePostgresChanges(
      supabase,
      `alert_status-${alertId}`,
      {
        event: "UPDATE",
        table: "broadcast_alerts",
        filter: `id=eq.${alertId}`,
        handler: (payload) => {
          const next = payload.new as {
            status?: string;
          };

          if (next.status === "expired" || next.status === "cancelled") {
            setIsExpired(true);
          } else if (next.status === "paused") {
            setIsPaused(true);
          }
        }
      }
    );

    const checkCurrentStatus = async () => {
      const { data, error } = await supabase
        .from("broadcast_alerts")
        .select("status, created_at")
        .eq("id", alertId)
        .maybeSingle();

      if (error) {
        console.warn("[broadcast radar] status:", error.message);
        return;
      }

      if (data?.status === "expired" || data?.status === "cancelled") {
        setIsExpired(true);
      } else if (data?.status === "paused") {
        setIsPaused(true);
      }
    };

    void checkCurrentStatus();

    return () => {
      removeRealtimeChannel(supabase, alertChannel);
    };
  }, [alertId, supabase]);

  /*
   * Add a sitter that responded to the Broadcast.
   */
  const addSitterToResponders = async (sitterId: string) => {
    if (!sitterId || !supabase) {
      return;
    }

    try {
      const [
        { data: nameRow, error: nameError },
        { data: sitterProfile, error: sitterError }
      ] = await Promise.all([
        supabase
          .from("profiles")
          .select("first_name, last_name")
          .eq("id", sitterId)
          .maybeSingle(),

        supabase
          .from("sitter_profiles")
          .select("hourly_rate_nis, years_experience")
          .eq("id", sitterId)
          .maybeSingle()
      ]);

      if (nameError) {
        console.warn("[broadcast radar] profile:", nameError.message);
      }

      if (sitterError) {
        console.warn(
          "[broadcast radar] sitter profile:",
          sitterError.message
        );
      }

      const displayName =
        `${nameRow?.first_name ?? ""} ${nameRow?.last_name ?? ""}`.trim() ||
        "נני זמינה";

      const hourlyRate = normalizePositiveNumber(
        sitterProfile?.hourly_rate_nis
      );

      const experienceRaw = Number(sitterProfile?.years_experience);

      const experience =
        Number.isFinite(experienceRaw) && experienceRaw >= 0
          ? experienceRaw
          : 0;

      setResponders((previous) => {
        if (previous.some((responder) => responder.id === sitterId)) {
          return previous;
        }

        return [
          ...previous,
          {
            id: sitterId,
            name: displayName,
            rating: 5.0,
            experience,
            hourlyRate
          }
        ];
      });
    } catch (error) {
      console.error("Error loading sitter details:", error);
    }
  };

  /*
   * Initial response load + polling + Realtime.
   *
   * Realtime gives immediate feedback.
   * Polling provides a fallback if a realtime event is missed.
   */
  useEffect(() => {
    if (!alertId || alertId === "null" || isExpired || !supabase) {
      return;
    }

    let disposed = false;

    const fetchResponses = async () => {
      const { data: existingResponses, error: responsesError } =
        await supabase
          .from("broadcast_responses")
          .select("sitter_id")
          .eq("alert_id", alertId);

      if (disposed) {
        return;
      }

      if (responsesError) {
        console.warn(
          "[broadcast radar] responses:",
          responsesError.message
        );
        return;
      }

      if (!existingResponses || existingResponses.length === 0) {
        return;
      }

      for (const response of existingResponses) {
        if (disposed) {
          return;
        }

        if (response.sitter_id) {
          await addSitterToResponders(String(response.sitter_id));
        }
      }
    };

    void fetchResponses();

    const pollInterval = window.setInterval(() => {
      void fetchResponses();
    }, 1000);

    const channel = subscribePostgresChanges(
      supabase,
      `radar-${alertId}`,
      {
        event: "INSERT",
        table: "broadcast_responses",
        filter: `alert_id=eq.${alertId}`,
        handler: async (payload) => {
          const next = payload.new as {
            sitter_id?: string;
          };

          if (next?.sitter_id) {
            await addSitterToResponders(String(next.sitter_id));
          }
        }
      }
    );

    return () => {
      disposed = true;

      window.clearInterval(pollInterval);

      removeRealtimeChannel(supabase, channel);
    };
  }, [alertId, isExpired, supabase]);

  /*
   * Pause the Broadcast while keeping the current responses.
   */
  const handlePauseBroadcast = async () => {
    if (!alertId || isCancelling || !supabase) {
      return;
    }

    setIsCancelling(true);

    try {
      const { error } = await supabase
        .from("broadcast_alerts")
        .update({
          status: "paused"
        })
        .eq("id", alertId);

      if (error) {
        throw error;
      }

      setIsPaused(true);
    } catch (error) {
      console.error("[broadcast radar] pause:", error);

      alert("תקלה בעצירת החיפוש, נסה שנית.");
    } finally {
      setIsCancelling(false);
    }
  };

  /*
   * Parent selects a responding sitter.
   *
   * IMPORTANT:
   * AnyNanny NOW uses the same canonical createBooking()
   * pipeline as a regular booking.
   *
   * This ensures hourly_rate_nis is stored on the Booking
   * as a snapshot and is available later during settlement.
   */
  const handleSelectSitter = async (sitter: RespondingSitter) => {
    if (!alertId || alertId === "null" || !supabase) {
      alert("מזהה שידור חסר. לא ניתן להשלים את ההזמנה.");
      return;
    }

    if (selectingSitterId) {
      return;
    }

    if (
      sitter.hourlyRate == null ||
      !Number.isFinite(sitter.hourlyRate) ||
      sitter.hourlyRate <= 0
    ) {
      alert("לא נמצא תעריף תקין לבייביסיטר. לא ניתן ליצור את המשמרת.");
      return;
    }

    setSelectingSitterId(sitter.id);

    try {
      const {
        data: { user },
        error: authError
      } = await supabase.auth.getUser();

      if (authError || !user) {
        alert("שגיאת הזדהות. אנא התחבר מחדש.");
        return;
      }

      /*
       * AnyNanny NOW:
       * immediate booking starting now.
       *
       * We create an initial 3-hour booking window.
       * The actual settlement flow can later use the
       * real session duration.
       */
      const now = new Date();

      const endTime = new Date(
        now.getTime() + 3 * 60 * 60 * 1000
      );

      const bookingDate = localDateKey(now);
      const endBookingDate = localDateKey(endTime);

      /*
       * Create the Booking through the canonical booking creator.
       *
       * This stores:
       * - parent_id
       * - sitter_id
       * - dates/times
       * - pending status
       * - hourly_rate_nis snapshot
       */
      const bookingResult = await createBooking(
        supabase,
        user.id,
        {
          sitterId: sitter.id,
          bookingDate,
          endBookingDate,
          startIso: now.toISOString(),
          endIso: endTime.toISOString(),
          hourlyRateNis: sitter.hourlyRate
        }
      );

      if (bookingResult.error || !bookingResult.booking) {
        throw new Error(
          bookingResult.error ?? "יצירת המשמרת נכשלה."
        );
      }

      /*
       * Only after the Booking was created successfully
       * do we mark the Broadcast as filled.
       *
       * This prevents the Broadcast from disappearing
       * if Booking creation fails.
       */
      const { error: broadcastUpdateError } = await supabase
        .from("broadcast_alerts")
        .update({
          status: "filled"
        })
        .eq("id", alertId);

      if (broadcastUpdateError) {
        console.warn(
          "[broadcast radar] booking created but broadcast status update failed:",
          broadcastUpdateError.message
        );
      }

      /*
       * IMPORTANT:
       *
       * Do NOT create a row in the old "chats" table here.
       *
       * The previous implementation was producing:
       *
       * /rest/v1/chats -> 404
       *
       * Chat creation will be connected separately to
       * the current chat_rooms/chat_messages architecture.
       */

      alert(
        `מזל טוב! סגרת משמרת מיידית מול ${sitter.name}. המשמרת תואמה בהצלחה.`
      );

      router.push("/parent/dashboard");
    } catch (error) {
      console.error(
        "❌ Error completing broadcast booking flow:",
        error
      );

      const message =
        error instanceof Error
          ? error.message
          : "תקלה בתהליך סגירת המשמרת.";

      alert(message);
    } finally {
      setSelectingSitterId(null);
    }
  };

  const serviceLabel =
    type === "lactation"
      ? "יועצת הנקה"
      : type === "sleep"
        ? "יועצת שינה"
        : type === "doula"
          ? "דולה"
          : "בייביסיטר";

  return (
    <div
      dir="rtl"
      className="mx-auto max-w-md space-y-6 px-2 pt-4"
    >
      {isExpired && responders.length === 0 ? (
        <div className="animate-fadeIn space-y-4 rounded-3xl border border-slate-100 bg-white p-6 text-center shadow-soft">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-600 shadow-inner">
            <AlertCircle className="h-6 w-6" />
          </div>

          <div className="space-y-1">
            <h1 className="text-lg font-black text-navy-header">
              החיפוש הופסק או פג תוקף
            </h1>

            <p className="px-4 text-xs font-medium leading-relaxed text-slate-500">
              השידור המיידי לאזור {city} נעצר.
            </p>
          </div>

          <div className="flex flex-col gap-2 pt-2">
            <button
              type="button"
              onClick={() => router.push("/parent/search")}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-navy-header px-4 py-3 text-xs font-bold text-white shadow-sm transition hover:bg-[#001F3F]/90"
            >
              <RefreshCw className="h-3.5 w-3.5" />

              הפעילו שידור חדש
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="relative space-y-3 overflow-hidden rounded-3xl border border-[#FF8A8A]/20 bg-gradient-to-br from-[#FFF5F5] to-[#FFF0F0] p-5 text-center shadow-sm">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#FF8A8A] text-white shadow-md">
              <Zap className="h-6 w-6 fill-white" />
            </div>

            <div className="space-y-1">
              <h1 className="text-xl font-black text-navy-header">
                {isPaused
                  ? `החיפוש הושהה ב-${city}`
                  : `השידור המיידי הופעל ב-${city}`}
              </h1>

              <p className="text-xs font-medium text-slate-500">
                {isPaused
                  ? "התוצאות נשמרו לפניך - בחר את המטפלת המועדפת"
                  : `מחפשים עבורך ${serviceLabel} מעכשיו לעכשיו`}
              </p>
            </div>

            {!isPaused ? (
              <div className="flex items-center justify-center gap-1.5 pt-1 text-sm font-bold text-[#FF8A8A]">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#FF8A8A] opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-[#FF8A8A]" />
                </span>

                <span>
                  נניז בסביבה מקבלות התראה כעת
                  {dots}
                </span>
              </div>
            ) : null}

            <div className="pt-2">
              {!isPaused ? (
                <button
                  type="button"
                  disabled={isCancelling}
                  onClick={handlePauseBroadcast}
                  className="mx-auto flex items-center gap-1.5 rounded-xl border border-amber-200 bg-white/90 px-4 py-2 text-xs font-bold text-amber-700 shadow-xs transition hover:bg-amber-50 active:scale-[0.98] disabled:opacity-50"
                >
                  <PauseCircle className="h-3.5 w-3.5" />

                  <span>
                    {isCancelling
                      ? "עוצר חיפוש..."
                      : "עצור חיפוש ושמור תוצאות"}
                  </span>
                </button>
              ) : (
                <span className="inline-block rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-bold text-emerald-700">
                  ✓ החיפוש נעצר, הרשימה לפניך לבחירה
                </span>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <h2 className="mr-1 text-xs font-bold uppercase tracking-wider text-slate-400">
              מטפלות פנויות שהגיבו ({responders.length})
            </h2>

            {responders.length === 0 ? (
              <div className="space-y-2 rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center">
                <Clock
                  className="mx-auto h-8 w-8 animate-spin text-slate-300"
                  style={{
                    animationDuration: "3s"
                  }}
                />

                <p className="text-xs font-bold text-slate-600">
                  ממתינים לתגובה ראשונה...
                </p>

                <p className="mx-auto max-w-xs text-[10px] text-slate-400">
                  בדרך כלל לוקח לנניז בסביבה בין 1 ל-3 דקות לאשר את
                  הקריאה בטלפון שלהן.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {responders.map((sitter) => {
                  const selecting =
                    selectingSitterId === sitter.id;

                  return (
                    <div
                      key={sitter.id}
                      className="animate-fadeIn flex items-center justify-between rounded-2xl border border-slate-100 bg-white p-4 shadow-soft"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-purple-100 bg-purple-50 text-sm font-black text-purple-700">
                          {sitter.name[0] ?? "נ"}
                        </div>

                        <div className="space-y-0.5 text-right">
                          <h3 className="flex items-center gap-1 text-sm font-bold text-slate-800">
                            {sitter.name}

                            <span className="inline-flex items-center gap-0.5 rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
                              <Star className="h-2.5 w-2.5 fill-current text-amber-500" />

                              {sitter.rating}
                            </span>
                          </h3>

                          <p className="text-[11px] font-medium text-slate-500">
                            {sitter.experience} שנות ניסיון
                            {" • "}

                            {sitter.hourlyRate != null
                              ? `₪${sitter.hourlyRate}/שעה`
                              : "תעריף לא זמין"}
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={
                          selecting ||
                          selectingSitterId !== null ||
                          sitter.hourlyRate == null
                        }
                        onClick={() =>
                          void handleSelectSitter(sitter)
                        }
                        className="rounded-xl bg-navy-header px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-[#001F3F]/90 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {selecting
                          ? "סוגר..."
                          : "בחירה וסגירה"}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex items-start gap-2.5 rounded-xl border border-slate-100 bg-slate-50 p-3 text-right">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />

            <div className="space-y-0.5">
              <h4 className="text-[11px] font-bold text-slate-700">
                הגנה מלאה על המשמרת
              </h4>

              <p className="text-[10px] leading-normal text-slate-500">
                כל הנניז הרשומות בפלטפורמה עברו אימות פרופיל קשיח
                ובדיקת רקע.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function BroadcastRadarPage() {
  return (
    <MainLayout>
      <Suspense
        fallback={
          <div className="py-12 text-center text-xs font-bold text-slate-400">
            טוען נתוני חיפוש...
          </div>
        }
      >
        <BroadcastRadarContent />
      </Suspense>
    </MainLayout>
  );
}