"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type ReactNode,
  type SetStateAction
} from "react";
import { useCircleBookingSync } from "@/lib/bookings/use-circle-booking-sync";
import type { TodayBookingShiftGate, TodaysLinkedBookingView } from "@/lib/bookings/todays-linked-booking";
import {
  readSessionState,
  persistSessionState,
  type SessionProtocolState
} from "@/lib/session/protocol";
import type { SupabaseSessionRow } from "@/lib/session/protocol";

export type ParentSessionView = "idle" | "shift" | "review_pay";

export type DashboardRole = "parent" | "sitter";

type BookingCache = {
  booking: TodaysLinkedBookingView | null;
  shiftGate: TodayBookingShiftGate | null;
  ready: boolean;
};

const emptyBookingCache = (): BookingCache => ({
  booking: null,
  shiftGate: null,
  ready: false
});

export type ParentSessionSlice = {
  userId: string | null;
  setUserId: (id: string | null) => void;
  sessionState: SessionProtocolState;
  setSessionState: Dispatch<SetStateAction<SessionProtocolState>>;
  sessionDbStatus: string | null;
  setSessionDbStatus: Dispatch<SetStateAction<string | null>>;
  parentSessionView: ParentSessionView;
  setParentSessionView: Dispatch<SetStateAction<ParentSessionView>>;
  sessionHydrateError: boolean;
  setSessionHydrateError: Dispatch<SetStateAction<boolean>>;
  shiftUiLocked: boolean;
  setShiftUiLocked: Dispatch<SetStateAction<boolean>>;
  bookingShiftRejectedNotice: boolean;
  setBookingShiftRejectedNotice: Dispatch<SetStateAction<boolean>>;
  clientHasSessionUser: boolean | null;
  setClientHasSessionUser: Dispatch<SetStateAction<boolean | null>>;
  /** True after first successful auth/session bootstrap — avoids auth skeleton on remount. */
  bootstrapComplete: boolean;
  setBootstrapComplete: (value: boolean) => void;
  /** True after first session hydrate — avoids idle flash while DB catches up. */
  sessionHydrateComplete: boolean;
  setSessionHydrateComplete: (value: boolean) => void;
  bookingCache: BookingCache;
  patchBookingCache: (patch: Partial<BookingCache>) => void;
  circleBooking: TodaysLinkedBookingView | null;
  bookingRef: MutableRefObject<TodaysLinkedBookingView | null>;
  applyCircleBooking: ReturnType<typeof useCircleBookingSync>["applyCircleBooking"];
  syncFromPayload: ReturnType<typeof useCircleBookingSync>["syncFromPayload"];
  syncFromLinkedBooking: ReturnType<typeof useCircleBookingSync>["syncFromLinkedBooking"];
  shiftCompletedFrozenRef: MutableRefObject<boolean>;
};

export type SitterSessionSlice = {
  sitterId: string | null;
  setSitterId: (id: string | null) => void;
  pendingRow: SupabaseSessionRow | null;
  setPendingRow: Dispatch<SetStateAction<SupabaseSessionRow | null>>;
  activeShiftRow: SupabaseSessionRow | null;
  setActiveShiftRow: Dispatch<SetStateAction<SupabaseSessionRow | null>>;
  endConfirmRow: SupabaseSessionRow | null;
  setEndConfirmRow: Dispatch<SetStateAction<SupabaseSessionRow | null>>;
  completedSummaryRow: SupabaseSessionRow | null;
  setCompletedSummaryRow: Dispatch<SetStateAction<SupabaseSessionRow | null>>;
  bootstrapComplete: boolean;
  setBootstrapComplete: (value: boolean) => void;
  bookingCache: BookingCache;
  patchBookingCache: (patch: Partial<BookingCache>) => void;
  circleBooking: TodaysLinkedBookingView | null;
  applyCircleBooking: ReturnType<typeof useCircleBookingSync>["applyCircleBooking"];
  syncFromPayload: ReturnType<typeof useCircleBookingSync>["syncFromPayload"];
  syncFromLinkedBooking: ReturnType<typeof useCircleBookingSync>["syncFromLinkedBooking"];
  suppressCompletedSummaryIdRef: MutableRefObject<string | null>;
};

export type SessionContextValue = {
  nowMs: number;
  setNowMs: Dispatch<SetStateAction<number>>;
  activeRole: DashboardRole | null;
  setActiveRole: (role: DashboardRole | null) => void;
  parent: ParentSessionSlice;
  sitter: SitterSessionSlice;
  persistParentSession: (next: SessionProtocolState) => void;
};

const SessionContext = createContext<SessionContextValue | undefined>(undefined);

function useParentCircleSync() {
  return useCircleBookingSync("parent");
}

