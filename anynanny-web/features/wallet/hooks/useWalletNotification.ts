import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { removeRealtimeChannel } from "@/lib/supabase/subscribe-postgres-changes";
import { walletService } from "../services/walletService";

/**
 * Realtime wallet badge. Subscribes once per userId; AppShellGate keeps BottomNav
 * mounted across parent chrome routes so this effect is not re-armed on navigation.
 */
export function useWalletNotification(userId: string | undefined) {
  const [hasWalletUpdate, setHasWalletUpdate] = useState(false);

  useEffect(() => {
    if (!userId) return;

    const supabase = getSupabaseBrowserClient();
    const channel = walletService.subscribeToBalanceChanges(userId, () => {
      setHasWalletUpdate(true);
    });

    return () => {
      removeRealtimeChannel(supabase, channel);
    };
  }, [userId]);

  return {
    hasWalletUpdate,
    clearWalletNotification: () => setHasWalletUpdate(false)
  };
}
