"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createBooking } from "@/lib/bookings/create-booking";
import { BroadcastPanelControls } from "@/components/parent/broadcast-panel-controls";
import {
  BroadcastDeclineNoticeUnit,
  type BroadcastDeclineNoticeState,
  type BroadcastDeclineSitterSnapshot
} from "@/components/parent/broadcast-decline-notice";
import { parentSitterProfilePathFromBroadcast } from "@/components/sitter/public-sitter-search-card";
import { rememberActiveBroadcast } from "@/lib/broadcast/broadcast-active-snapshot";
import { setBroadcastMinimized } from "@/lib/broadcast/broadcast-minimize-preference";
import { requestBroadcastStatusChange } from "@/lib/broadcast/broadcast-status-change";
import {
  broadcastRadarHref,
  fetchActiveBroadcastForParent,
  fetchBroadcastRequestStatuses,
  filterAvailableBroadcastSitterIds,
  findApprovedBroadcastLinkedBooking,
  formatBroadcastElapsed
} from "@/lib/broadcast/parent-active-broadcast";
import { fetchUserRatingSummary } from "@/lib/ratings/fetch-user-rating-summary";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  removeRealtimeChannel,
  subscribePostgresChanges
} from "@/lib/supabase/subscribe-postgres-changes";
import {
  Zap,
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
  rating: number | null;
  experience: number;
  hourlyRate: number | null;
  avatarUrl: string | null;
}

type ResponderIdentity = {
  name: string;
  avatarUrl: string | null;
  rating: number | null;
};

const BROADCAST_DECLINE_TITLE = "דחתה את הבקשה";
const BROADCAST_DECLINE_SECONDARY =
  "הבייביסיטר הוסרה מרשימת הזמינות לשידור הזה.";

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

