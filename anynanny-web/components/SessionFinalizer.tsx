"use client";

import { useEffect, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type SessionFinalizerProps = {
  sessionId: string | number;
  /** Optional callback fired after the status is successfully set to "completed". */
  onFinalized?: (sessionId: string | number) => void;
};

type FinalizeState = "idle" | "saving" | "done" | "error";

/**
 * Finalizes a session ("payment_pending" -> "completed") exactly once on mount by
 * calling the secure `finalize_session_after_payment` RPC. The RPC authorizes against
 * auth.uid() and enforces the status gate server-side, so RLS stays strict (Core-Shell).
 * The `hasRun` ref guards against double execution (e.g. React 18 Strict Mode mounting
 * effects twice in development).
 */
export default function SessionFinalizer({ sessionId, onFinalized }: SessionFinalizerProps) {
  const hasRun = useRef(false);
  const [state, setState] = useState<FinalizeState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;

    let cancelled = false;

    async function finalizeSession() {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        if (!cancelled) {
          setState("error");
          setErrorMessage("שירות Supabase אינו מוגדר.");
        }
        return;
      }

      setState("saving");

      const { error } = await supabase.rpc("finalize_session_after_payment", {
        p_session_id: String(sessionId)
      });

      if (cancelled) return;

      if (error) {
        setState("error");
        setErrorMessage(error.message);
        return;
      }

      setState("done");
      onFinalized?.(sessionId);
    }

    void finalizeSession();

    return () => {
      cancelled = true;
    };
  }, [sessionId, onFinalized]);

  if (state === "error") {
    return (
      <div role="alert" dir="rtl">
        שגיאה בסיום המשמרת{errorMessage ? `: ${errorMessage}` : "."}
      </div>
    );
  }

  return null;
}
