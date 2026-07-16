import type {
  RealtimeChannel,
  RealtimePostgresChangesPayload,
  SupabaseClient
} from "@supabase/supabase-js";

export type PostgresChangesEvent = "*" | "INSERT" | "UPDATE" | "DELETE";

export type PostgresChangesBinding = {
  event: PostgresChangesEvent;
  schema?: string;
  table: string;
  filter?: string;
  handler: (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void;
};

function uniqueTopic(base: string): string {
  const safeBase = base.replace(/[^a-zA-Z0-9_.:-]+/g, "-").slice(0, 120);
  const id =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${safeBase}:${id}`;
}

function bindingConfig(binding: PostgresChangesBinding) {
  return {
    event: binding.event,
    schema: binding.schema ?? "public",
    table: binding.table,
    ...(binding.filter ? { filter: binding.filter } : {})
  };
}

/**
 * Subscribe to postgres_changes with the required Supabase order:
 *   channel(topic).on(...).on(...).subscribe()
 *
 * Always uses a unique topic so `supabase.channel(name)` never returns an
 * already-subscribed channel (which throws if `.on()` is called again).
 *
 * Call `removeRealtimeChannel(supabase, channel)` in effect cleanup.
 */
export function subscribePostgresChanges(
  supabase: SupabaseClient,
  topicBase: string,
  bindings: PostgresChangesBinding | PostgresChangesBinding[],
  onStatus?: (status: string, err?: Error) => void
): RealtimeChannel {
  const list = Array.isArray(bindings) ? bindings : [bindings];
  if (list.length === 0) {
    throw new Error("subscribePostgresChanges requires at least one binding");
  }

  const topic = uniqueTopic(topicBase);
  const first = list[0]!;

  let channel: RealtimeChannel = supabase.channel(topic).on(
    "postgres_changes",
    bindingConfig(first),
    first.handler
  );

  for (let i = 1; i < list.length; i++) {
    const b = list[i]!;
    channel = channel.on("postgres_changes", bindingConfig(b), b.handler);
  }

  return channel.subscribe((status, err) => {
    onStatus?.(status, err ?? undefined);
  });
}

/** Safe cleanup for channels created by {@link subscribePostgresChanges}. */
export function removeRealtimeChannel(
  supabase: SupabaseClient | null | undefined,
  channel: RealtimeChannel | null | undefined
): void {
  if (!supabase || !channel) return;
  void supabase.removeChannel(channel).catch((err) => {
    console.warn("[realtime] removeChannel failed:", err);
  });
}

/** @deprecated Prefer subscribePostgresChanges — kept as alias for older imports. */
export const createPostgresChangesChannel = (
  supabase: SupabaseClient,
  topicBase: string,
  bindings:
    | {
        config: {
          event: PostgresChangesEvent;
          schema?: string;
          table: string;
          filter?: string;
        };
        callback: (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void;
      }
    | {
        config: {
          event: PostgresChangesEvent;
          schema?: string;
          table: string;
          filter?: string;
        };
        callback: (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void;
      }[],
  onStatus?: (status: string, err?: Error) => void
): RealtimeChannel => {
  const list = Array.isArray(bindings) ? bindings : [bindings];
  return subscribePostgresChanges(
    supabase,
    topicBase,
    list.map((b) => ({
      event: b.config.event,
      schema: b.config.schema,
      table: b.config.table,
      filter: b.config.filter,
      handler: b.callback
    })),
    onStatus
  );
};
