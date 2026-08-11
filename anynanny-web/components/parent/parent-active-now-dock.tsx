"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { ActiveNowBroadcastBar } from "@/components/parent/active-now-broadcast-bar";
import {
  isBroadcastMinimized,
  setBroadcastMinimized
} from "@/lib/broadcast/broadcast-minimize-preference";
import {
  broadcastRadarHref,
  countBroadcastResponses,
  fetchActiveBroadcastForParent,
  findApprovedBroadcastLinkedBooking,
  markActiveBroadcastFilled,
  type ParentActiveBroadcast
} from "@/lib/broadcast/parent-active-broadcast";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  removeRealtimeChannel,
  subscribePostgresChanges
} from "@/lib/supabase/subscribe-postgres-changes";

/**
 * Persistent AnyNanny Now chrome for parent routes.
 * Active/searching state comes from broadcast_alerts, not React or storage.
 */
export function ParentActiveNowDock() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const parentId = user?.id ?? null;
  const supabase = getSupabaseBrowserClient();

  const [broadcast, setBroadcast] = useState<ParentActiveBroadcast | null>(null);
  const [responseCount, setResponseCount] = useState(0);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [ready, setReady] = useState(false);
  const redirectingRef = useRef(false);

  const onRadar = pathname.startsWith("/parent/search/broadcast-radar");
  const onStart = pathname === "/parent/broadcast" || pathname.startsWith("/parent/broadcast/");
  const onDashboard =
    pathname === "/parent/dashboard" || pathname.startsWith("/parent/dashboard/");

  useEffect(() => {
    if (isLoading) return;
    if (!parentId || !supabase) {
      setBroadcast(null);
      setResponseCount(0);
      setReady(true);
      return;
    }

    let disposed = false;

    const load = async () => {
      const { broadcast: next } = await fetchActiveBroadcastForParent(supabase, parentId);
      if (disposed) return;

      if (next) {
        const confirmed = await findApprovedBroadcastLinkedBooking(
          supabase,
          parentId,
          next.id,
          next.created_at
        );
        if (disposed) return;
        if (confirmed) {
          await markActiveBroadcastFilled(supabase, next.id, parentId);
          if (disposed) return;
          setBroadcast(null);
          setResponseCount(0);
          setReady(true);
          return;
        }
      }

      setBroadcast(next);
      if (next) {
        const count = await countBroadcastResponses(supabase, next.id);
        if (!disposed) setResponseCount(count);
      } else {
        setResponseCount(0);
      }
      if (!disposed) setReady(true);
    };

    void load();

    const poll = window.setInterval(() => {
      void load();
    }, 2500);

    const alertChannel = subscribePostgresChanges(
      supabase,
      `parent-now-alert-${parentId}`,
      {
        event: "*",
        table: "broadcast_alerts",
        filter: `parent_id=eq.${parentId}`,
        handler: () => {
          void load();
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
          void load();
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
          void load();
        }
      }
    );

    return () => {
      disposed = true;
      window.clearInterval(poll);
      removeRealtimeChannel(supabase, alertChannel);
      removeRealtimeChannel(supabase, responseChannel);
      removeRealtimeChannel(supabase, bookingChannel);
    };
  }, [isLoading, parentId, supabase]);

  useEffect(() => {
    if (!broadcast) return;
    const tick = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(tick);
  }, [broadcast?.id]);

  useEffect(() => {
    if (!ready || !broadcast || !onDashboard || onRadar) return;
    if (isBroadcastMinimized()) return;
    if (redirectingRef.current) return;
    redirectingRef.current = true;
    router.replace(broadcastRadarHref(broadcast));
  }, [ready, broadcast, onDashboard, onRadar, router]);

  useEffect(() => {
    redirectingRef.current = false;
  }, [pathname]);

  const showBar = Boolean(broadcast) && ready && !onRadar && !onStart && (
    isBroadcastMinimized() || !onDashboard
  );

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--anynanny-now-dock",
      showBar ? "5.75rem" : "0px"
    );
    return () => {
      document.documentElement.style.setProperty("--anynanny-now-dock", "0px");
    };
  }, [showBar]);

  if (!showBar || !broadcast) {
    return null;
  }

  return (
    <ActiveNowBroadcastBar
      broadcast={broadcast}
      responseCount={responseCount}
      nowMs={nowMs}
      onRestore={() => {
        setBroadcastMinimized(false);
        router.push(broadcastRadarHref(broadcast));
      }}
    />
  );
}
