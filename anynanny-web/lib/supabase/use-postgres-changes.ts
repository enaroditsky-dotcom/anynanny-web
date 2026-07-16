"use client";

import { useEffect, useRef } from "react";
import type { RealtimePostgresChangesPayload, SupabaseClient } from "@supabase/supabase-js";
import {
  removeRealtimeChannel,
  subscribePostgresChanges,
  type PostgresChangesEvent
} from "@/lib/supabase/subscribe-postgres-changes";

type UsePostgresChangesArgs = {
  supabase: SupabaseClient | null;
  /** Stable topic prefix (a unique suffix is appended automatically). */
  topicBase: string | null;
  event?: PostgresChangesEvent;
  table: string;
  schema?: string;
  filter?: string | null;
  /** When false, no subscription is created. */
  enabled?: boolean;
  onPayload: (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void;
  onSubscribed?: () => void;
};

/**
 * React-safe postgres_changes subscription.
 * Handler updates via ref so re-renders do not tear down / recreate the channel.
 * Re-subscribes only when topic/table/filter/enabled identity changes.
 */
export function usePostgresChanges({
  supabase,
  topicBase,
  event = "*",
  table,
  schema = "public",
  filter = null,
  enabled = true,
  onPayload,
  onSubscribed
}: UsePostgresChangesArgs): void {
  const onPayloadRef = useRef(onPayload);
  const onSubscribedRef = useRef(onSubscribed);
  onPayloadRef.current = onPayload;
  onSubscribedRef.current = onSubscribed;

  useEffect(() => {
    if (!supabase || !topicBase || !enabled) return;

    const channel = subscribePostgresChanges(
      supabase,
      topicBase,
      {
        event,
        schema,
        table,
        ...(filter ? { filter } : {}),
        handler: (payload) => onPayloadRef.current(payload)
      },
      (status) => {
        if (status === "SUBSCRIBED") onSubscribedRef.current?.();
      }
    );

    return () => {
      removeRealtimeChannel(supabase, channel);
    };
  }, [supabase, topicBase, event, table, schema, filter, enabled]);
}
