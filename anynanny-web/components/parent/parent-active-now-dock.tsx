"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { ActiveNowBroadcastBar } from "@/components/parent/active-now-broadcast-bar";
import {
  readRememberedActiveBroadcast,
  rememberActiveBroadcast
} from "@/lib/broadcast/broadcast-active-snapshot";
import {
  isBroadcastMinimized,
  setBroadcastMinimized,
  subscribeBroadcastMinimized
} from "@/lib/broadcast/broadcast-minimize-preference";
import { requestBroadcastStatusChange } from "@/lib/broadcast/broadcast-status-change";
import {
  broadcastRadarHref,
  countBroadcastResponses,
  fetchActiveBroadcastForParent,
  findApprovedBroadcastLinkedBooking,
  type ParentActiveBroadcast
} from "@/lib/broadcast/parent-active-broadcast";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  removeRealtimeChannel,
  subscribePostgresChanges
} from "@/lib/supabase/subscribe-postgres-changes";

/** Matches compact strip (~3.5rem) + small gap above bottom nav. */
const DOCK_OFFSET = "3.75rem";

function seedFromSnapshot(): ParentActiveBroadcast | null {
  return readRememberedActiveBroadcast();
}

/**
 * Persistent AnyNanny Now chrome.
 * Visibility: active broadcast row exists and parent is not on radar/start.
 * Minimize must never write broadcast business state.
 */
