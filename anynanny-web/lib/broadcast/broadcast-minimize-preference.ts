/** UI-only. Not the source of truth for whether a broadcast is active. */
const MINIMIZED_KEY = "anynanny_now_minimized";
const MINIMIZED_EVENT = "anynanny-now-minimized";

type Listener = () => void;

const listeners = new Set<Listener>();

function notifyMinimizedListeners(): void {
  listeners.forEach((listener) => {
    listener();
  });
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(MINIMIZED_EVENT));
  }
}

export function isBroadcastMinimized(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(MINIMIZED_KEY) === "1";
  } catch {
    return false;
  }
}

export function setBroadcastMinimized(minimized: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (minimized) {
      sessionStorage.setItem(MINIMIZED_KEY, "1");
    } else {
      sessionStorage.removeItem(MINIMIZED_KEY);
    }
  } catch {
    /* ignore */
  }
  notifyMinimizedListeners();
}

export function subscribeBroadcastMinimized(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  if (typeof window !== "undefined") {
    window.addEventListener(MINIMIZED_EVENT, onStoreChange);
  }
  return () => {
    listeners.delete(onStoreChange);
    if (typeof window !== "undefined") {
      window.removeEventListener(MINIMIZED_EVENT, onStoreChange);
    }
  };
}
