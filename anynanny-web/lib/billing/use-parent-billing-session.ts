"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchSitterHourlyRate,
  insertPendingSession,
  confirmSessionEndByParent,
  requestSessionEnd
} from "@/lib/billing/session-actions";
import { calculateLiveAmount, calculateLiveMinutes } from "@/lib/billing/session-calculator";
import { getPairedSitterUserId } from "@/lib/session/paired-sitter";
import {
  computeLiveElapsedSecondsActive,
  formatElapsed,
  mapSupabaseRowToProtocol,
  persistSessionState,
  readSessionState,
  SESSIONS_TABLE,
  type SessionProtocolState,
  type SupabaseSessionRow
} from "@/lib/session/protocol";
import { friendlySupabaseSessionError } from "@/lib/session/supabase-errors";
import { resolveBrowserAuth } from "@/lib/supabase/browser-auth";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

function applyRowToState(row: SupabaseSessionRow): SessionProtocolState | null {
  const mapped = mapSupabaseRowToProtocol(row);
  if (!mapped) return null;
  persistSessionState(mapped);
  return mapped;
}

export function useParentBillingSession() {
  const [sessionState, setSessionState] = useState<SessionProtocolState>({ status: "idle" });
  const [parentUserId, setParentUserId] = useState<string | null>(null);
  const [useSupabase, setUseSupabase] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());
  const [banner, setBanner] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState(false);

  const syncFromStorage = useCallback(() => {
    try {
      setSessionState(readSessionState());
    } catch {
      setSessionState({ status: "idle" });
    }
  }, []);

  useEffect(() => {
    const ticker = setInterval(() => setNowMs(Date.now()), 1000);
    syncFromStorage();
    const onStorage = (event: StorageEvent) => {
      if (event.key === "anynanny_payer_session_v1") syncFromStorage();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      clearInterval(ticker);
      window.removeEventListener("storage", onStorage);
    };
  }, [syncFromStorage]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3800);
    return () => window.clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    let cancelled = false;
    void (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const fromSession = sessionData.session?.user ?? null;
      const { data: authData, error: authErr } = await supabase.auth.getUser();
      const resolvedUser = authData.user ?? fromSession;
      if (authErr && !resolvedUser) return;
      if (!resolvedUser || cancelled) return;

      const userId = resolvedUser.id;
      setParentUserId(userId);
      try {
        localStorage.setItem("active_role", "parent");
      } catch {
        /* ignore */
      }

      const { data: row, error: rowErr } = await supabase
        .from(SESSIONS_TABLE)
        .select("*")
        .eq("parent_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!cancelled && !rowErr && row) {
        const mapped = applyRowToState(row as SupabaseSessionRow);
        if (mapped) setSessionState(mapped);
      }
      if (!cancelled) setUseSupabase(true);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !parentUserId) return;

    const sid = sessionState.supabaseSessionId;
    const filter = sid ? `id=eq.${sid}` : `parent_id=eq.${parentUserId}`;
    const channel = supabase.channel(`parent-billing-rt-${parentUserId}-${sid ?? "none"}`);

    const handler = (payload: { new?: Record<string, unknown>; old?: Record<string, unknown> }) => {
      const rowData = (payload.new ?? payload.old) as SupabaseSessionRow | undefined;
      if (!rowData || typeof rowData !== "object") return;
      const mapped = applyRowToState(rowData);
      if (mapped) setSessionState(mapped);
    };

    channel.on("postgres_changes", { event: "*", schema: "public", table: SESSIONS_TABLE, filter }, handler);
    channel.subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [parentUserId, sessionState.supabaseSessionId]);

  const elapsedSeconds = useMemo(() => {
    if (sessionState.status === "parent_initiated") return 0;
    const startedAt = sessionState.parentStartedAtMs;
    if (!startedAt) return 0;
    if (sessionState.status === "active") {
      return computeLiveElapsedSecondsActive({
        startMs: startedAt,
        parentEndRequestedAtMs: sessionState.parentEndRequestedAtMs ?? null,
        nowMs
      });
    }
    return sessionState.finalElapsedSeconds ?? 0;
  }, [nowMs, sessionState]);

  const earnedNis = useMemo(() => {
    const rate = sessionState.hourlyRate ?? 50;
    if (sessionState.status === "active" && sessionState.parentStartedAtMs) {
      const minutes = calculateLiveMinutes({
        startTimeConfirmedBySitter: new Date(sessionState.parentStartedAtMs),
        endTimeRequested: sessionState.parentEndRequestedAtMs
          ? new Date(sessionState.parentEndRequestedAtMs)
          : null,
        now: new Date(nowMs)
      });
      return calculateLiveAmount(minutes, rate).toFixed(2);
    }
    if (sessionState.finalAmountNis != null) {
      return Number(sessionState.finalAmountNis).toFixed(2);
    }
    return ((elapsedSeconds / 3600) * rate).toFixed(2);
  }, [elapsedSeconds, nowMs, sessionState]);

  const timerText = useMemo(() => formatElapsed(elapsedSeconds), [elapsedSeconds]);

  const startShift = useCallback(async () => {
    if (actionPending || sessionState.status === "parent_initiated" || sessionState.status === "active") {
      return;
    }

    const auth = await resolveBrowserAuth();
    if (!auth.ok) {
      setBanner(auth.reason === "no_client" ? "Supabase לא מוגדר." : "יש להתחבר כדי לפתוח משמרת.");
      return;
    }

    const pairedSitterId = getPairedSitterUserId();
    if (!pairedSitterId) {
      setBanner("לא נמצא בייביסיטר מקושר. הגדירו anynanny_paired_sitter_user_id או NEXT_PUBLIC_DEV_SITTER_USER_ID.");
      return;
    }

    const optimistic: SessionProtocolState = { status: "parent_initiated" };
    persistSessionState(optimistic);
    setSessionState(optimistic);
    setParentUserId(auth.userId);
    setActionPending(true);
    setBanner(null);

    try {
      const hourlyRate = await fetchSitterHourlyRate(auth.supabase, pairedSitterId);
      const result = await insertPendingSession(auth.supabase, {
        parentId: auth.userId,
        sitterId: pairedSitterId,
        hourlyRate
      });

      if (!result.ok) {
        persistSessionState({ status: "idle" });
        setSessionState({ status: "idle" });
        setBanner(friendlySupabaseSessionError(result.error));
        return;
      }

      setUseSupabase(true);
      const mapped = applyRowToState(result.row as SupabaseSessionRow);
      if (mapped) {
        setSessionState(mapped);
        setToast("הבקשה נשלחה לבייביסיטר");
      }
    } catch (e) {
      persistSessionState({ status: "idle" });
      setSessionState({ status: "idle" });
      setBanner(friendlySupabaseSessionError(e));
    } finally {
      setActionPending(false);
    }
  }, [actionPending, sessionState.status]);

  const requestEnd = useCallback(async () => {
    if (sessionState.status === "parent_initiated") {
      setBanner("ממתין לאישור הבייביסיטר להתחלת המשמרת.");
      return;
    }
    if (sessionState.status !== "active" || !sessionState.parentStartedAtMs) return;
    if (sessionState.parentEndRequestedAtMs != null) {
      setBanner("כבר נשלחה בקשת סיום — אשרו סיום סופי.");
      return;
    }
    if (!useSupabase || !sessionState.supabaseSessionId) return;

    const auth = await resolveBrowserAuth();
    if (!auth.ok) {
      setBanner(auth.reason === "no_client" ? "Supabase לא מוגדר." : "יש להתחבר כדי לשלוח בקשת סיום.");
      return;
    }

    setActionPending(true);
    const reqAt = new Date().toISOString();
    const optimistic: SessionProtocolState = {
      ...sessionState,
      endRequested: true,
      parentEndRequestedAtMs: new Date(reqAt).getTime()
    };
    persistSessionState(optimistic);
    setSessionState(optimistic);

    try {
      const result = await requestSessionEnd(auth.supabase, sessionState.supabaseSessionId);
      if (!result.ok) {
        setSessionState(sessionState);
        persistSessionState(sessionState);
        setBanner(friendlySupabaseSessionError(result.error));
        return;
      }
      const mapped = applyRowToState(result.row as SupabaseSessionRow);
      if (mapped) {
        setSessionState(mapped);
        setBanner(null);
        setToast("בקשת סיום נשלחה — אשרו סיום סופי");
      }
    } catch (e) {
      setSessionState(sessionState);
      persistSessionState(sessionState);
      setBanner(friendlySupabaseSessionError(e));
    } finally {
      setActionPending(false);
    }
  }, [sessionState, useSupabase]);

  const confirmEnd = useCallback(async () => {
    if (sessionState.status !== "active" || sessionState.parentEndRequestedAtMs == null) return;
    if (!sessionState.supabaseSessionId || !sessionState.parentStartedAtMs) return;

    const auth = await resolveBrowserAuth();
    if (!auth.ok) {
      setBanner(auth.reason === "no_client" ? "Supabase לא מוגדר." : "יש להתחבר כדי לאשר סיום.");
      return;
    }

    setActionPending(true);
    try {
      const result = await confirmSessionEndByParent(auth.supabase, {
        id: sessionState.supabaseSessionId,
        start_time_confirmed_by_sitter: new Date(sessionState.parentStartedAtMs).toISOString(),
        hourly_rate: sessionState.hourlyRate ?? 50
      });

      if (!result.ok) {
        setBanner(friendlySupabaseSessionError(result.error));
        return;
      }

      const mapped = applyRowToState(result.row as SupabaseSessionRow);
      if (mapped) {
        setSessionState(mapped);
        setBanner(null);
        setToast("המשמרת הסתיימה");
      }
    } catch (e) {
      setBanner(friendlySupabaseSessionError(e));
    } finally {
      setActionPending(false);
    }
  }, [sessionState]);

  const sessionRunning =
    sessionState.status === "active" || sessionState.status === "parent_initiated";
  const waitingSitterStart = sessionState.status === "parent_initiated";
  const waitingParentEndConfirm =
    sessionState.status === "active" && sessionState.parentEndRequestedAtMs != null;

  return {
    sessionState,
    sessionRunning,
    waitingSitterStart,
    waitingParentEndConfirm,
    timerText,
    earnedNis,
    banner,
    setBanner,
    toast,
    actionPending,
    startShift,
    requestEnd,
    confirmEnd
  };
}
