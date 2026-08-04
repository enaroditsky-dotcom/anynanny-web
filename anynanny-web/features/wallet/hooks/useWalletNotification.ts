"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { removeRealtimeChannel } from "@/lib/supabase/subscribe-postgres-changes";
import { walletService } from "../services/walletService";

const walletStorageKey = (userId: string) => `anynanny_wallet_badge_v1_${userId}`;

function readStoredWalletBadge(userId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(walletStorageKey(userId)) === "1";
  } catch {
    return false;
  }
}

function writeStoredWalletBadge(userId: string, value: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (value) window.sessionStorage.setItem(walletStorageKey(userId), "1");
    else window.sessionStorage.removeItem(walletStorageKey(userId));
  } catch {
    /* ignore */
  }
}

function isWalletRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  return pathname.startsWith("/parent/wallet") || pathname.startsWith("/sitter/wallet");
}

/**
 * Realtime wallet badge. Subscribes once per userId; AppShellGate keeps BottomNav
 * mounted across parent chrome routes so this effect is not re-armed on navigation.
 */
export function useWalletNotification(
  userId: string | undefined,
  role: "parent" | "sitter" = "parent"
) {
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;
  const [hasWalletUpdate, setHasWalletUpdate] = useState(false);

  useEffect(() => {
    if (!userId) {
      setHasWalletUpdate(false);
      return;
    }
    setHasWalletUpdate(readStoredWalletBadge(userId));
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    if (!isWalletRoute(pathname)) return;
    writeStoredWalletBadge(userId, false);
    setHasWalletUpdate(false);
  }, [pathname, userId]);

  useEffect(() => {
    if (!userId) return;

    const supabase = getSupabaseBrowserClient();
    const channel = walletService.subscribeToBalanceChanges(
      userId,
      () => {
        if (isWalletRoute(pathnameRef.current)) return;
        writeStoredWalletBadge(userId, true);
        setHasWalletUpdate(true);
      },
      role
    );

    return () => {
      removeRealtimeChannel(supabase, channel);
    };
  }, [userId, role]);

  return {
    hasWalletUpdate,
    clearWalletNotification: () => {
      if (userId) writeStoredWalletBadge(userId, false);
      setHasWalletUpdate(false);
    }
  };
}