export function ParentActiveNowDock({ pathname }: { pathname: string }) {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const parentId = user?.id ?? null;
  const supabase = getSupabaseBrowserClient();

  const [broadcast, setBroadcast] = useState<ParentActiveBroadcast | null>(null);
  const [responseCount, setResponseCount] = useState(0);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [ready, setReady] = useState(false);
  const [portalReady, setPortalReady] = useState(false);
  const broadcastRef = useRef<ParentActiveBroadcast | null>(null);
  const loadGen = useRef(0);

  broadcastRef.current = broadcast;

  const onParentRoute = pathname.startsWith("/parent/");
  const onRadar = pathname.startsWith("/parent/search/broadcast-radar");
  const onStart =
    pathname === "/parent/broadcast" || pathname.startsWith("/parent/broadcast/");
  const canShowBar = onParentRoute && !onRadar && !onStart;
  const onStartRef = useRef(onStart);
  const canShowBarRef = useRef(canShowBar);
  onStartRef.current = onStart;
  canShowBarRef.current = canShowBar;

  useEffect(() => {
    setPortalReady(true);
  }, []);

  // Instant paint after minimize: seed from warm snapshot before network returns.
  useEffect(() => {
    if (!canShowBar) return;
    if (broadcastRef.current) return;
    const remembered = seedFromSnapshot();
    if (!remembered) return;
    if (parentId && remembered.parent_id !== parentId) return;
    setBroadcast(remembered);
    setReady(true);
  }, [canShowBar, pathname, parentId]);

  useEffect(() => {
    if (isLoading) return;
    if (!parentId || !supabase || !onParentRoute) {
      setBroadcast(null);
      setResponseCount(0);
      setReady(true);
      rememberActiveBroadcast(null);
      return;
    }

    let disposed = false;

    const applyActive = async (next: ParentActiveBroadcast | null) => {
      if (disposed) return;
      if (next) {
        rememberActiveBroadcast(next);
        setBroadcast(next);
        const count = await countBroadcastResponses(supabase, next.id);
        if (!disposed) setResponseCount(count);
      } else {
        rememberActiveBroadcast(null);
        setBroadcast(null);
        setResponseCount(0);
      }
      if (!disposed) setReady(true);
    };

    const load = async (opts?: { allowFill?: boolean }) => {
      // Never fill while the parent is on the start screen — that path was
      // clearing the active row and making minimize look like a reset.
      const allowFill = opts?.allowFill !== false && !onStartRef.current;
      const gen = ++loadGen.current;
      const { broadcast: next } = await fetchActiveBroadcastForParent(supabase, parentId);
      if (disposed || gen !== loadGen.current) return;

      if (next && allowFill) {
        const confirmed = await findApprovedBroadcastLinkedBooking(
          supabase,
          parentId,
          next.id,
          next.created_at
        );
        if (disposed || gen !== loadGen.current) return;
        if (confirmed) {
          const filled = await requestBroadcastStatusChange("fill", next.id);
          if (disposed || gen !== loadGen.current) return;
          if (!filled.ok) {
            console.warn("[broadcast dock] fill:", filled.error);
            await applyActive(next);
            return;
          }
          const { broadcast: stillActive } = await fetchActiveBroadcastForParent(
            supabase,
            parentId
          );
          if (disposed || gen !== loadGen.current) return;
          await applyActive(stillActive);
          return;
        }
      }

      await applyActive(next);
    };

    void load({ allowFill: true });

    const poll = window.setInterval(() => {
      void load({ allowFill: true });
    }, 2500);

    const alertChannel = subscribePostgresChanges(
      supabase,
      `parent-now-alert-${parentId}`,
      {
        event: "*",
        table: "broadcast_alerts",
        filter: `parent_id=eq.${parentId}`,
        handler: () => {
          void load({ allowFill: true });
        }
      }
    );

    const responseChannel = subscribePostgresChanges(
      supabase,
      `parent-now-responses-${parentId}`,
      {
        event: "INSERT",
        table: "broadcast_responses",
        handler: () => {
          void load({ allowFill: false });
        }
      }
    );

    const bookingChannel = subscribePostgresChanges(
      supabase,
      `parent-now-bookings-${parentId}`,
      {
        event: "UPDATE",
        table: "bookings",
        filter: `parent_id=eq.${parentId}`,
        handler: () => {
          void load({ allowFill: true });
        }
      }
    );

    const unsubscribeMinimized = subscribeBroadcastMinimized(() => {
      if (!isBroadcastMinimized()) return;
      // Minimize is UI-only: never fill/pause/cancel here.
      const remembered = seedFromSnapshot() ?? broadcastRef.current;
      if (remembered && remembered.parent_id === parentId) {
        setBroadcast(remembered);
        setReady(true);
      }
      void load({ allowFill: false });
    });

    return () => {
      disposed = true;
      window.clearInterval(poll);
      unsubscribeMinimized();
      removeRealtimeChannel(supabase, alertChannel);
      removeRealtimeChannel(supabase, responseChannel);
      removeRealtimeChannel(supabase, bookingChannel);
    };
  }, [isLoading, parentId, supabase, onParentRoute]);

  // Landing on dashboard / other showable routes after leaving start/radar.
  useEffect(() => {
    if (isLoading || !parentId || !supabase || !canShowBar) return;
    let cancelled = false;
    const gen = ++loadGen.current;

    const remembered = seedFromSnapshot() ?? broadcastRef.current;
    if (remembered && remembered.parent_id === parentId) {
      setBroadcast(remembered);
      setReady(true);
    }

    void (async () => {
      const { broadcast: next } = await fetchActiveBroadcastForParent(supabase, parentId);
      if (cancelled || gen !== loadGen.current) return;

      if (next) {
        // Approval fill is allowed on dashboard landings, but if fill fails
        // keep the active row so minimize never looks like a reset.
        const confirmed = await findApprovedBroadcastLinkedBooking(
          supabase,
          parentId,
          next.id,
          next.created_at
        );
        if (cancelled || gen !== loadGen.current) return;
        if (confirmed) {
          const filled = await requestBroadcastStatusChange("fill", next.id);
          if (cancelled || gen !== loadGen.current) return;
          if (!filled.ok) {
            console.warn("[broadcast dock] route fill:", filled.error);
            rememberActiveBroadcast(next);
            setBroadcast(next);
            setResponseCount(await countBroadcastResponses(supabase, next.id));
            setReady(true);
            return;
          }
          const { broadcast: stillActive } = await fetchActiveBroadcastForParent(
            supabase,
            parentId
          );
          if (cancelled || gen !== loadGen.current) return;
          rememberActiveBroadcast(stillActive);
          setBroadcast(stillActive);
          setResponseCount(
            stillActive ? await countBroadcastResponses(supabase, stillActive.id) : 0
          );
          setReady(true);
          return;
        }

        rememberActiveBroadcast(next);
        setBroadcast(next);
        setResponseCount(await countBroadcastResponses(supabase, next.id));
        setReady(true);
        return;
      }

      // Confirmed empty from server — clear.
      rememberActiveBroadcast(null);
      setBroadcast(null);
      setResponseCount(0);
      setReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [pathname, isLoading, parentId, supabase, canShowBar]);

  useEffect(() => {
    if (!broadcast) return;
    const tick = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(tick);
  }, [broadcast?.id]);

  const showBar = Boolean(broadcast && ready && canShowBar);

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--anynanny-now-dock",
      showBar ? DOCK_OFFSET : "0px"
    );
    return () => {
      document.documentElement.style.setProperty("--anynanny-now-dock", "0px");
    };
  }, [showBar]);

  if (!showBar || !broadcast || !portalReady || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <ActiveNowBroadcastBar
      broadcast={broadcast}
      responseCount={responseCount}
      nowMs={nowMs}
      onRestore={() => {
        setBroadcastMinimized(false);
        router.push(broadcastRadarHref(broadcast));
      }}
    />,
    document.body
  );
}
