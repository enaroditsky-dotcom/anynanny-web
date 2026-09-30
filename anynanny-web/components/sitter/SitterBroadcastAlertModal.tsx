"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  removeRealtimeChannel,
  subscribePostgresChanges
} from "@/lib/supabase/subscribe-postgres-changes";
import { areSoundAlertsEnabled } from "@/lib/settings/notification-preferences";
import { ACCOUNT_SUSPENDED_MESSAGE, BLOCKED_PAIR_MESSAGE } from "@/lib/safety/constants";
import { assertMarketplacePairAllowed, fetchIsAccountSuspended } from "@/lib/safety/enforcement";
import {
  ACTIVE_SITTER_BROADCAST_RELEVANCE_MS,
  isActiveSitterBroadcastStatus,
  isSitterBroadcastCreatedAtRelevant,
  isTerminalSitterBroadcastStatus,
  mergeOpenSitterBroadcast,
  recoverActiveSitterBroadcast,
  type RecoverableSitterBroadcast,
  type SitterBroadcastRow
} from "@/lib/broadcast/sitter-broadcast-recovery";
import {
  buildNowBroadcastResponseInsert,
  legacyNowBroadcastResponseInsert,
  parseNowRequestDetails,
  SITTER_BROADCAST_ALERT_SELECT,
  SITTER_BROADCAST_ALERT_SELECT_LEGACY,
  type NowArrivalRange
} from "@/lib/broadcast/now-request-details";
import { isPostgrestSchemaDriftError } from "@/lib/supabase/postgrest-schema";
import {
  applyNowBroadcastEligibility,
  filterNowBroadcastIdsForCurrentSitter
} from "@/lib/broadcast/sitter-now-eligibility";
import { NowBroadcastAlertBody } from "@/components/sitter/now-broadcast-alert-body";
import { Zap } from "lucide-react";

interface BroadcastAlertModalProps {
  sitterId: string;

  /** Hide overlay without unmounting (preserves dismissed ids + channel). */
  paused?: boolean;
}

const DISMISSED_STORAGE_KEY = "anynanny_broadcast_dismissed_v1";

/**
 * Database status is the source of truth for lifecycle.
 * Polling recovers currently active, still-relevant NOW rows if Realtime
 * missed the INSERT. Abandoned `active` rows outside the relevance window
 * must not reopen the overlay.
 */
const FALLBACK_POLL_MS = 10_000;

function readDismissedIds(): Set<string> {
  if (typeof window === "undefined") {
    return new Set();
  }

  try {
    const raw = window.sessionStorage.getItem(
      DISMISSED_STORAGE_KEY
    );

    if (!raw) {
      return new Set();
    }

    const parsed = JSON.parse(raw) as unknown;

    if (!Array.isArray(parsed)) {
      return new Set();
    }

    return new Set(
      parsed.filter(
        (id): id is string =>
          typeof id === "string" &&
          id.trim().length > 0
      )
    );
  } catch {
    return new Set();
  }
}

function persistDismissedIds(
  ids: Set<string>
): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(
      DISMISSED_STORAGE_KEY,
      JSON.stringify([...ids])
    );
  } catch {
    /* ignore */
  }
}

function playAlertSound(): void {
  if (!areSoundAlertsEnabled()) {
    return;
  }

  try {
    const AudioCtx =
      window.AudioContext ||
      (
        window as unknown as {
          webkitAudioContext?: typeof AudioContext;
        }
      ).webkitAudioContext;

    if (!AudioCtx) {
      return;
    }

    const audioCtx = new AudioCtx();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(
      659.25,
      audioCtx.currentTime
    );

    gain.gain.setValueAtTime(
      0.15,
      audioCtx.currentTime
    );

    gain.gain.exponentialRampToValueAtTime(
      0.01,
      audioCtx.currentTime + 0.3
    );

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.3);
  } catch {
    /*
     * Browser autoplay restrictions may block sound.
     * The visual alert must still work.
     */
  }
}

/**
 * Incoming AnyNanny Now broadcast modal.
 *
 * Source of truth: broadcast_alerts.status = 'active' in the database
 * AND created_at within ACTIVE_SITTER_BROADCAST_RELEVANCE_MS.
 * Realtime INSERT is an optimization. Catch-up polling recovers a live
 * city-eligible request; stale abandoned actives must not open.
 *
 * Dismissed alerts persist across component remounts in sessionStorage.
 */
