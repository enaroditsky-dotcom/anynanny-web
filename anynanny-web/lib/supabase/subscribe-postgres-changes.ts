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

export type PostgresChangesSubscription = {
  /** Latest active channel (may rotate on reconnect). */
  getChannel: () => RealtimeChannel | null;
  /** Stop reconnect loop and remove the active channel. */
  unsubscribe: () => void;
};

type ChannelWithManagedCleanup = RealtimeChannel & {
  __anynannyUnsubscribe?: () => void;
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

function attachBindings(
  supabase: SupabaseClient,
  topic: string,
  list: PostgresChangesBinding[]
): RealtimeChannel {
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

  return channel;
}

/**
 * Only true errors should reconnect.
 * CLOSED fires on intentional removeChannel / unmount — reconnecting it causes
 * infinite `[realtime] reconnecting …` spam (booking-chat / dashboard-live).
 */
const RECOVERABLE_STATUSES = new Set(["CHANNEL_ERROR", "TIMED_OUT"]);

export type SubscribePostgresChangesOptions = {
  /** Max automatic reconnect attempts after CHANNEL_ERROR / TIMED_OUT. Default 5. */
  maxRetries?: number;
  /** Initial backoff ms before first reconnect. Default 1000. */
  initialBackoffMs?: number;
  /** Cap for exponential backoff. Default 20000. */
  maxBackoffMs?: number;
};

/**
 * Subscribe to postgres_changes with the required Supabase order:
 *   channel(topic).on(...).on(...).subscribe()
 *
 * Always uses a unique topic so `supabase.channel(name)` never returns an
 * already-subscribed channel (which throws if `.on()` is called again).
 *
 * Reconnects on CHANNEL_ERROR / TIMED_OUT only. Call `removeRealtimeChannel`
 * (or subscription.unsubscribe) in effect cleanup.
 */
export function subscribePostgresChanges(
  supabase: SupabaseClient,
  topicBase: string,
  bindings: PostgresChangesBinding | PostgresChangesBinding[],
  onStatus?: (status: string, err?: Error) => void,
  options?: SubscribePostgresChangesOptions
): RealtimeChannel {
  const subscription = subscribePostgresChangesManaged(
    supabase,
    topicBase,
    bindings,
    onStatus,
    options
  );
  const channel = subscription.getChannel();
  if (!channel) {
    throw new Error("subscribePostgresChanges failed to create a channel");
  }
  (channel as ChannelWithManagedCleanup).__anynannyUnsubscribe = subscription.unsubscribe;
  return channel;
}

/**
 * Same as {@link subscribePostgresChanges} but returns an explicit unsubscribe handle
 * that survives channel rotation on reconnect.
 */
export function subscribePostgresChangesManaged(
  supabase: SupabaseClient,
  topicBase: string,
  bindings: PostgresChangesBinding | PostgresChangesBinding[],
  onStatus?: (status: string, err?: Error) => void,
  options?: SubscribePostgresChangesOptions
): PostgresChangesSubscription {
  const list = Array.isArray(bindings) ? bindings : [bindings];
  if (list.length === 0) {
    throw new Error("subscribePostgresChanges requires at least one binding");
  }

  const maxRetries = options?.maxRetries ?? 5;
  const initialBackoffMs = options?.initialBackoffMs ?? 1000;
  const maxBackoffMs = options?.maxBackoffMs ?? 20_000;

  let cancelled = false;
  let active: RealtimeChannel | null = null;
  let retryCount = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectInFlight = false;

  const clearRetryTimer = () => {
    if (retryTimer != null) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
  };

  const dropActive = () => {
    if (!active) return;
    const ch = active;
    active = null;
    try {
      void supabase.removeChannel(ch);
    } catch (err) {
      console.warn("[realtime] removeChannel failed:", err);
    }
  };

  const unsubscribe = () => {
    cancelled = true;
    reconnectInFlight = false;
    clearRetryTimer();
    dropActive();
  };

  const scheduleReconnect = (reason: string) => {
    if (cancelled || reconnectInFlight) return;
    if (retryCount >= maxRetries) {
      console.warn(
        `[realtime] giving up after ${maxRetries} reconnects (${topicBase}): ${reason}`
      );
      return;
    }

    reconnectInFlight = true;
    const attempt = retryCount;
    const delay = Math.min(maxBackoffMs, initialBackoffMs * 2 ** attempt);
    retryCount += 1;
    clearRetryTimer();
    console.warn(
      `[realtime] reconnecting ${topicBase} in ${delay}ms (attempt ${retryCount}/${maxRetries}): ${reason}`
    );
    retryTimer = setTimeout(() => {
      retryTimer = null;
      reconnectInFlight = false;
      if (cancelled) return;
      dropActive();
      start();
    }, delay);
  };

  const start = () => {
    if (cancelled) return;

    const topic = uniqueTopic(topicBase);
    const channel = attachBindings(supabase, topic, list);
    active = channel;
    (channel as ChannelWithManagedCleanup).__anynannyUnsubscribe = unsubscribe;

    channel.subscribe((status, err) => {
      // Ignore late callbacks after unmount / intentional removeChannel.
      if (cancelled) return;

      if (status === "SUBSCRIBED") {
        retryCount = 0;
        reconnectInFlight = false;
        onStatus?.(status, err ?? undefined);
        return;
      }

      onStatus?.(status, err ?? undefined);

      if (RECOVERABLE_STATUSES.has(status)) {
        scheduleReconnect(err?.message || status);
      }
    });
  };

  start();

  return {
    getChannel: () => active,
    unsubscribe
  };
}

/** Safe cleanup for channels created by {@link subscribePostgresChanges}. */
export function removeRealtimeChannel(
  supabase: SupabaseClient | null | undefined,
  channel: RealtimeChannel | null | undefined
): void {
  if (!channel) return;
  const managed = (channel as ChannelWithManagedCleanup).__anynannyUnsubscribe;
  if (typeof managed === "function") {
    managed();
    return;
  }
  if (!supabase) return;
  try {
    void supabase.removeChannel(channel);
  } catch (err) {
    console.warn("[realtime] removeChannel failed:", err);
  }
}

/** Cleanup for {@link subscribePostgresChangesManaged}. */
export function removeRealtimeSubscription(
  subscription: PostgresChangesSubscription | null | undefined
): void {
  subscription?.unsubscribe();
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
