/**
 * Decides when a Nanny Talks arrival may play one foreground tone.
 * The first ready snapshot for an account is silent. Later ids play once.
 */
export type BroadcastArrivalChannel = "question" | "broadcast";

export type BroadcastArrivalSoundState = {
  userId: string | null;
  seen: ReadonlySet<string>;
  primedQuestion: boolean;
  primedBroadcast: boolean;
};

export type BroadcastArrivalObservation = {
  userId: string | null;
  channel: BroadcastArrivalChannel;
  ids: readonly string[];
  ready: boolean;
  audible: boolean;
};

export function emptyBroadcastArrivalSound(): BroadcastArrivalSoundState {
  return {
    userId: null,
    seen: new Set<string>(),
    primedQuestion: false,
    primedBroadcast: false
  };
}

function cleanIds(ids: readonly string[]): string[] {
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const value of ids) {
    const id = String(value ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    unique.push(id);
  }
  return unique;
}

function remember(seen: ReadonlySet<string>, keys: readonly string[]): ReadonlySet<string> {
  const next = new Set(seen);
  for (const key of keys) next.add(key);
  return next;
}

export function observeBroadcastArrivals(
  state: BroadcastArrivalSoundState,
  input: BroadcastArrivalObservation
): { state: BroadcastArrivalSoundState; play: boolean } {
  const userId = input.userId?.trim() || null;
  if (!userId) return { state: emptyBroadcastArrivalSound(), play: false };

  const current =
    state.userId === userId
      ? state
      : { ...emptyBroadcastArrivalSound(), userId };
  if (!input.ready) return { state: current, play: false };

  const prefix = input.channel === "question" ? "question:" : "broadcast:";
  const keys = cleanIds(input.ids).map((id) => `${prefix}${id}`);
  const primed = input.channel === "question" ? current.primedQuestion : current.primedBroadcast;
  if (!primed) {
    return {
      state: {
        ...current,
        seen: remember(current.seen, keys),
        primedQuestion: input.channel === "question" ? true : current.primedQuestion,
        primedBroadcast: input.channel === "broadcast" ? true : current.primedBroadcast
      },
      play: false
    };
  }

  const fresh = keys.filter((key) => !current.seen.has(key));
  if (fresh.length === 0 || !input.audible) return { state: current, play: false };
  return {
    state: { ...current, seen: remember(current.seen, fresh) },
    play: true
  };
}
