"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode
} from "react";
import { useAuth } from "@/components/auth-provider";
import { SitterBroadcastAlertModal } from "@/components/sitter/SitterBroadcastAlertModal";

const SetPausedContext = createContext<(paused: boolean) => void>(() => {});

/**
 * Lets a nested sitter page hide the overlay without owning the
 * realtime listener (e.g. dashboard booking-approval UI).
 */
export function useSitterBroadcastPause(paused: boolean) {
  const setPaused = useContext(SetPausedContext);

  useEffect(() => {
    setPaused(paused);
    return () => setPaused(false);
  }, [paused, setPaused]);
}

/**
 * One Broadcast listener + modal for the authenticated sitter area.
 *
 * Mounted from `app/sitter/layout.tsx` so it survives SPA navigation
 * and is never created for parent/public routes.
 */
export function SitterBroadcastAlertHost({
  children
}: {
  children: ReactNode;
}) {
  const [paused, setPaused] = useState(false);
  const setPausedStable = useCallback((value: boolean) => {
    setPaused(value);
  }, []);

  return (
    <SetPausedContext.Provider value={setPausedStable}>
      {children}
      <SitterBroadcastAlertMount paused={paused} />
    </SetPausedContext.Provider>
  );
}

function SitterBroadcastAlertMount({ paused }: { paused: boolean }) {
  const { isLoading, signedIn, user } = useAuth();
  const sitterId = signedIn && user?.id ? user.id : null;

  if (isLoading || !sitterId) {
    return null;
  }

  return <SitterBroadcastAlertModal sitterId={sitterId} paused={paused} />;
}
