"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { removeRealtimeChannel, subscribePostgresChanges } from "@/lib/supabase/subscribe-postgres-changes";
import { areSoundAlertsEnabled } from "@/lib/settings/notification-preferences";
import { Zap } from "lucide-react";

interface BroadcastAlertModalProps {
  sitterId: string;
  /** Hide overlay without unmounting (preserves dismissed ids + channel). */
  paused?: boolean;
}

type ActiveAlert = { id: string; city: string; service_type: string; created_at?: string };

const DISMISSED_STORAGE_KEY = "anynanny_broadcast_dismissed_v1";
const ALERT_MAX_AGE_MS = 10 * 60 * 1000;
const FRESH_EVENT_MAX_AGE_MS = 45 * 1000;
const FALLBACK_POLL_MS = 60_000;

function readDismissedIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.sessionStorage.getItem(DISMISSED_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === "string" && id.trim().length > 0));
  } catch {
    return new Set();
  }
}

function persistDismissedIds(ids: Set<string>): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(DISMISSED_STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    /* ignore */
  }
}

function isFreshIso(createdAt: string | null | undefined, maxAgeMs: number): boolean {
  if (!createdAt) return false;
  const t = Date.parse(createdAt);
  if (!Number.isFinite(t)) return false;
  return Date.now() - t <= maxAgeMs;
}

function playAlertSound(): void {
  if (!areSoundAlertsEnabled()) return;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const audioCtx = new AudioCtx();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(659.25, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.3);
  } catch {
    /* autoplay may be blocked */
  }
}

/**
 * Incoming AnyNanny Now broadcast modal.
 * Opens only for genuine fresh INSERT events (or a slow catch-up poll for missed inserts).
 * Dismiss persists across remounts via sessionStorage.
 */