function BroadcastSitterAvatar({
  name,
  avatarUrl,
  sizeClass = "h-11 w-11",
  textClass = "text-sm"
}: {
  name: string;
  avatarUrl: string | null;
  sizeClass?: string;
  textClass?: string;
}) {
  const initial = name.trim().charAt(0) || "נ";

  return (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-purple-100 bg-purple-50 font-black text-purple-700 ${sizeClass} ${textClass}`}
    >
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={name}
          className="h-full w-full object-cover"
        />
      ) : (
        initial
      )}
    </div>
  );
}

function BroadcastRadarContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = getSupabaseBrowserClient();

  const alertIdParam = searchParams.get("alertId");
  const [alertId, setAlertId] = useState<string | null>(alertIdParam);

  const rawCity = searchParams.get("city") || "חיפה";
  const [city, setCity] = useState(decodeURIComponent(rawCity));

  const type = searchParams.get("type") || "sitter";

  const [responders, setResponders] = useState<RespondingSitter[]>([]);
  const [dots, setDots] = useState(".");
  const [isExpired, setIsExpired] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isFilled, setIsFilled] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [selectingSitterId, setSelectingSitterId] = useState<string | null>(
    null
  );
  const [requestedSitterIds, setRequestedSitterIds] = useState<string[]>([]);
  const [declinedSitterIds, setDeclinedSitterIds] = useState<string[]>([]);
  const [declineNotice, setDeclineNotice] =
    useState<BroadcastDeclineNoticeState | null>(null);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [parentId, setParentId] = useState<string | null>(null);
  const handledRejectionBookingIdsRef = useRef<Set<string>>(new Set());
  const rejectionMinimizeLockRef = useRef(false);
  const declinedSitterIdsRef = useRef<string[]>([]);
  const requestedSitterIdsRef = useRef<string[]>([]);
  const respondersRef = useRef<RespondingSitter[]>([]);
  const responderIdentityRef = useRef<Map<string, ResponderIdentity>>(new Map());
  const notifiedDeclineKeysRef = useRef<Set<string>>(new Set());
  const prevAlertIdParamRef = useRef<string | null>(alertIdParam);
  requestedSitterIdsRef.current = requestedSitterIds;
  respondersRef.current = responders;

  const captureResponderIdentity = (
    sitterId: string
  ): BroadcastDeclineSitterSnapshot => {
    const stored = responderIdentityRef.current.get(sitterId);
    const fromList = respondersRef.current.find((sitter) => sitter.id === sitterId);
    const name =
      stored?.name?.trim() || fromList?.name?.trim() || "בייביסיטר";
    return {
      id: sitterId,
      name,
      avatarUrl: stored?.avatarUrl ?? fromList?.avatarUrl ?? null,
      rating: stored?.rating ?? fromList?.rating ?? null
    };
  };

  const visibleResponderIds = filterAvailableBroadcastSitterIds(
    responders.map((sitter) => sitter.id),
    declinedSitterIds
  );
  const visibleResponderList = responders.filter((sitter) =>
    visibleResponderIds.includes(sitter.id)
  );

  const replaceDeclinedSitterIds = (ids: string[]) => {
    const unique = [
      ...new Set([
        ...declinedSitterIdsRef.current,
        ...ids.map((id) => id.trim()).filter(Boolean)
      ])
    ];
    declinedSitterIdsRef.current = unique;
    setDeclinedSitterIds(unique);
    if (unique.length === 0) return;
    const declined = new Set(unique);
    setResponders((previous) =>
      previous.filter((sitter) => !declined.has(sitter.id))
    );
  };

  const showDeclineNotice = (
    sitterId: string,
    bookingId?: string,
    snapshot?: BroadcastDeclineSitterSnapshot
  ) => {
    const id = sitterId.trim();
    if (!id) return;

    const sitterKey = `sitter:${id}`;
    if (notifiedDeclineKeysRef.current.has(sitterKey)) return;
    if (bookingId && notifiedDeclineKeysRef.current.has(bookingId)) return;

    notifiedDeclineKeysRef.current.add(sitterKey);
    if (bookingId) {
      notifiedDeclineKeysRef.current.add(bookingId);
    }

    const source = snapshot ?? captureResponderIdentity(id);
    const sitter: BroadcastDeclineSitterSnapshot = {
      id: source.id,
      name: source.name,
      avatarUrl: source.avatarUrl,
      rating: source.rating
    };
    setDeclineNotice({
      message: `${sitter.name} ${BROADCAST_DECLINE_TITLE}`,
      secondary: BROADCAST_DECLINE_SECONDARY,
      sitter
    });
  };

  const addDeclinedSitterId = (sitterId: string, notify: boolean) => {
    const id = sitterId.trim();
    if (!id) return;
    const snapshot = captureResponderIdentity(id);
    const alreadyTracked = declinedSitterIdsRef.current.includes(id);
    if (!alreadyTracked) {
      const next = [...declinedSitterIdsRef.current, id];
      declinedSitterIdsRef.current = next;
      setDeclinedSitterIds(next);
    }
    setResponders((previous) =>
      previous.filter((sitter) => sitter.id !== id)
    );
    if (notify && !alreadyTracked) {
      showDeclineNotice(id, undefined, snapshot);
    }
  };

  useEffect(() => {
    setAlertId(alertIdParam);
    const previousAlertId = prevAlertIdParamRef.current;
    prevAlertIdParamRef.current = alertIdParam;
    if (previousAlertId === alertIdParam) {
      return;
    }

    declinedSitterIdsRef.current = [];
    setDeclinedSitterIds([]);
    setResponders([]);
    handledRejectionBookingIdsRef.current = new Set();
    rejectionMinimizeLockRef.current = false;
    responderIdentityRef.current = new Map();
    notifiedDeclineKeysRef.current = new Set();
    if (previousAlertId) {
      setDeclineNotice(null);
    }
  }, [alertIdParam]);

  useEffect(() => {
    if (isExpired || isPaused || isFilled) return;
    const tick = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(tick);
  }, [isExpired, isPaused, isFilled]);

  /*
   * Waiting dots animation.
   */
  useEffect(() => {
    if (isExpired || isPaused || isFilled) {
      return;
    }

    const interval = window.setInterval(() => {
      setDots((previous) => (previous.length >= 3 ? "." : previous + "."));
    }, 500);

    return () => {
      window.clearInterval(interval);
    };
  }, [isExpired, isPaused, isFilled]);

  /*
   * Restore the parent's existing active broadcast when the URL is incomplete,
   * then listen for status changes. Does not create a new broadcast.
   */
  useEffect(() => {
    if (!supabase) {
      return;
    }

    let disposed = false;

    const applyStatus = (status: string | undefined) => {
      if (status === "expired" || status === "cancelled") {
        setIsExpired(true);
      } else if (status === "paused") {
        setIsPaused(true);
      } else if (status === "filled") {
        setIsFilled(true);
      }
    };

    const hydrateFromActive = async () => {
      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (!user || disposed) return;
      setParentId(user.id);

      const missingId = !alertId || alertId === "null" || alertId === "simulation-id";
      if (missingId) {
        const { broadcast } = await fetchActiveBroadcastForParent(supabase, user.id);
        if (disposed) return;
        if (broadcast) {
          setAlertId(broadcast.id);
          setCity(broadcast.city);
          setStartedAt(broadcast.created_at);
          router.replace(broadcastRadarHref(broadcast));
          return;
        }
      }

      if (!alertId || alertId === "null") {
        return;
      }

      const { data, error } = await supabase
        .from("broadcast_alerts")
        .select("id, parent_id, city, service_type, status, created_at")
        .eq("id", alertId)
        .maybeSingle();

      if (error) {
        console.warn("[broadcast radar] status:", error.message);
        return;
      }

      if (!data) return;

      if (typeof data.city === "string" && data.city.trim()) {
        setCity(data.city);
      }
      if (typeof data.created_at === "string") {
        setStartedAt(data.created_at);
      }
      applyStatus(data.status);

      if (data.status === "cancelled") {
        router.replace("/parent/dashboard");
        return;
      }

      if (
        (data.status === "active" || data.status === "paused") &&
        data.created_at
      ) {
        if (data.status === "active") {
          const confirmed = await findApprovedBroadcastLinkedBooking(
            supabase,
            user.id,
            alertId,
            String(data.created_at)
          );
          if (disposed) return;
          if (confirmed) {
            const filled = await requestBroadcastStatusChange("fill", alertId);
            if (filled.error) {
              console.warn("[broadcast radar] fill:", filled.error);
            }
            if (!disposed && filled.ok) {
              setIsFilled(true);
            }
            return;
          }
        }

        const { pendingIds, rejectedIds } = await fetchBroadcastRequestStatuses(
          supabase,
          user.id,
          alertId,
          String(data.created_at)
        );
        if (!disposed) {
          setRequestedSitterIds(pendingIds);
          replaceDeclinedSitterIds(rejectedIds);
        }
      }
    };

    void hydrateFromActive();

    if (!alertId || alertId === "null") {
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
            city?: string;
            created_at?: string;
          };

          if (typeof next.city === "string" && next.city.trim()) {
            setCity(next.city);
          }
          if (typeof next.created_at === "string") {
            setStartedAt(next.created_at);
          }
          applyStatus(next.status);
          if (next.status === "cancelled") {
            router.replace("/parent/dashboard");
          }
        }
      }
    );

    return () => {
      disposed = true;
      removeRealtimeChannel(supabase, alertChannel);
    };
  }, [alertId, router, supabase]);

  /*
   * Add a sitter that responded to the Broadcast.
   */
  const addSitterToResponders = async (sitterId: string) => {
    if (!sitterId || !supabase) {
      return;
    }

    if (declinedSitterIdsRef.current.includes(sitterId)) {
      return;
    }

    try {
      const [
        { data: nameRow, error: nameError },
        { data: sitterProfile, error: sitterError },
        ratingSummary
      ] = await Promise.all([
        supabase
          .from("profiles")
          .select("first_name, last_name, avatar_url")
          .eq("id", sitterId)
          .maybeSingle(),

        supabase
          .from("sitter_profiles")
          .select("hourly_rate_nis, years_experience")
          .eq("id", sitterId)
          .maybeSingle(),

        fetchUserRatingSummary(supabase, sitterId)
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

      const avatarRaw =
        nameRow && typeof (nameRow as { avatar_url?: unknown }).avatar_url === "string"
          ? String((nameRow as { avatar_url: string }).avatar_url).trim()
          : "";
      const avatarUrl = avatarRaw.length > 0 ? avatarRaw : null;

      const hourlyRate = normalizePositiveNumber(
        sitterProfile?.hourly_rate_nis
      );

      const experienceRaw = Number(sitterProfile?.years_experience);

      const experience =
        Number.isFinite(experienceRaw) && experienceRaw >= 0
          ? experienceRaw
          : 0;

      const rating =
        ratingSummary.count > 0 && ratingSummary.average > 0
          ? ratingSummary.average
          : null;

      responderIdentityRef.current.set(sitterId, {
        name: displayName,
        avatarUrl,
        rating
      });

      if (declinedSitterIdsRef.current.includes(sitterId)) {
        return;
      }

      setResponders((previous) => {
        if (declinedSitterIdsRef.current.includes(sitterId)) {
          return previous.filter((sitter) => sitter.id !== sitterId);
        }
        if (previous.some((responder) => responder.id === sitterId)) {
          return previous;
        }

        return [
          ...previous,
          {
            id: sitterId,
            name: displayName,
            rating,
            experience,
            hourlyRate,
            avatarUrl
          }
        ];
      });
    } catch (error) {
      console.error("Error loading sitter details:", error);
    }
  };

  /*
   * Sitter ACCEPT/CONFIRM is bookings.status → approved
   * (updateBookingStatus). Parent select only creates pending.
   *
   * Sitter REJECT → booking rejected, Broadcast stays active,
   * auto-minimize to dashboard so the standard rejection card shows.
   */
  useEffect(() => {
    if (!alertId || alertId === "null" || !parentId || !startedAt || !supabase) {
      return;
    }
    if (isExpired || isFilled) {
      return;
    }

    let disposed = false;

    const warmAndMinimizeForRejection = (bookingId: string) => {
      if (!bookingId || disposed) return;
      if (handledRejectionBookingIdsRef.current.has(bookingId)) return;
      if (rejectionMinimizeLockRef.current) return;

      handledRejectionBookingIdsRef.current.add(bookingId);
      rejectionMinimizeLockRef.current = true;

      rememberActiveBroadcast({
        id: alertId,
        parent_id: parentId,
        city,
        service_type: type,
        status: "active",
        created_at: startedAt
      });
      setBroadcastMinimized(true);
      router.replace("/parent/dashboard");
    };

    const checkConfirmation = async () => {
      const confirmed = await findApprovedBroadcastLinkedBooking(
        supabase,
        parentId,
        alertId,
        startedAt
      );
      if (disposed || !confirmed) return;
      const filled = await requestBroadcastStatusChange("fill", alertId);
      if (disposed) return;
      if (!filled.ok) {
        console.warn("[broadcast radar] fill:", filled.error);
        return;
      }
      setIsFilled(true);
    };

    const syncRequestStatuses = async (mode: "seed" | "watch" = "watch") => {
      const { pendingIds, rejectedIds, rejectedBookingIds } = await fetchBroadcastRequestStatuses(
        supabase,
        parentId,
        alertId,
        startedAt
      );
      if (disposed) return;
      const declinedSnapshots = new Map(
        rejectedIds.map((id) => [id, captureResponderIdentity(id)] as const)
      );
      setRequestedSitterIds(pendingIds);
      replaceDeclinedSitterIds(rejectedIds);

      if (mode === "seed") {
        for (const bookingId of rejectedBookingIds) {
          handledRejectionBookingIdsRef.current.add(bookingId);
        }
        for (const sitterId of rejectedIds) {
          notifiedDeclineKeysRef.current.add(`sitter:${sitterId}`);
        }
        return;
      }

      for (const bookingId of rejectedBookingIds) {
        if (handledRejectionBookingIdsRef.current.has(bookingId)) continue;
        const noticeSitterId = rejectedIds.find(
          (id) => !notifiedDeclineKeysRef.current.has(`sitter:${id}`)
        );
        if (noticeSitterId) {
          showDeclineNotice(
            noticeSitterId,
            bookingId,
            declinedSnapshots.get(noticeSitterId)
          );
        }
        if (!isPaused) {
          warmAndMinimizeForRejection(bookingId);
        } else {
          handledRejectionBookingIdsRef.current.add(bookingId);
        }
        break;
      }
    };

    if (!isPaused) {
      void checkConfirmation();
    }
    void syncRequestStatuses("seed");

    const bookingChannel = subscribePostgresChanges(
      supabase,
      `radar-bookings-${alertId}`,
      {
        event: "UPDATE",
        table: "bookings",
        filter: `parent_id=eq.${parentId}`,
        handler: (payload) => {
          const next = payload.new as {
            id?: string;
            status?: string;
            sitter_id?: string;
          };
          if (next.status === "rejected") {
            const bookingId = String(next.id ?? "").trim();
            const sitterId = String(next.sitter_id ?? "").trim();
            if (sitterId) {
              const requestedOnThisAlert =
                requestedSitterIdsRef.current.includes(sitterId);
              setRequestedSitterIds((previous) =>
                previous.filter((id) => id !== sitterId)
              );
              if (requestedOnThisAlert) {
                addDeclinedSitterId(sitterId, true);
              }
            }
            void syncRequestStatuses("watch");
            if (bookingId && !isPaused) {
              warmAndMinimizeForRejection(bookingId);
            }
            return;
          }
          if (next.status === "pending" && next.sitter_id) {
            const sitterId = String(next.sitter_id);
            setRequestedSitterIds((previous) =>
              previous.includes(sitterId) ? previous : [...previous, sitterId]
            );
            return;
          }
          if (
            next.status === "approved" ||
            next.status === "sitter_started" ||
            next.status === "parent_started" ||
            next.status === "sitter_ended" ||
            next.status === "completed"
          ) {
            if (!isPaused) {
              void checkConfirmation();
            }
          }
        }
      }
    );

    const poll = window.setInterval(() => {
      if (!isPaused) {
        void checkConfirmation();
      }
      void syncRequestStatuses("watch");
    }, 2500);

    return () => {
      disposed = true;
      window.clearInterval(poll);
      removeRealtimeChannel(supabase, bookingChannel);
    };
  }, [
    alertId,
    parentId,
    startedAt,
    isExpired,
    isPaused,
    isFilled,
    supabase,
    city,
    type,
    router
  ]);

  useEffect(() => {
    if (!isFilled) return;
    setBroadcastMinimized(false);
    router.replace("/parent/dashboard");
  }, [isFilled, router]);

  /*
   * Initial response load + polling + Realtime.
   *
   * Realtime gives immediate feedback.
   * Polling provides a fallback if a realtime event is missed.
   */
  useEffect(() => {
    if (!alertId || alertId === "null" || isExpired || isFilled || !supabase) {
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

      const declined = new Set(declinedSitterIdsRef.current);

      setResponders((previous) =>
        previous.filter((sitter) => !declined.has(sitter.id))
      );

      for (const response of existingResponses) {
        if (disposed) {
          return;
        }

        const sitterId = response.sitter_id
          ? String(response.sitter_id).trim()
          : "";

        if (!sitterId || declined.has(sitterId)) {
          continue;
        }

        await addSitterToResponders(sitterId);
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
          const sitterId = next?.sitter_id
            ? String(next.sitter_id).trim()
            : "";

          if (!sitterId || declinedSitterIdsRef.current.includes(sitterId)) {
            return;
          }

          await addSitterToResponders(sitterId);
        }
      }
    );

    return () => {
      disposed = true;

      window.clearInterval(pollInterval);

      removeRealtimeChannel(supabase, channel);
    };
  }, [alertId, isExpired, isFilled, supabase]);

  /*
   * Pause the Broadcast while keeping the current responses.
   * Minimize must never call this — pause is an explicit parent stop.
   */
  const handlePauseBroadcast = async () => {
    if (!alertId || alertId === "null" || isCancelling) {
      return;
    }

    setIsCancelling(true);

    try {
      const result = await requestBroadcastStatusChange("pause", alertId);

      if (!result.ok) {
        console.error("[broadcast radar] pause:", {
          alertId,
          error: result.error,
          row: result.row
        });
        throw new Error(result.error ?? "pause failed");
      }

      setBroadcastMinimized(false);
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

    if (selectingSitterId || requestedSitterIds.includes(sitter.id)) {
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
       * Parent selection only creates a pending booking.
       * The broadcast stays active until the sitter approves
       * (bookings.status = approved) or the parent stops the search.
       */
      setRequestedSitterIds((previous) =>
        previous.includes(sitter.id) ? previous : [...previous, sitter.id]
      );

      alert(
        `הבקשה נשלחה אל ${sitter.name}. החיפוש ממשיך עד שהנני תאשר את המשמרת.`
      );
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

  /** UI-only: keep DB status active; show compact dock on dashboard. */
  const handleMinimize = () => {
    setBroadcastMinimized(true);
    if (alertId && parentId && startedAt) {
      rememberActiveBroadcast({
        id: alertId,
        parent_id: parentId,
        city,
        service_type: type,
        status: "active",
        created_at: startedAt
      });
    }
    router.replace("/parent/dashboard");
  };

  const handleClosePaused = async () => {
    if (!isPaused || !alertId || alertId === "null" || isClosing) {
      return;
    }

    setIsClosing(true);
    try {
      const result = await requestBroadcastStatusChange("cancel", alertId);
      if (!result.ok) {
        console.error("[broadcast radar] close paused:", {
          alertId,
          error: result.error
        });
        throw new Error(result.error ?? "cancel failed");
      }

      setBroadcastMinimized(false);
      router.replace("/parent/dashboard");
    } catch (error) {
      console.error("[broadcast radar] close paused:", error);
      alert("תקלה בסגירת השידור, נסה שנית.");
    } finally {
      setIsClosing(false);
    }
  };

  const elapsedLabel = startedAt
    ? formatBroadcastElapsed(startedAt, nowMs)
    : null;

  const serviceLabel =
    type === "lactation"
      ? "יועצת הנקה"
      : type === "sleep"
        ? "יועצת שינה"
        : type === "doula"
          ? "דולה"
          : "בייביסיטר";

  if (isFilled) {
    return (
      <div className="py-12 text-center text-xs font-bold text-slate-400">
        המשמרת אושרה. החיפוש הסתיים.
      </div>
    );
  }

  return (
    <div
      dir="rtl"
      className="mx-auto max-w-md space-y-6 px-2 pt-4"
    >
      {isExpired && visibleResponderList.length === 0 ? (
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
            <BroadcastPanelControls
              onMinimize={handleMinimize}
              onClose={isPaused ? () => void handleClosePaused() : undefined}
              closeDisabled={isClosing}
            />

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
                  : `מחפשים נני · ${serviceLabel} מעכשיו לעכשיו`}
              </p>
            </div>

            {!isPaused && elapsedLabel ? (
              <p className="text-xs font-bold tabular-nums text-[#FF8A8A]">
                ⏱ {elapsedLabel}
              </p>
            ) : null}

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
              מטפלות פנויות שהגיבו ({visibleResponderList.length})
            </h2>

            {visibleResponderList.length === 0 ? (
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
                {visibleResponderList.map((sitter) => {
                  const selecting =
                    selectingSitterId === sitter.id;
                  const requested = requestedSitterIds.includes(sitter.id);

                  return (
                    <div
                      key={sitter.id}
                      className="animate-fadeIn flex items-center justify-between rounded-2xl border border-slate-100 bg-white p-4 shadow-soft"
                    >
                      <div className="flex items-center gap-3">
                        <BroadcastSitterAvatar
                          name={sitter.name}
                          avatarUrl={sitter.avatarUrl}
                        />

                        <div className="space-y-0.5 text-right">
                          <h3 className="flex items-center gap-1 text-sm font-bold text-slate-800">
                            {sitter.name}

                            {sitter.rating != null ? (
                              <span className="inline-flex items-center gap-0.5 rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
                                <Star className="h-2.5 w-2.5 fill-current text-amber-500" />

                                {sitter.rating.toFixed(1)}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-0.5 rounded-md bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                                <Star className="h-2.5 w-2.5 text-slate-300" />
                                טרם דורג
                              </span>
                            )}
                          </h3>

                          <p className="text-[11px] font-medium text-slate-500">
                            {sitter.experience} שנות ניסיון
                            {" • "}

                            {sitter.hourlyRate != null
                              ? `₪${sitter.hourlyRate}/שעה`
                              : "תעריף לא זמין"}
                          </p>

                          <Link
                            href={
                              alertId
                                ? parentSitterProfilePathFromBroadcast(sitter.id, {
                                    alertId,
                                    city,
                                    serviceType: type
                                  })
                                : `/parent/sitter/${encodeURIComponent(sitter.id)}`
                            }
                            className="inline-block text-[11px] font-semibold text-[#0B6BCB] underline decoration-[#0B6BCB]/40 underline-offset-2 transition hover:text-[#08529a]"
                          >
                            כל המידע
                          </Link>
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={
                          selecting ||
                          requested ||
                          selectingSitterId !== null ||
                          sitter.hourlyRate == null
                        }
                        onClick={() =>
                          void handleSelectSitter(sitter)
                        }
                        className="rounded-xl bg-navy-header px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-[#001F3F]/90 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {selecting
                          ? "שולח..."
                          : requested
                            ? "בקשה נשלחה"
                            : "שליחת בקשה"}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {declineNotice ? (
        <BroadcastDeclineNoticeUnit
          notice={declineNotice}
          onClose={() => setDeclineNotice(null)}
        />
      ) : null}
    </div>
  );
}

export default function BroadcastRadarPage() {
  return (
    <Suspense
      fallback={
        <div className="py-12 text-center text-xs font-bold text-slate-400">
          טוען נתוני חיפוש...
        </div>
      }
    >
      <BroadcastRadarContent />
    </Suspense>
  );
}