export function SitterBroadcastAlertModal({
  sitterId,
  paused = false
}: BroadcastAlertModalProps) {
  const [activeAlert, setActiveAlert] =
    useState<RecoverableSitterBroadcast | null>(null);

  const [arrivalOpen, setArrivalOpen] =
    useState(false);

  const [selectedArrival, setSelectedArrival] =
    useState<NowArrivalRange | null>(null);

  const [arrivalAlertId, setArrivalAlertId] =
    useState<string | null>(null);

  const [sitterCities, setSitterCities] =
    useState<string[]>([]);

  const [loading, setLoading] =
    useState(false);

  const dismissedAlertIdsRef =
    useRef<Set<string>>(
      readDismissedIds()
    );

  const activeAlertIdRef =
    useRef<string | null>(null);

  const pausedRef =
    useRef(paused);

  pausedRef.current = paused;

  activeAlertIdRef.current =
    activeAlert?.id ?? null;

  const citiesKey = useMemo(
    () =>
      [
        ...new Set(
          sitterCities
            .map((city) => city.trim())
            .filter(Boolean)
        )
      ]
        .sort((a, b) =>
          a.localeCompare(b, "he")
        )
        .join("|"),
    [sitterCities]
  );

  const stableCities = useMemo(
    () =>
      citiesKey
        ? citiesKey.split("|")
        : [],
    [citiesKey]
  );

  const dismissAlertId = (
    id: string | null | undefined
  ) => {
    if (!id) {
      return;
    }

    dismissedAlertIdsRef.current.add(id);

    persistDismissedIds(
      dismissedAlertIdsRef.current
    );
  };

  const clearActiveIfMatch = (
    id?: string | null
  ) => {
    setActiveAlert((previous) => {
      if (!previous) {
        return null;
      }

      if (
        id &&
        previous.id !== id
      ) {
        return previous;
      }

      return null;
    });
  };

  const tryOpenAlert = (
    alert: RecoverableSitterBroadcast,
    {
      playSound
    }: {
      playSound: boolean;
    }
  ) => {
    if (!alert.id) {
      return;
    }

    if (
      dismissedAlertIdsRef.current.has(
        alert.id
      )
    ) {
      return;
    }

    if (
      alert.created_at &&
      !isSitterBroadcastCreatedAtRelevant(
        alert.created_at
      )
    ) {
      return;
    }

    if (pausedRef.current) {
      return;
    }

    setActiveAlert((previous) =>
      mergeOpenSitterBroadcast(previous, alert)
    );

    if (playSound) {
      playAlertSound();
    }
  };

  /*
   * Load sitter working cities.
   */
  useEffect(() => {
    if (!sitterId) {
      return;
    }

    const supabase =
      getSupabaseBrowserClient();

    if (!supabase) {
      return;
    }

    let cancelled = false;

    void (async () => {
      const {
        data,
        error
      } = await supabase
        .from("sitter_profiles")
        .select("working_cities")
        .eq("id", sitterId)
        .limit(1);

      if (
        cancelled ||
        error
      ) {
        return;
      }

      const profile =
        data &&
        data.length > 0
          ? data[0]
          : null;

      const cities =
        profile?.working_cities &&
        Array.isArray(
          profile.working_cities
        )
          ? profile.working_cities.filter(
              (
                city: unknown
              ): city is string =>
                typeof city ===
                  "string" &&
                city.trim().length > 0
            )
          : [];

      /*
       * Never invent a default city.
       * Empty means no broadcast subscription.
       */
      setSitterCities(cities);
    })();

    return () => {
      cancelled = true;
    };
  }, [sitterId]);

  /*
   * Realtime + fallback polling.
   */
  useEffect(() => {
    if (
      !sitterId ||
      stableCities.length === 0
    ) {
      return;
    }

    const supabase =
      getSupabaseBrowserClient();

    if (!supabase) {
      return;
    }

    let disposed = false;

    const catchUpActiveAlerts =
      async ({
        allowOpen
      }: {
        allowOpen: boolean;
      }) => {
        if (disposed) {
          return;
        }

        const since = new Date(
          Date.now() - ACTIVE_SITTER_BROADCAST_RELEVANCE_MS
        ).toISOString();

        const loadAlerts = (
          columns: string
        ) =>
          supabase
            .from("broadcast_alerts")
            .select(columns)
            .in(
              "city",
              stableCities
            )
            .eq(
              "status",
              "active"
            )
            .gte(
              "created_at",
              since
            )
            .order(
              "created_at",
              {
                ascending: false
              }
            )
            .limit(5);

        let {
          data: alertsData,
          error
        } = await loadAlerts(
          SITTER_BROADCAST_ALERT_SELECT
        );

        if (
          error &&
          isPostgrestSchemaDriftError(
            error.message
          )
        ) {
          const fallback =
            await loadAlerts(
              SITTER_BROADCAST_ALERT_SELECT_LEGACY
            );

          alertsData = fallback.data;
          error = fallback.error;
        }

        if (
          disposed
        ) {
          return;
        }

        if (error) {
          console.warn(
            "[sitter broadcast] alerts catch-up:",
            error.message
          );
          return;
        }

        const loadedRows =
          (alertsData ??
            []) as SitterBroadcastRow[];
        const eligibility =
          await filterNowBroadcastIdsForCurrentSitter(
            supabase,
            loadedRows.map((row) =>
              String(row.id ?? "")
            )
          );
        const visibleRows =
          applyNowBroadcastEligibility(
            loadedRows,
            eligibility
          );

        const currentId =
          activeAlertIdRef.current;

        const recovery =
          recoverActiveSitterBroadcast(
            {
              rows: visibleRows,
              sitterCities:
                stableCities,
              dismissedIds:
                dismissedAlertIdsRef.current,
              paused:
                pausedRef.current,
              currentId
            }
          );

        if (
          recovery.clearCurrent
        ) {
          clearActiveIfMatch(
            currentId
          );
        }

        if (
          !allowOpen ||
          !recovery.open
        ) {
          return;
        }

        tryOpenAlert(
          recovery.open,
          {
            playSound: false
          }
        );
      };

    /*
     * Immediate recovery on mount.
     */
    void catchUpActiveAlerts({
      allowOpen: true
    });

    /*
     * Faster fallback than before.
     * If realtime misses an INSERT, recovery occurs within ~10 seconds.
     */
    const pollInterval =
      window.setInterval(() => {
        void catchUpActiveAlerts({
          allowOpen: true
        });
      }, FALLBACK_POLL_MS);

    /*
     * Primary realtime delivery.
     */
    const channels =
      stableCities.map((city) =>
        subscribePostgresChanges(
          supabase,
          `sitter-broadcast-room-${city}`,
          [
            {
              event: "INSERT",
              table:
                "broadcast_alerts",
              filter:
                `city=eq.${city}`,
              handler: (
                payload
              ) => {
                const next =
                  payload.new as
                    | {
                        id?: string;
                        status?: string;
                        city?: string;
                        service_type?: string;
                        created_at?: string;
                        location_label?: string | null;
                        timing_mode?: string | null;
                        requested_time?: string | null;
                      }
                    | null;

                if (
                  !next?.id ||
                  !isActiveSitterBroadcastStatus(
                    next.status
                  )
                ) {
                  return;
                }

                const incoming = {
                  id: next.id,
                  city:
                    next.city ??
                    city,
                  service_type:
                    next.service_type ??
                    "",
                  created_at:
                    next.created_at,
                  location_label:
                    next.location_label ??
                    null,
                  timing_mode:
                    next.timing_mode ??
                    null,
                  requested_time:
                    next.requested_time ??
                    null
                };

                void (async () => {
                  const eligibility =
                    await filterNowBroadcastIdsForCurrentSitter(
                      supabase,
                      [incoming.id]
                    );
                  if (
                    applyNowBroadcastEligibility(
                      [incoming],
                      eligibility
                    ).length === 0
                  ) {
                    return;
                  }

                  tryOpenAlert(
                    incoming,
                    {
                      playSound: true
                    }
                  );
                })();
              }
            },
            {
              event: "UPDATE",
              table:
                "broadcast_alerts",
              filter:
                `city=eq.${city}`,
              handler: (
                payload
              ) => {
                const next =
                  payload.new as
                    | {
                        id?: string;
                        status?: string;
                      }
                    | null;

                if (
                  !next?.id
                ) {
                  return;
                }

                if (
                  isTerminalSitterBroadcastStatus(
                    next.status
                  )
                ) {
                  dismissAlertId(
                    next.id
                  );

                  clearActiveIfMatch(
                    next.id
                  );
                }
              }
            }
          ],
          undefined,
          {
            maxRetries: 3
          }
        )
      );

    return () => {
      disposed = true;

      window.clearInterval(
        pollInterval
      );

      channels.forEach(
        (channel) =>
          removeRealtimeChannel(
            supabase,
            channel
          )
      );
    };
  }, [
    sitterId,
    citiesKey,
    stableCities
  ]);

  /*
   * If paused, for example while another booking approval UI is open,
   * hide the overlay but keep the subscription alive.
   */
  useEffect(() => {
    if (paused) {
      setActiveAlert(null);
    }
  }, [paused]);

  const handleAccept =
    async (
      arrivalRange: NowArrivalRange | null = null
    ) => {
      if (!activeAlert) {
        return;
      }

      setLoading(true);

      const supabase =
        getSupabaseBrowserClient();

      if (!supabase) {
        setLoading(false);
        return;
      }

      const alertId =
        activeAlert.id;

      try {
        const {
          data: {
            user
          }
        } =
          await supabase.auth.getUser();

        if (!user) {
          alert(
            "שגיאת הזדהות, אנא התחבר מחדש."
          );

          setLoading(false);
          return;
        }

        if (await fetchIsAccountSuspended(supabase, user.id)) {
          alert(ACCOUNT_SUSPENDED_MESSAGE);
          setLoading(false);
          return;
        }

        const { data: alertRow } = await supabase
          .from("broadcast_alerts")
          .select("parent_id")
          .eq("id", alertId)
          .maybeSingle();
        const parentId =
          alertRow && typeof alertRow === "object" && "parent_id" in alertRow
            ? String((alertRow as { parent_id?: string }).parent_id ?? "")
            : "";
        if (parentId) {
          const pairCheck = await assertMarketplacePairAllowed(supabase, user.id, parentId);
          if (!pairCheck.ok) {
            alert(pairCheck.error === ACCOUNT_SUSPENDED_MESSAGE ? ACCOUNT_SUSPENDED_MESSAGE : BLOCKED_PAIR_MESSAGE);
            setLoading(false);
            return;
          }
        }

        const responseRow =
          buildNowBroadcastResponseInsert({
            alertId,
            sitterId: user.id,
            arrivalRange
          });

        let {
          error
        } = await supabase
          .from(
            "broadcast_responses"
          )
          .insert([
            responseRow
          ]);

        if (
          error &&
          arrivalRange &&
          isPostgrestSchemaDriftError(
            error.message
          )
        ) {
          const fallback =
            await supabase
              .from(
                "broadcast_responses"
              )
              .insert([
                legacyNowBroadcastResponseInsert({
                  alertId,
                  sitterId:
                    user.id
                })
              ]);

          error = fallback.error;
        }

        /*
         * 23505 = duplicate response.
         * Treat it as already accepted.
         */
        if (
          error &&
          error.code !==
            "23505"
        ) {
          throw error;
        }

        alert(
          "אישור הזמינות נשלח בהצלחה להורה!"
        );
      } catch (error) {
        console.error(
          "Error accepting broadcast:",
          error
        );
      } finally {
        dismissAlertId(
          alertId
        );

        setActiveAlert(null);
        setLoading(false);
      }
    };

  const handleDismiss =
    () => {
      dismissAlertId(
        activeAlert?.id
      );

      setActiveAlert(null);
    };

  if (
    activeAlert &&
    arrivalAlertId !== activeAlert.id
  ) {
    setArrivalAlertId(activeAlert.id);
    setArrivalOpen(false);
    setSelectedArrival(null);
  }

  if (
    paused ||
    !activeAlert
  ) {
    return null;
  }

  const arrivalMatches =
    arrivalAlertId === activeAlert.id;

  const requestDetails =
    parseNowRequestDetails(activeAlert);

  const serviceName =
    activeAlert.service_type ===
    "lactation"
      ? "יועצת הנקה"
      : activeAlert.service_type ===
          "sleep"
        ? "יועצת שינה"
        : activeAlert.service_type ===
            "doula"
          ? "דולה"
          : "בייביסיטר";

  const overlay = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
      dir="rtl"
      role="dialog"
      aria-modal="true"
      aria-label="בייביסיטר זמינה בסביבה"
    >
      <div className="max-h-[calc(100dvh-2rem)] w-full max-w-sm overflow-x-hidden overflow-y-auto rounded-3xl border border-red-100 bg-white p-5 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <div className="flex flex-col items-center space-y-4 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500 text-white shadow-md animate-pulse">
            <Zap className="h-6 w-6 fill-white" />
          </div>

          <div className="space-y-1">
            <h3 className="text-base font-black text-slate-800">
              ⚡ בייביסיטר זמינה בסביבה
            </h3>

            <p className="text-xs font-semibold text-red-600">
              הורה ב
              {activeAlert.city}{" "}
              מחפש מענה מעכשיו לעכשיו!
            </p>

            <p className="text-xs text-slate-500">
              התפקיד הנדרש:{" "}
              <span className="font-bold text-navy-header">
                {serviceName}
              </span>
            </p>
          </div>

          <NowBroadcastAlertBody
            details={requestDetails}
            loading={loading}
            arrivalOpen={
              arrivalMatches &&
              arrivalOpen
            }
            selectedArrival={
              arrivalMatches
                ? selectedArrival
                : null
            }
            onToggleArrival={() =>
              setArrivalOpen(
                (open) => !open
              )
            }
            onSelectArrival={(
              value
            ) => {
              setSelectedArrival(
                value
              );
              setArrivalOpen(false);
              void handleAccept(
                value
              );
            }}
            onAcceptSpecific={() =>
              void handleAccept(null)
            }
            onAcceptLegacy={() =>
              void handleAccept(null)
            }
            onDismiss={handleDismiss}
          />
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") {
    return overlay;
  }

  return createPortal(overlay, document.body);
}