export function SitterBroadcastAlertModal({ sitterId, paused = false }: BroadcastAlertModalProps) {
  const [activeAlert, setActiveAlert] = useState<ActiveAlert | null>(null);
  const [sitterCities, setSitterCities] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const dismissedAlertIdsRef = useRef<Set<string>>(readDismissedIds());
  const activeAlertIdRef = useRef<string | null>(null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  activeAlertIdRef.current = activeAlert?.id ?? null;

  const citiesKey = useMemo(
    () =>
      [...new Set(sitterCities.map((c) => c.trim()).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, "he"))
        .join("|"),
    [sitterCities]
  );
  const stableCities = useMemo(() => (citiesKey ? citiesKey.split("|") : []), [citiesKey]);

  const dismissAlertId = (id: string | null | undefined) => {
    if (!id) return;
    dismissedAlertIdsRef.current.add(id);
    persistDismissedIds(dismissedAlertIdsRef.current);
  };

  const clearActiveIfMatch = (id?: string | null) => {
    setActiveAlert((prev) => {
      if (!prev) return null;
      if (id && prev.id !== id) return prev;
      return null;
    });
  };

  const tryOpenAlert = (alert: ActiveAlert, { playSound }: { playSound: boolean }) => {
    if (!alert.id) return;
    if (dismissedAlertIdsRef.current.has(alert.id)) return;
    if (pausedRef.current) return;
    setActiveAlert((prev) => {
      if (prev?.id === alert.id) return prev;
      return alert;
    });
    if (playSound) playAlertSound();
  };

  useEffect(() => {
    if (!sitterId) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from("sitter_profiles")
        .select("working_cities")
        .eq("id", sitterId)
        .limit(1);

      if (cancelled || error) return;
      const profile = data && data.length > 0 ? data[0] : null;
      const cities =
        profile?.working_cities && Array.isArray(profile.working_cities)
          ? profile.working_cities.filter(
              (c: unknown): c is string => typeof c === "string" && c.trim().length > 0
            )
          : [];
      // Never invent a default city — empty means no broadcast subscription.
      setSitterCities(cities);
    })();

    return () => {
      cancelled = true;
    };
  }, [sitterId]);

  useEffect(() => {
    if (!sitterId || stableCities.length === 0) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const catchUpActiveAlerts = async ({ allowOpen }: { allowOpen: boolean }) => {
      const since = new Date(Date.now() - ALERT_MAX_AGE_MS).toISOString();
      const { data: alertsData, error } = await supabase
        .from("broadcast_alerts")
        .select("id, city, service_type, status, created_at")
        .in("city", stableCities)
        .eq("status", "active")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(5);

      if (error) {
        console.warn("[sitter broadcast] alerts catch-up:", error.message);
        return;
      }

      const rows = alertsData ?? [];
      const valid = rows.find(
        (alert) =>
          alert?.id &&
          !dismissedAlertIdsRef.current.has(alert.id) &&
          isFreshIso(alert.created_at, ALERT_MAX_AGE_MS)
      );

      const currentId = activeAlertIdRef.current;
      if (currentId && !rows.some((a) => a.id === currentId && a.status === "active")) {
        clearActiveIfMatch(currentId);
      }

      if (!allowOpen || !valid) return;

      // Catch-up only opens very fresh alerts (missed INSERT while briefly offline).
      if (!isFreshIso(valid.created_at, FRESH_EVENT_MAX_AGE_MS)) return;

      tryOpenAlert(
        {
          id: String(valid.id),
          city: String(valid.city ?? ""),
          service_type: String(valid.service_type ?? ""),
          created_at: valid.created_at ? String(valid.created_at) : undefined
        },
        { playSound: false }
      );
    };

    void catchUpActiveAlerts({ allowOpen: true });
    const pollInterval = window.setInterval(() => {
      void catchUpActiveAlerts({ allowOpen: true });
    }, FALLBACK_POLL_MS);

    const channels = stableCities.map((city) =>
      subscribePostgresChanges(
        supabase,
        `sitter-broadcast-room-${city}`,
        [
          {
            event: "INSERT",
            table: "broadcast_alerts",
            filter: `city=eq.${city}`,
            handler: (payload) => {
              const next = payload.new as {
                id?: string;
                status?: string;
                city?: string;
                service_type?: string;
                created_at?: string;
              } | null;
              if (!next?.id || next.status !== "active") return;
              if (next.created_at && !isFreshIso(next.created_at, ALERT_MAX_AGE_MS)) return;
              tryOpenAlert(
                {
                  id: next.id,
                  city: next.city ?? city,
                  service_type: next.service_type ?? "",
                  created_at: next.created_at
                },
                { playSound: true }
              );
            }
          },
          {
            event: "UPDATE",
            table: "broadcast_alerts",
            filter: `city=eq.${city}`,
            handler: (payload) => {
              const next = payload.new as { id?: string; status?: string } | null;
              if (!next?.id) return;
              if (
                next.status === "expired" ||
                next.status === "filled" ||
                next.status === "paused" ||
                next.status === "cancelled"
              ) {
                dismissAlertId(next.id);
                clearActiveIfMatch(next.id);
              }
            }
          }
        ],
        undefined,
        { maxRetries: 3 }
      )
    );

    return () => {
      window.clearInterval(pollInterval);
      channels.forEach((channel) => removeRealtimeChannel(supabase, channel));
    };
  }, [sitterId, citiesKey, stableCities]);

  // If paused (e.g. booking approval UI), hide overlay but keep subscription alive.
  useEffect(() => {
    if (paused) setActiveAlert(null);
  }, [paused]);

  const handleAccept = async () => {
    if (!activeAlert) return;
    setLoading(true);
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setLoading(false);
      return;
    }

    const alertId = activeAlert.id;
    try {
      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (!user) {
        alert("שגיאת הזדהות, אנא התחבר מחדש.");
        setLoading(false);
        return;
      }

      const { error } = await supabase
        .from("broadcast_responses")
        .insert([{ alert_id: alertId, sitter_id: user.id }]);

      if (error && error.code !== "23505") {
        throw error;
      }
      alert("אישור הזמינות נשלח בהצלחה להורה!");
    } catch (err) {
      console.error("Error accepting broadcast:", err);
    } finally {
      dismissAlertId(alertId);
      setActiveAlert(null);
      setLoading(false);
    }
  };

  const handleDismiss = () => {
    dismissAlertId(activeAlert?.id);
    setActiveAlert(null);
  };

  if (paused || !activeAlert) return null;

  const serviceName =
    activeAlert.service_type === "lactation"
      ? "יועצת הנקה"
      : activeAlert.service_type === "sleep"
        ? "יועצת שינה"
        : "בייביסיטר";

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
      dir="rtl"
      role="dialog"
      aria-modal="true"
      aria-label="קריאת ברק"
    >
      <div className="w-full max-w-sm rounded-3xl border border-red-100 bg-white p-5 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <div className="flex flex-col items-center space-y-4 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500 text-white shadow-md animate-pulse">
            <Zap className="h-6 w-6 fill-white" />
          </div>

          <div className="space-y-1">
            <h3 className="text-base font-black text-slate-800">⚡ קריאת ברק מיידית בסביבה!</h3>
            <p className="text-xs font-semibold text-red-600">
              הורה ב{activeAlert.city} מחפש מענה מעכשיו לעכשיו!
            </p>
            <p className="text-xs text-slate-500">
              התפקיד הנדרש: <span className="font-bold text-navy-header">{serviceName}</span>
            </p>
          </div>

          <div className="flex w-full flex-col gap-2 pt-2">
            <button
              type="button"
              disabled={loading}
              onClick={() => void handleAccept()}
              className="w-full rounded-2xl bg-[#001F3F] py-3 text-xs font-bold text-white shadow-md transition hover:brightness-110 active:scale-[0.97]"
            >
              {loading ? "שולח מענה..." : "אני פנויה, הציגו אותי להורה!"}
            </button>

            <button
              type="button"
              disabled={loading}
              onClick={handleDismiss}
              className="w-full rounded-2xl border border-slate-200 bg-white py-2 text-[11px] font-bold text-slate-400 transition hover:bg-slate-50"
            >
              התעלם / לא רלוונטי
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