function useSitterCircleSync() {
  return useCircleBookingSync("sitter");
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [nowMs, setNowMs] = useState(0);
  const [activeRole, setActiveRole] = useState<DashboardRole | null>(null);

  const [parentUserId, setParentUserId] = useState<string | null>(null);
  const [sessionState, setSessionState] = useState<SessionProtocolState>({ status: "idle" });
  const [sessionDbStatus, setSessionDbStatus] = useState<string | null>(null);
  const [parentSessionView, setParentSessionView] = useState<ParentSessionView>("idle");
  const [sessionHydrateError, setSessionHydrateError] = useState(false);
  const [shiftUiLocked, setShiftUiLocked] = useState(false);
  const [bookingShiftRejectedNotice, setBookingShiftRejectedNotice] = useState(false);
  const [clientHasSessionUser, setClientHasSessionUser] = useState<boolean | null>(null);
  const [parentBootstrapComplete, setParentBootstrapComplete] = useState(false);
  const [parentSessionHydrateComplete, setParentSessionHydrateComplete] = useState(false);
  const [parentBookingCache, setParentBookingCache] = useState<BookingCache>(emptyBookingCache);
  const shiftCompletedFrozenRef = useRef(false);

  const parentCircle = useParentCircleSync();

  const [sitterId, setSitterId] = useState<string | null>(null);
  const [pendingRow, setPendingRow] = useState<SupabaseSessionRow | null>(null);
  const [activeShiftRow, setActiveShiftRow] = useState<SupabaseSessionRow | null>(null);
  const [endConfirmRow, setEndConfirmRow] = useState<SupabaseSessionRow | null>(null);
  const [completedSummaryRow, setCompletedSummaryRow] = useState<SupabaseSessionRow | null>(null);
  const [sitterBootstrapComplete, setSitterBootstrapComplete] = useState(false);
  const [sitterBookingCache, setSitterBookingCache] = useState<BookingCache>(emptyBookingCache);
  const suppressCompletedSummaryIdRef = useRef<string | null>(null);

  const sitterCircle = useSitterCircleSync();

  useEffect(() => {
    setNowMs(Date.now());
    try {
      setSessionState(readSessionState());
    } catch {
      setSessionState({ status: "idle" });
    }
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const persistParentSession = useCallback((next: SessionProtocolState) => {
    persistSessionState(next);
    setSessionState(next);
  }, []);

  const patchParentBookingCache = useCallback((patch: Partial<BookingCache>) => {
    setParentBookingCache((prev) => ({
      booking: patch.booking !== undefined ? patch.booking : prev.booking,
      shiftGate: patch.shiftGate !== undefined ? patch.shiftGate : prev.shiftGate,
      ready: patch.ready !== undefined ? patch.ready : prev.ready
    }));
  }, []);

  const patchSitterBookingCache = useCallback((patch: Partial<BookingCache>) => {
    setSitterBookingCache((prev) => ({
      booking: patch.booking !== undefined ? patch.booking : prev.booking,
      shiftGate: patch.shiftGate !== undefined ? patch.shiftGate : prev.shiftGate,
      ready: patch.ready !== undefined ? patch.ready : prev.ready
    }));
  }, []);

  const parentSlice = useMemo(
    (): ParentSessionSlice => ({
      userId: parentUserId,
      setUserId: setParentUserId,
      sessionState,
      setSessionState,
      sessionDbStatus,
      setSessionDbStatus,
      parentSessionView,
      setParentSessionView,
      sessionHydrateError,
      setSessionHydrateError,
      shiftUiLocked,
      setShiftUiLocked,
      bookingShiftRejectedNotice,
      setBookingShiftRejectedNotice,
      clientHasSessionUser,
      setClientHasSessionUser,
      bootstrapComplete: parentBootstrapComplete,
      setBootstrapComplete: setParentBootstrapComplete,
      sessionHydrateComplete: parentSessionHydrateComplete,
      setSessionHydrateComplete: setParentSessionHydrateComplete,
      bookingCache: parentBookingCache,
      patchBookingCache: patchParentBookingCache,
      circleBooking: parentCircle.circleBooking,
      bookingRef: parentCircle.bookingRef,
      applyCircleBooking: parentCircle.applyCircleBooking,
      syncFromPayload: parentCircle.syncFromPayload,
      syncFromLinkedBooking: parentCircle.syncFromLinkedBooking,
      shiftCompletedFrozenRef
    }),
    [
      parentUserId,
      sessionState,
      sessionDbStatus,
      parentSessionView,
      sessionHydrateError,
      shiftUiLocked,
      bookingShiftRejectedNotice,
      clientHasSessionUser,
      parentBootstrapComplete,
      parentSessionHydrateComplete,
      parentBookingCache,
      patchParentBookingCache,
      parentCircle
    ]
  );

  const sitterSlice = useMemo(
    (): SitterSessionSlice => ({
      sitterId,
      setSitterId,
      pendingRow,
      setPendingRow,
      activeShiftRow,
      setActiveShiftRow,
      endConfirmRow,
      setEndConfirmRow,
      completedSummaryRow,
      setCompletedSummaryRow,
      bootstrapComplete: sitterBootstrapComplete,
      setBootstrapComplete: setSitterBootstrapComplete,
      bookingCache: sitterBookingCache,
      patchBookingCache: patchSitterBookingCache,
      circleBooking: sitterCircle.circleBooking,
      applyCircleBooking: sitterCircle.applyCircleBooking,
      syncFromPayload: sitterCircle.syncFromPayload,
      syncFromLinkedBooking: sitterCircle.syncFromLinkedBooking,
      suppressCompletedSummaryIdRef
    }),
    [
      sitterId,
      pendingRow,
      activeShiftRow,
      endConfirmRow,
      completedSummaryRow,
      sitterBootstrapComplete,
      sitterBookingCache,
      patchSitterBookingCache,
      sitterCircle
    ]
  );

  const value = useMemo(
    (): SessionContextValue => ({
      nowMs,
      setNowMs,
      activeRole,
      setActiveRole,
      parent: parentSlice,
      sitter: sitterSlice,
      persistParentSession
    }),
    [nowMs, activeRole, parentSlice, sitterSlice, persistParentSession]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error("useSession must be used within SessionProvider");
  }
  return ctx;
}

/** Marks which dashboard role is active (parent vs sitter routes). */
export function SessionRoleBoundary({
  role,
  children
}: {
  role: DashboardRole;
  children: ReactNode;
}) {
  const { setActiveRole } = useSession();

  useEffect(() => {
    setActiveRole(role);
    return () => setActiveRole(null);
  }, [role, setActiveRole]);

  return <>{children}</>;
}

export default SessionProvider;
